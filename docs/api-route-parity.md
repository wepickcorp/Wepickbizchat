# API Route Parity Checklist

이 문서는 로컬 개발 서버, Express 서버 라우트, 서버리스 라우터가 같은 정책을 보는지 확인하기 위한 점검표다.

## 핵심 원칙

- 사용자 화면이 호출하는 API는 `server/routes.ts`와 `src/api-router.ts` 양쪽에 존재해야 한다.
- 로컬 전용 API는 `server/localApiRouter.ts`에만 둘 수 있지만, 상용 기능을 대체하면 안 된다.
- 로컬 전용 API는 Express 개발 서버에서도 `NODE_ENV=development`와 `REPL_ID=local-dev`가 모두 맞을 때만 켠다.
- 돈, 크레딧, 발송 상태를 바꾸는 API는 idempotency key와 서버 검증을 가져야 한다.
- `api/router.js`는 `script/build.ts` 빌드 결과물이라 배포 전 반드시 갱신 여부를 확인한다.
- 서버리스 라우터는 같은 길이의 라우트가 여러 개 맞을 때 정적 segment가 많은 라우트를 우선한다. 예: `/api/templates/approved`가 `/api/templates/:id`로 오인되면 안 된다.

## 사용자 크레딧 API

| API | Express | Serverless | Local Override | 상태 |
| --- | --- | --- | --- | --- |
| `GET /api/credits/policy` | `server/routes.ts` | `src/handlers/credits/policy.ts` | 없음 | 맞춤 |
| `GET /api/credits/summary` | `server/routes.ts` | `src/handlers/credits/summary.ts` | 없음 | 맞춤 |
| `POST /api/credits/estimate` | `server/routes.ts` | `src/handlers/credits/estimate.ts` | 없음 | 맞춤 |
| `POST /api/credits/dev-grant` | `server/routes.ts` | 없음 | 없음 | 로컬/개발 전용 |
| `GET /api/admin/users/:userId/credits` | 없음 | `src/handlers/admin/users/[userId]/credits.ts` | `server/localApiRouter.ts` | 운영 조회용 |
| `POST /api/admin/users/:userId/credits` | 없음 | `src/handlers/admin/users/[userId]/credits.ts` | `server/localApiRouter.ts` | 운영 조정용 |

주의:

- `dev-grant`는 개발 편의 API다. 상용 서버리스에는 만들지 않는다.
- 서버리스 `summary`는 크레딧 장부가 없으면 `users.balance`를 fallback으로 내려준다.
- 관리자 크레딧 조회는 사용자별 잔여 크레딧 묶음과 최근 장부 확인용이다.
- 관리자 크레딧 조정은 `adjustment` 장부와 `credit_adjust` 운영 로그를 남긴다.
- 수동 차감은 만료일이 빠른 크레딧 묶음부터 소진하며, 잔여 크레딧보다 큰 차감은 거부한다.

## 결제/충전 API

| API | Express | Serverless | Local Override | 상태 |
| --- | --- | --- | --- | --- |
| `POST /api/transactions/charge` | `server/routes.ts` | `src/handlers/transactions/charge.ts` | 없음 | 레거시/개발용 |
| `POST /api/kispg/auth` | 서버리스 라우터 중심 | `src/handlers/kispg/auth.ts` | 없음 | 맞춤 |
| `GET/POST /api/kispg/callback` | 서버리스 라우터 중심 | `src/handlers/kispg/callback.ts` | 없음 | 맞춤 |
| `POST /api/stripe/checkout` | `server/routes.ts` | `src/handlers/stripe/checkout.ts` | 없음 | 맞춤 |
| `POST /api/stripe/webhook` | `server/index.ts` raw route | `src/handlers/stripe/webhook.ts` | 없음 | 로직 맞춤, 실결제 테스트 필요 |

주의:

- Stripe webhook은 raw body가 중요하다. Express와 서버리스의 body 처리 방식이 다르므로 배포 전 실제 webhook 테스트가 필요하다.
- KISPG/Stripe 크레딧 지급은 `CREDIT_MODE_ENABLED=true`에서만 `credit_grants`, `credit_ledger`를 쓴다.
- 라이트 월 1회 제한은 결제 시작 전과 지급 직전에 모두 확인한다. 결제 시작 전 검사는 KISPG/Stripe가 공통 `hasLightCreditGrantInCurrentKstMonthForServerless` 기준을 사용하고, 지급 직전 검사는 `grantPurchasedCreditsForServerless`가 다시 막는다.
- KISPG callback은 결제 거래가 이미 있어도 크레딧 지급 원장이 없으면 다시 지급을 시도한다.
- KISPG 크레딧 지급 실패 시 성공 페이지로 넘기지 않고 결제 처리 오류로 보낸다.
- Stripe webhook은 결제 거래가 이미 있어도 크레딧 지급 원장이 없으면 다시 지급을 시도한다.
- Stripe 크레딧 지급 실패 시 성공 응답으로 삼키지 않고 webhook 재시도를 유도한다.

