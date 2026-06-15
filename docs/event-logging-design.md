# 이벤트 로깅 설계 — `user_events`

> 작성: 2026-06-14 | 목적: SQL 수동 역산([launch-funnel.sql](launch-funnel.sql)) → **실시간 퍼널 측정**으로 전환
> 관련: [launch-strategy-1pager.md](launch-strategy-1pager.md) (North Star = 주간 첫 발송 완료 사장님 수)
> 상태: **설계** (구현은 별도 PR)

---

## 1. 원칙 (Toss PO)

1. **로깅이 본 기능을 절대 깨면 안 된다.** 모든 로깅은 fire-and-forget — 실패해도 회원가입·발송은 정상 진행. (try/catch로 삼키고, 크리티컬 패스를 블로킹하지 않음)
2. **서버사이드가 source of truth.** 가입/생성/충전/발송 4개 핵심 이벤트는 서버에서 기록(광고차단·JS 오류에 안 흔들림). 클라이언트 이벤트는 *"스텝 안 어디서 막히나"*를 보는 보조용.
3. **하나의 테이블, append-only.** 기존 `admin_logs`·`credit_ledger` 패턴을 그대로 따른다.
4. **이벤트 이름은 퍼널과 1:1.** 분석 쿼리가 곧 1-pager의 §3 퍼널.

---

## 2. 이벤트 분류 (Event Taxonomy)

| event_type | 출처 | 퍼널 단계 | 비고 |
|---|---|---|---|
| `signup_completed` | **서버** | 1. 가입 | users row 최초 생성 시 |
| `template_selected` | 클라 | (생성 내부) | 스텝1 완료 — 어떤 템플릿인지 |
| `targeting_completed` | 클라 | (생성 내부) | 스텝2 완료 — target_count 포함 |
| `campaign_created` | **서버** | 2. 캠페인 생성 | POST /api/campaigns 성공 |
| `credit_purchase_initiated` | 클라 | (충전 직전) | KISPG 결제창 진입 — 결제 이탈 측정 |
| `credit_purchased` | **서버** | 3. 크레딧 충전 | KISPG 콜백 grant 성공 |
| `campaign_sent` | **서버** | 4. 발송 완료 ★ | 크레딧 차감(type='use') 직후 = 활성화 |

> **굵은 4개(서버)** 만으로 1-pager §3 퍼널 전체가 측정된다. 클라 3개는 "생성/충전 단계 *안에서*" 어디가 막히는지 정밀 분석용.

---

## 3. 테이블 스키마

`shared/schema.ts`에 추가 (기존 `creditLedger`/`adminLogs` 스타일):

```typescript
export const userEvents = pgTable(
  "user_events",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").references(() => users.id).notNull(),
    eventType: varchar("event_type", { length: 50 }).notNull(),
    campaignId: varchar("campaign_id").references(() => campaigns.id), // 캠페인 관련 이벤트만
    source: varchar("source", { length: 10 }).default("server"),       // 'server' | 'client'
    eventData: jsonb("event_data"),                                    // 유연한 payload
    idempotencyKey: varchar("idempotency_key", { length: 120 }),       // 중복 방지(콜백 재시도 등)
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_user_events_user_created").on(table.userId, table.createdAt),
    index("idx_user_events_type_created").on(table.eventType, table.createdAt),
    index("idx_user_events_campaign").on(table.campaignId),
    uniqueIndex("uidx_user_events_idempotency").on(table.idempotencyKey),
  ]
);
```

마이그레이션 SQL (`migrations/0002_user_events.sql`):

```sql
CREATE TABLE IF NOT EXISTS user_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id),
  event_type varchar(50) NOT NULL,
  campaign_id varchar REFERENCES campaigns(id),
  source varchar(10) DEFAULT 'server',
  event_data jsonb,
  idempotency_key varchar(120),
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_events_user_created ON user_events(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_user_events_type_created ON user_events(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_user_events_campaign     ON user_events(campaign_id);
CREATE UNIQUE INDEX IF NOT EXISTS uidx_user_events_idempotency ON user_events(idempotency_key);
```

---

## 4. 서버 헬퍼 — `logEvent()`

`src/handlers/_shared/events.ts` (신규):

```typescript
import { drizzle } from 'drizzle-orm/neon-http';
import { userEvents } from '../../../shared/schema';

type LogEventArgs = {
  userId: string;
  eventType: string;
  campaignId?: string | null;
  eventData?: Record<string, unknown>;
  idempotencyKey?: string | null;  // 콜백 재시도 등 중복 방지가 필요할 때만
  source?: 'server' | 'client';
};

/** fire-and-forget. 절대 throw 하지 않는다 — 본 기능을 깨면 안 됨. */
export async function logEvent(db: ReturnType<typeof drizzle>, args: LogEventArgs): Promise<void> {
  try {
    await db.insert(userEvents).values({
      userId: args.userId,
      eventType: args.eventType,
      campaignId: args.campaignId ?? null,
      source: args.source ?? 'server',
      eventData: args.eventData ?? {},
      idempotencyKey: args.idempotencyKey ?? null,
    }).onConflictDoNothing();  // idempotencyKey 충돌 시 무시
  } catch (err) {
    console.error('[logEvent] failed (non-fatal):', args.eventType, err);
  }
}
```

---

## 5. 서버 삽입 지점 (정확한 위치)

