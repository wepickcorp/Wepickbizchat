# wepick x SKT 비즈챗 (BizChat) 광고 관리 플랫폼

## Overview
wepick x SKT BizChat is an advertising management platform for sending SMS/MMS/RCS campaigns to 16 million SK Telecom customers who have consented to receive advertisements. It enables small business owners to create campaigns with a minimum budget of ₩100,000, leveraging SK CoreTarget for effective, targeted advertising. The platform handles campaign creation, targeting, billing, and performance reporting.

## User Preferences
- Korean language (한국어) for all UI text
- 당근마켓-inspired friendly UX writing tone
- Light mode only
- Mobile-responsive design

## System Architecture
The project utilizes a modern web stack with React 18, TypeScript, and Vite for the frontend, and Vercel Serverless Functions for the backend. Data is managed with PostgreSQL (Neon) via Drizzle ORM, and authentication is handled by Supabase Auth (JWT-based). The UI is built using shadcn/ui, Tailwind CSS, and Lucide Icons, with TanStack Query v5 for state management and Wouter for routing. Deployment is managed through Vercel.

**Key Features:**
- **Landing Page**: Introduction to the SKT BizChat service with a login call-to-action.
- **Auth Page**: User authentication via Supabase email/password.
- **Dashboard**: Overview of campaigns, statistics, and quick actions.
- **Template System**: Workflow for creating, submitting, approving, and rejecting message templates.
- **Campaign Wizard**: A 3-step process for campaign creation (template selection, targeting, budget).
- **Campaign Management**: List, filter, search, and manage advertising campaigns.
- **Billing**: Balance charging and transaction history, integrated with Stripe.
- **Reports**: Analytics and performance metrics for campaigns.
- **AI Features**: Generate ad copy, validate content, and request Goeonyeon (고언연) inspection.