## 캠페인 API

| API | Express | Serverless | Local Override | 상태 |
| --- | --- | --- | --- | --- |
| `GET /api/campaigns` | `server/routes.ts` | `src/handlers/campaigns/index.ts` | 없음 | 맞춤 |
| `POST /api/campaigns` | `server/routes.ts` | `src/handlers/campaigns/index.ts` | 없음 | 맞춤 |
| `POST /api/campaigns/test-create` | `server/routes.ts` | `src/handlers/campaigns/test-create.ts` | 없음 | 맞춤 |
| `GET/PATCH/DELETE /api/campaigns/:id` | `server/routes.ts` | `src/handlers/campaigns/[id].ts` | 없음 | 맞춤 |
| `POST /api/campaigns/:id/submit` | `server/routes.ts` | `src/handlers/campaigns/[id]/submit.ts` | 없음 | 맞춤 |
| `POST /api/campaigns/:id/cancel` | `server/routes.ts` | `src/handlers/campaigns/[id]/cancel.ts` | 없음 | 맞춤 |
| `POST /api/campaigns/:id/fail` | `server/routes.ts` | `src/handlers/campaigns/[id]/fail.ts` | 없음 | 맞춤 |
| `POST /api/campaigns/:id/stop` | `server/routes.ts` | `src/handlers/campaigns/[id]/stop.ts` | 없음 | 맞춤 |
| `POST /api/campaigns/:id/start` | `server/routes.ts` | `src/handlers/campaigns/[id]/start.ts` | 없음 | 맞춤 |

주의:

- `CREDIT_MODE_ENABLED=true`에서는 생성 시점에도 최소 1,000건과 필요 크레딧 보유 여부를 검증한다.
- 로컬 전체 검증 `/api/local/verify-credit-all`은 캠페인 생성 정책도 함께 확인한다. 미승인 템플릿 차단, 타 사용자 템플릿 차단, 시스템 템플릿 허용, 1,000건/2,000C 정책을 깨뜨리면 실패한다.
- 크레딧 장부가 없으면 기존 `users.balance`를 fallback으로 보고, 장부가 생긴 뒤에는 `credit_grants.remaining_credits`를 기준으로 판단한다.
- 프론트 `campaign-detail.tsx`는 `/api/campaigns/:id/start`를 호출한다.
- 서버리스 `start`는 외부 BizChat 캠페인을 다시 생성/수정하지 않고, 승인된 캠페인의 앱 내부 발송 시작과 크레딧 `use` 전환만 처리한다.
- 예약 크레딧이 있으면 추가 차감 없이 `reserve -> use` 원장을 남긴다.
- 예약 크레딧이 없으면 만료일이 빠른 크레딧부터 직접 차감한다.

## BizChat Callback API

| API | Express | Serverless | Local Override | 상태 |
| --- | --- | --- | --- | --- |
| `POST /api/bizchat/callback/state` | 없음 | `src/handlers/bizchat/callback/state.ts` | 없음 | 크레딧 모드 보강 |

주의:

- `CREDIT_MODE_ENABLED=true`에서 BizChat 상태 `17`, `25`는 승인 전 종료 상태로 보고 예약 크레딧을 해제한다.
- BizChat 상태 `35`, `40`은 발송 종료 상태로 보고 callback payload의 정산/성공 count가 있을 때만 미처리 잔여분을 복구한다.
- count는 top-level 또는 `data` 안의 `settleCnt`, `settleCount`, `successCnt`, `successCount`, `succCnt`를 읽는다. `settleCnt`/`settleCount`가 있으면 성공 count보다 우선한다.
- count가 없으면 자동 복구하지 않는다. 실제 발송사 callback count가 없는 상태에서 기존 캠페인 count만으로 복구하면 과복구 위험이 있다.
- 전액 미처리면 `SKT 접수 실패 복구`, 일부 미처리면 `잔여 발송분 복구` 장부로 남긴다.
- callback 응답은 staging 확인을 위해 `observedCounts`, `creditAction`을 포함한다.
- 실제 상용 연결 전 staging에서 BizChat callback payload의 count 필드명을 확인해야 한다.

## 환불 API