| 이벤트 | 파일 | 위치 | 호출 |
|---|---|---|---|
| `signup_completed` | `src/handlers/auth/user.ts` | user 최초 생성 `.returning()` 직후 (≈L138) | `logEvent(db, { userId: auth.userId, eventType: 'signup_completed', eventData: { email: auth.email } })` |
| `campaign_created` | `src/handlers/campaigns/index.ts` | campaign insert `.returning()` 직후 (≈L1394) | `logEvent(db, { userId, eventType: 'campaign_created', campaignId, eventData: { creationMode: data.creationMode, templateId: data.templateId, targetCount: data.targetCount } })` |
| `credit_purchased` | `src/handlers/kispg/callback.ts` | grant 성공 직후 (≈L236) | `logEvent(db, { userId, eventType: 'credit_purchased', idempotencyKey: \`evt:purchase:${tid}\`, eventData: { productType, tid, ordNo } })` ← **tid로 멱등** (콜백 재시도 방어) |
| `campaign_sent` | `src/handlers/campaigns/[id]/start.ts` | `startCampaignCreditsForServerless` (type='use') 성공 직후 | `logEvent(db, { userId, eventType: 'campaign_sent', campaignId, idempotencyKey: \`evt:sent:${campaignId}\`, eventData: { credits: neededCredits } })` ← **campaignId로 멱등** |

> 핵심: KISPG 콜백과 발송은 재시도/중복 호출 가능성이 있으므로 **`idempotencyKey` 필수**. 가입·생성은 자연히 1회라 생략 가능.

---

## 6. 클라이언트 — `trackEvent()` + `POST /api/events`

### 6-1. 클라 헬퍼
`client/src/lib/apiClient.ts`에 추가:

```typescript
/** fire-and-forget. 실패해도 화면 흐름 방해 안 함. */
export function trackEvent(eventType: string, eventData?: Record<string, unknown>): void {
  apiRequest('POST', '/api/events', { eventType, eventData }).catch(() => {});
}
```

### 6-2. 클라 삽입 지점 (`client/src/pages/campaigns-new.tsx`)
- **`template_selected`** — 스텝1 → 스텝2 넘어가는 `setCurrentStep(2)` 지점:
  `trackEvent('template_selected', { templateId, creationMode })`
- **`targeting_completed`** — 스텝2 → 스텝3 넘어가는 지점:
  `trackEvent('targeting_completed', { targetCount })`
- **`credit_purchase_initiated`** — `client/src/pages/billing.tsx`에서 KISPG 결제창 POST 직전:
  `trackEvent('credit_purchase_initiated', { productType })`

### 6-3. 신규 라우트 `POST /api/events`
1. 핸들러 `src/handlers/events/index.ts` 생성 — 기존 핸들러 패턴(`verifyAuth` → `getDb`) 그대로:
   ```typescript
   export default async function handler(req, res) {
     if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
     const auth = await verifyAuth(req);
     if (!auth) return res.status(401).json({ error: 'Unauthorized' });
     const { eventType, eventData } = req.body;
     // 클라 이벤트 화이트리스트만 허용 (서버 권위 이벤트는 클라에서 못 쏘게)
     const ALLOWED = ['template_selected', 'targeting_completed', 'credit_purchase_initiated'];
     if (!ALLOWED.includes(eventType)) return res.status(400).json({ error: 'invalid event' });
     await logEvent(getDb(), { userId: auth.userId, eventType, eventData, source: 'client' });
     return res.status(202).json({ ok: true });
   }
   ```
2. `src/api-router.ts` routes 배열에 등록:
   ```typescript
   import * as events from './handlers/events/index';
   { segments: ['events'], handler: events },
   ```

> **보안 포인트**: 클라가 `campaign_sent` 같은 권위 이벤트를 위조 못 하도록 `/api/events`는 **화이트리스트 3개만** 수용. 핵심 4개는 서버에서만 기록.

---

## 7. 측정 — SQL 역산에서 실시간으로

테이블이 차면 [launch-funnel.sql](launch-funnel.sql)의 복잡한 CTE가 **단순 GROUP BY**로 바뀐다:

```sql
-- 일자별 퍼널 (user_events 단일 테이블)
SELECT date_trunc('day', created_at)::date AS day,
       COUNT(DISTINCT user_id) FILTER (WHERE event_type='signup_completed')  AS signups,
       COUNT(DISTINCT user_id) FILTER (WHERE event_type='campaign_created')  AS created,
       COUNT(DISTINCT user_id) FILTER (WHERE event_type='credit_purchased')  AS charged,
       COUNT(DISTINCT user_id) FILTER (WHERE event_type='campaign_sent')     AS sent
FROM user_events
GROUP BY 1 ORDER BY 1;
```

이후 admin 대시보드(`client/src/pages/admin/analytics.tsx`)에 퍼널 위젯으로 노출.

---

## 8. 롤아웃 순서

1. 마이그레이션 `0002_user_events.sql` 적용 + 스키마 추가
2. `logEvent()` 헬퍼 + 서버 4개 삽입 (가장 중요 — 이것만으로 1-pager 퍼널 완성)
3. `POST /api/events` + `trackEvent()` + 클라 3개 삽입 (스텝 내부 정밀 분석)
4. admin 대시보드 퍼널 위젯
5. (이후) GA/Amplitude 같은 외부 도구가 필요해지면 같은 이벤트 스키마를 그대로 전송

> 2번까지만 해도 "장님 상태"는 완전히 해제된다. 3~4는 정밀도 향상.

---

## 9. 개인정보 / 운영 메모

- `event_data`에 **전화번호·메시지 본문 같은 PII 저장 금지.** id·count·type 등 메타데이터만.
- append-only. 보존기간 정책(예: 13개월 후 집계 후 파기) 별도 합의.
- 멱등키는 `evt:<용도>:<자연키>` 컨벤션 (credit_ledger의 idempotency_key와 동일 철학).
```