**UI/UX Decisions:**
- **Primary Color**: SKT Red (#E84040).
- **Font**: Pretendard Variable.
- **Border Radius**: 8px (rounded-lg).

**System Design Choices:**
- Vercel Serverless Functions for scalable backend logic.
- Supabase for robust authentication and user management.
- Drizzle ORM for type-safe database interactions.
- BizChat API integration for core advertising functionality, including campaign creation, approval, and real-time statistics, with strict adherence to BizChat API v0.29.0 specifications.
- **BizChat RCS API 규격**: RCS 메시지 전송 시 `rcs[]` 배열 내 각 슬라이드 객체에 `opts` 필드가 필수입니다. 옵션이 없더라도 빈 객체 `opts: {}`를 포함해야 E100038 오류가 발생하지 않습니다.
- **BizChat Geofence(Maptics) 캠페인**: rcvType=1(실시간) 또는 rcvType=2(모아서보내기) 캠페인은 `sndGeofenceId`가 필수입니다. 캠페인 제출 시 targeting 테이블의 geofenceIds를 조회하여 BizChat `/api/v1/maptics/geofences/save` API를 호출하고, 반환된 ID를 sndGeofenceId로 사용합니다. 한 번 생성된 sndGeofenceId는 campaigns.snd_geofence_id 컬럼에 저장되어 재사용됩니다.
  - **데이터 수집 일시 필수 필드**: rcvType=1/2 캠페인은 `collStartDate`(수집 시작), `collEndDate`(수집 종료) 필드가 필수입니다. rcvType=2는 추가로 `collSndDate`(발송 시작)도 필요합니다. 값이 없으면 발송 시작일 기준으로 기본값이 자동 설정됩니다 (collStartDate=발송일-1일, collEndDate=발송일).
  - **E100015 오류 방지 (rcvType=1)**: 실시간 발송 캠페인은 BizChat 규칙 `collStart ≤ rtStart ≤ rtEnd ≤ collEnd`를 충족해야 합니다. 시스템은 `collStartDate = rtStartHhmm`, `collEndDate = rtEndHhmm + 30분`으로 자동 계산합니다. 자정 넘김(예: 23:00~01:00)은 rtEnd에 24시간을 추가하여 처리합니다. rtStartHhmm/rtEndHhmm 파싱 시 non-digit 문자를 제거하여 "15:00"과 "1500" 모두 지원합니다.
- **BizChat API 환경 설정**: 개발 완료 전까지 모든 API 호출은 개발 URL(gw-dev.bizchat1.co.kr:8443)로 전송됩니다. `BIZCHAT_USE_PROD=true` 환경변수를 설정해야만 운영 API를 사용합니다.
- **KIS PG 환경 설정**: 기본값으로 테스트 API(testapi.kispg.co.kr)를 사용합니다. `KISPG_USE_PROD=true` 환경변수를 설정해야만 운영 API(api.kispg.co.kr)를 사용합니다. `KISPG_RETURN_URL` 환경변수로 콜백 URL을 명시적으로 지정할 수 있습니다 (예: `https://bizchat.wepick.kr/api/kispg/callback`). **해시 생성 방식**: `SHA256(mid + ediDate + goodsAmt + merchantKey)` - merchantKey는 Base64 디코딩 없이 원본 문자열 그대로 사용.
- **마스터 계정 시스템**: `is_master=true`로 설정된 계정은 매일 자정(UTC) Vercel Cron Job에 의해 광고 캐시가 1억원(100,000,000원)으로 자동 리셋됩니다. 현재 마스터 계정: campaign@wepick.kr. `CRON_SECRET` 환경변수로 Cron API 보안 적용.
- **관리자 시스템**: 별도의 관리자 인증 체계와 대시보드를 통해 플랫폼 운영을 관리합니다.
  - **관리자 로그인**: `/admin/login` - SHA256 해시 기반 비밀번호 인증
  - **관리자 계정**: admin2026@wepick.co.kr / admin1234 (super 권한)
  - **권한 체계**: super (전체 권한), cs (고객지원), finance (재무)
  - **환경변수**: `ADMIN_JWT_SECRET`, `ADMIN_SALT`
  - **기능**: 대시보드(/admin), 유저관리(/admin/users), 캠페인모니터링(/admin/campaigns), 결제내역(/admin/transactions), 활동로그(/admin/logs)
  - **대리 로그인(Impersonation)**: CS/super 관리자가 고객지원을 위해 특정 사용자로 로그인할 수 있는 기능
    - **토큰 구조**: Base64 인코딩된 JSON `{ data: string, signature: string }`. data는 `{ userId, adminId, type: 'impersonate', exp }` 포함
    - **서명 방식**: HMAC-SHA256(data, ADMIN_JWT_SECRET)
    - **유효기간**: 30분 (클라이언트에서 60초마다 검증)
    - **요청 헤더**: `X-Impersonate-Token`, `X-Impersonate-User-Id` 동시 전송 필요
    - **만료 처리**: 토큰 만료 시 `/auth?expired=impersonate`로 리다이렉트
    - **지원 API 목록**:
      - Express 라우트: server/replitAuth.ts (모든 Express API 라우트)
      - Vercel 서버리스:
        - api/auth/user.ts
        - api/dashboard/stats.ts
        - api/templates/index.ts, api/templates/[id].ts
        - api/campaigns/index.ts, api/campaigns/[id]/submit.ts, api/campaigns/[id]/cancel.ts, api/campaigns/[id]/stop.ts
        - api/targeting/estimate.ts
        - api/transactions/index.ts, api/transactions/charge.ts
        - api/bizchat/*.ts (ai, ats, campaigns, file, maptics, mdn-upload, sender, stats, template)
        - api/bizchat/reports/*.ts (area, gender-age, period)
- Elimination of local sender number CRUD in favor of BizChat-managed sender numbers.

## External Dependencies
- **SKT BizChat 3rd Party API**: For sending SMS/MMS/RCS advertisements, managing campaigns, ATS target audience estimation, file uploads (MMS images), sender number management, template management, and AI features.
- **Supabase**: Authentication and user management.
- **PostgreSQL (Neon)**: Main database.
- **Stripe**: Payment processing for balance charging.
- **Vercel**: Deployment and serverless function hosting.
- **Kakao Maps JavaScript SDK**: 지오펜스 타겟팅 지도 시각화. `VITE_KAKAO_MAP_KEY` 환경변수로 API 키 설정. Vercel 배포 시 해당 도메인을 카카오 개발자 콘솔에서 허용해야 합니다.