| API | Express | Serverless | Local Override | 상태 |
| --- | --- | --- | --- | --- |
| `GET /api/refunds` | `server/routes.ts` | `src/handlers/refunds/index.ts` | 없음 | 맞춤 |
| `POST /api/refunds` | `server/routes.ts` | `src/handlers/refunds/index.ts` | 없음 | 맞춤 |
| `GET /api/admin/refunds` | 서버리스 라우터 중심 | `src/handlers/admin/refunds/index.ts` | `server/localApiRouter.ts` | 맞춤 |
| `POST /api/admin/refunds/:id/process` | 서버리스 라우터 중심 | `src/handlers/admin/refunds/[id]/process.ts` | `server/localApiRouter.ts` | 맞춤 |

주의:

- 로컬 관리자 환불 API는 Docker Postgres E2E를 위해 `server/localApiRouter.ts`에 보강되어 있다.
- 완료 처리 시 `refund-complete:{refundId}` idempotency key로 중복 차감을 막는다.
- 환불 금액은 상품별 원/C 단가로 환산해 잔여 크레딧에서 차감한다.
- 로컬 전체 검증 `/api/local/verify-credit-all`은 관리자 환불 완료와 수동 조정도 확인한다. 환불 중복 완료, 환불 가능 금액 부족, 조정 키 누락, 조정 중복 요청, 초과 차감, 관리자 로그 기록을 깨뜨리면 실패한다.

## 템플릿 API

| API | Express | Serverless | Local Override | 상태 |
| --- | --- | --- | --- | --- |
| `GET /api/templates/approved` | `server/routes.ts` | `src/handlers/templates/approved.ts` | 없음 | 맞춤 |
| `GET/PATCH/DELETE /api/templates/:id` | `server/routes.ts` | `src/handlers/templates/[id].ts` | 없음 | 맞춤 |
| `POST /api/templates/:id/submit` | `server/routes.ts` | `src/handlers/templates/[id]/submit.ts` | 없음 | 맞춤 |
| `POST /api/templates/:id/approve` | `server/routes.ts` | `src/handlers/templates/[id]/approve.ts` | 없음 | 맞춤 |
| `POST /api/templates/:id/reject` | `server/routes.ts` | `src/handlers/templates/[id]/reject.ts` | 없음 | 맞춤 |

주의:

- 캠페인 생성은 승인 템플릿만 선택해야 한다.
- 서버에서도 캠페인 생성 시 템플릿 승인 상태를 검증해야 한다.
- `/api/templates/approved`는 `/api/templates/:id`보다 구체적인 라우트로 매칭되어야 한다.
- 추천 템플릿 원본처럼 `user_id = 'system'`인 템플릿은 모든 사용자가 캠페인 생성에 사용할 수 있다.
- `/api/templates/approved`도 사용자 승인 템플릿과 `system` 승인 템플릿을 함께 내려준다.
- RCS 템플릿은 RCS 본문과 일반 LMS fallback 본문을 모두 가져야 한다.
- 템플릿 제목은 BizChat 규격에 맞춰 30자 이하로 제한한다.
- RCS 버튼 type은 `0`, `1`, `2`만 허용한다.

## 발신번호/발송 전 검수

| 항목 | 상태 |
| --- | --- |
| 캠페인 `sndNum` | 실제 전화번호가 아니라 BizChat 발신번호 코드 `id/code` 사용 |
| 발신번호 목록 | 승인 상태 `state === 1`만 캠페인 선택지로 사용 |
| 테스트 발송 | 승인 템플릿만 허용 |
| 캠페인 생성 | 승인 템플릿만 허용 |
| 캠페인 발송 시작 | 승인 완료 캠페인만 허용 |

주의:

- 로컬 전체 검증 `/api/local/verify-credit-all`은 템플릿/발신번호/발송 전 검수도 확인한다. RCS fallback 누락, 제목 길이 초과, 잘못된 버튼 type, 미승인/타 사용자 템플릿 사용, 발신번호 코드 정책이 깨지면 실패한다.

## 추천 템플릿 API

| API | Express | Serverless | Local Override | 상태 |
| --- | --- | --- | --- | --- |
| `GET /api/recommended-templates` | `server/routes.ts` | `src/handlers/recommended-templates/index.ts` | `server/localApiRouter.ts` | 맞춤 |
| `GET /api/recommended-templates/filters` | `server/routes.ts` | `src/handlers/recommended-templates/filters.ts` | `server/localApiRouter.ts` | 맞춤 |
| `GET /api/recommended-templates/:id` | `server/routes.ts` | `src/handlers/recommended-templates/[id].ts` | `server/localApiRouter.ts` | 맞춤 |

주의:

- `/api/recommended-templates/filters`는 `/api/recommended-templates/:id`보다 구체적인 라우트로 매칭되어야 한다.

## 다음 보강 후보

1. 서버리스 `campaigns/index.ts`의 캠페인 생성 검증과 Express 검증 차이 비교
2. 결제 webhook 실제 raw body 검증
3. BizChat 실제 callback payload count 필드 staging 검증
