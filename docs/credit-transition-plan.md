# Credit-Based Campaign Transition Plan

## 1. 목적

현재 Wepick BizChat은 `balance`, `budget`, `costPerMessage`, `transactions`를 중심으로 잔액/예산 기반 흐름을 가지고 있다. 이번 개편의 목적은 기존 상용 기능을 보존하면서, 사용자가 모든 캠페인 발송 판단을 크레딧 기준으로 이해하도록 전환하는 것이다.

핵심 UX 기준:

- 현재 보유 크레딧
- 필요한 크레딧
- 예약된 크레딧
- 사용된 크레딧
- 부족한 크레딧
- 발송 가능 여부

이번 전환은 단순 UI 리디자인이 아니라 DB, 서버 정책, 결제/환불, 캠페인 상태, 프론트 UX를 함께 바꾸는 도메인 전환이다.

## 2. 확정 정책

### 2.1 상품 정책

| product_type | 상품명 | 가격 | 제공 크레딧 | 문자 환산 | 고객 단가 | 구매 제한 |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| light | 라이트 충전 | 100,000원 | 2,000C | 1,000건 | 100원/건 | 월 1회 |
| topup | 추가 충전 | 100,000원 | 1,200C | 600건 | 약 167원/건 | 제한 없음 |
| booster | 부스터 패키지 | 500,000원 | 7,000C | 3,500건 | 약 143원/건 | 제한 없음 |
| enterprise | 엔터프라이즈 패키지 | 1,000,000원 | 16,000C | 8,000건 | 125원/건 | 제한 없음 |

### 2.2 사용 정책

| 항목 | 정책 |
| --- | --- |
| 무료 가입 크레딧 | 없음 |
| 문자 1건 | 2C |
| SKT 정산비 | 70원/건 |
| 최소 발송 | 템플릿 1개당 1,000건 |
| 최소 필요 크레딧 | 템플릿 1개당 2,000C |
| 기능 제한 | 없음, 전체 기능 사용 가능 |
| 리포트 | 전체 상품 동일 |
| 크레딧 유효기간 | 12개월 |
| 라이트 구매 제한 | KST 기준 매월 1일 00:00부터 말일 23:59까지 계정당 1회 |
| 차감 기준 | 발송 버튼 이후 실제 발송 단계에서 차감 |
| 환불 기준 | 잔여 크레딧 기준 가안 |
| 소진 순서 | 먼저 만료되는 크레딧부터 소진 |
| 만료 크레딧 환불 | 불가 |

### 2.3 크레딧 정의

`1C = 1원`이 아니다. 크레딧은 내부 발송권 단위다.

기본 계산식:

```txt
필요 크레딧 = 발송 건수 * 2C
최소 발송 건수 = 템플릿 수 * 1,000건
최소 필요 크레딧 = 템플릿 수 * 2,000C
```

현재 캠페인 모델은 기본적으로 캠페인 1개에 템플릿 1개가 연결되므로, 1차 적용은 다음 기준으로 진행한다.

```txt
캠페인 1개 = 템플릿 1개 = 최소 1,000건 = 최소 2,000C
```

## 3. 기존 코드 상태

### 3.1 현재 잔액 구조

현재 코드에는 이미 다음 구조가 있다.

- `users.balance`
- `transactions`
- `campaigns.budget`
- `campaigns.costPerMessage`

다만 금액/잔액/예산 표현이 섞여 있고, 단가 계산도 여러 위치에 흩어져 있다.

확인된 문제:

- 캠페인 생성 서버 체크는 `targetCount * 50`을 사용한다.
- `shared/schema.ts`의 메시지 단가는 LMS 100, MMS 120, RCS 100이다.
- 프론트 캠페인 생성 화면에서는 RCS 130으로 계산된다.
- 캠페인 상세 발송 시작은 `campaign.costPerMessage || "50"`을 사용한다.
- 프론트 문구는 `잔액`, `예산`, `비용` 중심이다.

크레딧 전환 시 단가 계산은 반드시 한 곳으로 통합해야 한다.

### 3.2 현재 발송 버튼 흐름

캠페인 상세 화면:

```txt
승인 완료 상태
→ 발송 시작 버튼
→ POST /api/campaigns/:id/start
→ 잔액 확인
→ 잔액 차감
→ usage transaction 생성
→ running 상태
→ 10초 후 completed 시뮬레이션
```

캠페인 목록 화면:

```txt
즉시 발송/예약 발송 UI
→ POST /api/campaigns/:id/submit
→ 실제 발송이 아니라 승인 요청 상태로 변경
```

현재 문제:

- 목록 화면의 "발송" 표현과 실제 API 동작이 다르다.
- 상세 화면의 `start`는 차감/발송 시뮬레이션까지 수행한다.
- 예약 발송은 UI와 `scheduledAt` 저장은 있으나, 예약 크레딧 홀딩 구조는 없다.

## 4. 목표 상태

### 4.1 캠페인 상태 흐름

권장 흐름:

```txt
초안
→ 검수 요청
→ 승인 완료
→ 발송 예약 또는 즉시 발송
→ 발송 준비
→ 발송 중
→ 발송 완료
```

크레딧 흐름:

```txt
캠페인 생성: 차감 없음
검수 요청: 차감 없음
승인 완료: 차감 없음
예약 발송: 크레딧 예약
예약 취소: 예약 크레딧 해제
실제 발송 시작: 예약 크레딧을 사용 크레딧으로 전환
즉시 발송: 사용 크레딧으로 바로 차감
내부 오류/SKT 접수 실패: 차감하지 않거나 복구
```

### 4.2 실패 처리

실패는 세 종류로 분리한다.

| 실패 유형 | 예시 | 크레딧 처리 |
| --- | --- | --- |
| 내부 시스템 실패 | 서버 오류, 발송 요청 자체 실패 | 차감 없음 또는 전액 복구 |
| SKT 접수 실패 | SKT API 거절, 포맷/정책 오류 | 차감 없음 또는 전액 복구 |
| 부분 접수/부분 실패 | 일부 건만 SKT 접수 또는 처리 | 미처리 잔여분만 복구 |
| 수신 실패 | 번호 오류, 단말/통신 상태 실패 | SKT 정산 발생 건은 사용 처리 유지 |

1차 정책 문구:

```txt
크레딧은 발송 요청 성공 시 사용 처리한다.
내부 시스템 오류 또는 SKT 접수 실패로 실제 발송이 시작되지 않은 건은 차감하지 않거나 복구한다.
일부만 접수/처리된 경우에는 처리되지 않은 잔여 발송분만 복구한다.
복구 총액은 캠페인의 실제 사용 크레딧을 넘을 수 없다.
```

## 5. DB 설계안

### 5.1 기존 컬럼 유지 원칙

상용 서비스 안정성을 위해 기존 `users.balance`, `transactions`, `campaigns.budget`을 즉시 제거하지 않는다.

1차 마이그레이션은 추가형으로 진행한다.

- 기존 데이터 보존
- 기존 API 호환 유지
- 신규 크레딧 필드 병행
- 충분히 검증 후 화면/문구 전환
- 마지막 단계에서 레거시 필드 정리 검토

### 5.2 권장 테이블

#### credit_products

상품 정책을 코드 상수로만 둘 수도 있지만, 운영 변경 가능성을 고려하면 테이블화가 더 안전하다.

```txt
id
product_type: light | topup | booster | enterprise
name
price_krw
credits
message_count
unit_price_krw
monthly_limit_count
is_active
sort_order
created_at
updated_at
```

#### credit_grants

충전된 크레딧 묶음. 유효기간과 선입선출 소진을 위해 필요하다.

```txt
id
user_id
product_type
transaction_id
original_credits
remaining_credits
purchased_at
expires_at
created_at
updated_at
```

#### credit_ledger

모든 크레딧 변동 내역. 정산/감사/복구를 위해 필요하다.

```txt
id
user_id
campaign_id nullable
credit_grant_id nullable
transaction_id nullable
type:
  grant
  reserve
  release
  use
  refund
  expire
  adjustment
amount_credits
balance_after_credits
product_type
description
idempotency_key
metadata
created_at
```

#### campaign_credit_summary

캠페인별 크레딧 상태를 빠르게 보여주기 위한 요약. 컬럼을 `campaigns`에 직접 추가해도 된다.

```txt
campaign_id
estimated_credits
reserved_credits
used_credits
released_credits
credit_status:
  none
  estimated
  reserved
  used
  released
  failed
updated_at
```

1차 구현에서는 별도 테이블 대신 `campaigns` 컬럼 추가로 시작해도 된다.

```txt
campaigns.estimated_credits
campaigns.reserved_credits
campaigns.used_credits
campaigns.credit_status
campaigns.credit_reserved_at
campaigns.credit_used_at
```

### 5.3 light 월 1회 제한

KST 기준 월 단위로 체크한다.

```txt
조건:
user_id = 현재 사용자
product_type = light
status = paid 또는 completed
created_at >= KST 월 시작
created_at < KST 다음 달 시작
```

구매 시 서버에서 한 번 더 검사해야 한다. 프론트 비활성화만으로는 부족하다.

## 6. 서버 설계안

### 6.1 creditService 신설

크레딧 계산과 차감은 route에 흩어두지 않고 한 곳으로 모은다.

권장 파일:

```txt
server/services/creditService.ts
```

주요 함수:

```txt
getCreditProducts()
calculateCampaignCredits({ targetCount, templateCount })
validateMinimumSend({ targetCount, templateCount })
getAvailableCredits(userId)
canPurchaseLightThisMonth(userId)
grantCredits({ userId, productType, paymentTransactionId })
reserveCampaignCredits({ userId, campaignId })
releaseCampaignCredits({ userId, campaignId, reason })
useCampaignCredits({ userId, campaignId, idempotencyKey })
refundRemainingCredits({ userId, amount, reason })
expireCredits(now)
```

### 6.2 계산 규칙

```txt
CREDIT_PER_MESSAGE = 2
MIN_SEND_PER_TEMPLATE = 1000
MIN_CREDIT_PER_TEMPLATE = 2000
```

서버 검증:

```txt
if targetCount < templateCount * 1000:
  reject

neededCredits = targetCount * 2

if availableCredits < neededCredits:
  reject
```

### 6.3 발송 API 목표

현재:

```txt
POST /api/campaigns/:id/start
```

목표:

```txt
POST /api/campaigns/:id/schedule-send
POST /api/campaigns/:id/start
POST /api/campaigns/:id/cancel-reservation
```

1차에서는 기존 `/start`를 유지하고 내부만 크레딧 서비스로 교체한다.

예약 발송은 2차에서 별도 예약 크레딧 홀딩을 붙이는 것이 안전하다.

### 6.4 결제 API 목표

현재 충전 API/결제 콜백은 금액 기준으로 `users.balance`를 올린다.

목표:

```txt
결제 생성:
POST /api/credits/checkout
body: { productType }

결제 완료 콜백:
payment confirmed
→ productType 확인
→ light 월 1회 제한 최종 확인
→ credit_grants 생성
→ credit_ledger charge 생성
→ transactions 기록
```

### 6.5 동시성/중복 방지

크레딧은 돈과 직접 연결되므로 반드시 서버 트랜잭션으로 처리한다.

필수:

- 결제 콜백 idempotency
- 발송 시작 idempotency
- 중복 클릭 방지
- 같은 캠페인 중복 차감 방지
- light 월 1회 race condition 방지
- DB transaction 내부에서 잔액 확인 및 차감

## 7. 프론트 설계안

### 7.1 네이밍 전환

| 기존 | 변경 |
| --- | --- |
| 잔액 | 보유 크레딧 |
| 예산 | 필요한 크레딧 |
| 비용 | 사용 크레딧 |
| 잔액 충전 | 크레딧 충전 |
| 발송 가능 금액 | 발송 가능 건수 |

### 7.2 핵심 화면

#### 대시보드

3개 덩어리 중심:

- 현재 보유 크레딧
- 지금 해야 할 일
- 최근 캠페인 결과

필수 문구:

```txt
현재 8,400C를 보유하고 있어요.
최대 4,200건까지 보낼 수 있어요.
예약된 캠페인에 2,000C가 묶여 있어요.
```

#### 캠페인 만들기

기존 기능은 유지하되 마지막 확인을 크레딧 중심으로 바꾼다.

```txt
받을 사람
보낼 내용
보낼 시간
최종 확인
```

최종 확인에 반드시 표시:

- 발송 건수
- 필요한 크레딧
- 보유 크레딧
- 예약 후 남는 크레딧
- 최소 발송 1,000건 안내
- 부족 시 충전 CTA

#### 캠페인 상세

상단에 다음 액션 카드 배치.

상태별 CTA:

| 상태 | CTA |
| --- | --- |
| 초안 | 검수 요청하기 |
| 검수 중 | 검수 상태 확인 |
| 승인 완료 | 발송 예약하기 또는 지금 발송하기 |
| 크레딧 부족 | 충전하기 |
| 예약 완료 | 예약 취소 |
| 발송 중 | 진행 상황 보기 |
| 발송 완료 | 결과 보기 |

#### 크레딧 화면

필수 구성:

- 보유 크레딧
- 발송 가능 건수 환산
- 예약 크레딧
- 충전 상품 4개
- light 월 1회 상태
- 사용/충전/예약/환불/만료 내역
- 유효기간 안내

### 7.3 디자인 톤앤매너

전달된 Figma Make 디자인 방향을 적용한다.

- SKT 레드/코랄 유지
- 크레딧 정보는 블루 계열 또는 안정적인 중립 카드 사용
- 빨간색은 브랜드 포인트와 주요 CTA 위주로 제한
- 토스처럼 쉬운 문장
- 과한 설명 대신 다음 행동 명확화
- 한 화면에 하나의 핵심 질문
- 선택지는 2~3개 중심
- 모바일 CTA는 하단 고정
- 카드 전체가 터치 대상
- 주요 버튼 최소 44~48px 높이

## 8. 구현 단계

### Phase 0. 정책 고정

- 상품 정책 확정
- 환불 문구 가안 작성
- SKT 정산 발생 기준 확인
- 유효기간/만료/환불 법무 검토

### Phase 1. 서버 계산 통합

- `creditPolicy` 상수 추가
- `creditService` 추가
- 기존 단가 계산 제거
- 캠페인 생성/발송 검증을 `targetCount * 2C`로 통일
- 최소 1,000건 검증 추가

진행 상태:

- 완료: 공유 크레딧 정책 상수 추가
- 완료: `CREDIT_MODE_ENABLED=false` feature flag 추가
- 완료: 읽기 전용 `/api/credits/policy` 정책 API 추가
- 완료: 서버 `creditService` 1차 추가
- 완료: 읽기 전용 `/api/credits/estimate` 계산 API 추가
- 완료: `CREDIT_SHADOW_LOG_ENABLED=false` shadow log flag 추가
- 대기: 기존 발송/결제 로직을 크레딧 계산으로 교체
- 대기: 최소 1,000건 서버 검증 실제 적용

### Phase 2. DB 추가

- 완료: `credit_grants` 추가
- 완료: `credit_ledger` 추가
- 완료: 기존 `transactions`, `campaigns`, `users`와 nullable 연결
- 완료: 크레딧 조회용 저장소 메서드 추가
- 완료: 읽기 전용 `/api/credits/summary` API 추가
- 완료: 로컬 Docker Postgres에 `db:push` 반영
- 유지: 기존 `users.balance`, `transactions`, 발송/결제 차감 로직은 변경하지 않음
- 대기: `credit_products` 테이블화 여부 결정. 현재는 코드 상수 사용
- 대기: 캠페인 크레딧 예약/사용 컬럼 또는 별도 요약 테이블 추가
- 참고: 현재 실행 중인 Docker 앱은 서버 재시작 후 새 `/api/credits/summary` 라우트를 인식함

### Phase 3. 결제/충전 전환

- 충전 상품 선택을 `amount`가 아니라 `productType` 기준으로 변경
- light 월 1회 체크
- 결제 성공 시 크레딧 지급
- 12개월 만료일 부여

진행 상태:

- 완료: 충전 화면에서 KISPG 인증 요청 시 선택한 `productType` 전달
- 완료: Stripe/KISPG 결제 요청에서 `productType`과 결제 금액 일치 검증
- 완료: Stripe/KISPG 결제 성공 시 `CREDIT_MODE_ENABLED=true`에서만 `credit_grants`, `credit_ledger`에 지급 기록
- 완료: 결제별 idempotency key로 중복 크레딧 지급 방지
- 완료: 지급 크레딧 만료일 12개월 부여
- 완료: 배포용 `api/router.js` 번들 갱신
- 완료: 라이트 충전 월 1회 제한을 결제 시작 전 적용
- 완료: 라이트 충전 월 1회 제한을 크레딧 지급 직전에도 재확인
- 완료: KST 기준 월 범위 계산 적용
- 완료: 크레딧 장부를 기준으로 `/billing` 보유 크레딧 표시 전환
- 완료: `/billing` 크레딧 요약에 만료 예정, 환불 가능, 총 지급, 장부 상태 표시
- 완료: 크레딧 장부가 없을 때 기존 `users.balance`, `transactions` 기준으로 안전하게 fallback
- 완료: 크레딧 장부가 있으면 최근 `credit_ledger` 내역을 우선 표시
- 유지: `CREDIT_MODE_ENABLED=false` 기본값에서는 기존 잔액 충전 흐름 유지
- 완료: 사용자 환불 신청 API를 크레딧 장부 기준으로 전환
- 완료: 관리자 환불 완료 시 잔여 크레딧을 상품별 단가 기준으로 차감
- 완료: 환불 완료 내역을 `credit_ledger` type `refund`로 기록
- 완료: `refund-complete:{refundId}` idempotency key로 환불 중복 차감 방지
- 완료: 로컬 개발 환경에서 사용자 환불 신청과 관리자 환불 처리가 같은 Docker Postgres를 보도록 관리자 로컬 API 보강

### Phase 4. 발송/예약 전환

- 즉시 발송 시 사용 크레딧 차감
- 예약 발송 시 예약 크레딧 홀딩
- 예약 취소 시 release
- 발송 시작 시 reserved -> used 전환
- 내부 실패/SKT 접수 실패 시 release/refund

진행 상태:

- 완료: `CREDIT_MODE_ENABLED=true`일 때 `/api/campaigns/:id/start`에서 최소 발송 1,000건 검증 적용
- 완료: `CREDIT_MODE_ENABLED=true`일 때 `/api/campaigns/:id/start`에서 보유 크레딧 부족 검증 적용
- 완료: 발송 시작 시 만료일이 빠른 `credit_grants`부터 차감
- 완료: 발송 시작 크레딧 차감과 캠페인 `running` 전환을 같은 DB 트랜잭션으로 처리
- 완료: `campaign-start:{campaignId}` idempotency key로 같은 캠페인 중복 차감 방지
- 완료: 차감 내역을 `credit_ledger` type `use`로 기록
- 완료: 로컬 Postgres 환경에서는 일반 Postgres 드라이버를 사용하도록 DB 연결 분기
- 완료: 로컬 크레딧 모드 테스트 통과. 4,000C 지급 후 1,000건 발송 시 2,000C 차감, 재시도 시 추가 차감 없음
- 완료: 크레딧 부족 케이스 400 응답 확인
- 완료: 1,000건 미만 최소 발송 정책 400 응답 확인
- 완료: `/submit`에서 예약 발송 시간을 저장하도록 반영
- 완료: 예약 시간이 있는 캠페인이 승인되면 `credit_ledger` type `reserve`로 예약 크레딧 기록
- 완료: 예약 취소 시 `credit_ledger` type `release`로 예약 크레딧 복구
- 완료: 예약된 캠페인 발송 시작 시 추가 차감 없이 `reserve`를 `use`로 전환
- 완료: `/api/credits/summary`에서 사용 가능, 예약, 실제 사용 크레딧을 분리
- 완료: 크레딧 요약 화면에 예약 크레딧 표시
- 완료: 로컬 reserve/release 테스트 통과. 예약 후 취소 시 4,000C 복구, 예약 후 발송 시 예약 2,000C가 사용 2,000C로 전환
- 완료: 내부 오류/SKT 접수 실패용 크레딧 복구 메서드 추가
- 완료: 발송 `use` 장부의 grant allocation을 기준으로 동일 grant에 크레딧 복구
- 완료: 복구 내역을 `credit_ledger` type `adjustment`로 기록
- 완료: `campaign-restore:{campaignId}:{reason}` idempotency key로 중복 복구 방지
- 완료: 복구 API는 로컬 개발 또는 내부 시크릿 헤더가 있는 요청만 허용
- 완료: 로컬 실패 복구 테스트 통과. 4,000C 지급 후 발송 차감 2,000C, SKT 접수 실패 복구 후 4,000C 복구, 재호출 시 중복 복구 없음
- 완료: 부분 접수/부분 실패 시 미처리 잔여분만 복구
- 완료: 복구 사유가 여러 번 들어와도 총 복구액이 실제 사용 크레딧을 넘지 않도록 과복구 방지
- 완료: 크레딧 장부 UI에서 전액 복구, SKT 접수 실패 복구, 잔여분 복구, 수동 조정을 구분 표시
- 유지: `CREDIT_MODE_ENABLED=false` 기본값에서는 기존 잔액 차감/거래내역 흐름 유지
- 대기: 실제 SKT 콜백/발송 워커 실패 지점에서 복구 API 또는 복구 서비스를 연결

### Phase 5. 프론트 UIUX 이식

- 대시보드 크레딧 카드
- 캠페인 생성 최종 확인
- 캠페인 상세 다음 액션 카드
- 크레딧 충전 화면
- 거래 내역 문구 전환
- 디자인 토큰/카드/버튼 톤 정리

진행 상태:

- 완료: 캠페인 생성 마지막 단계에 크레딧 기준 미리보기 카드 추가
- 완료: 최소 1,000건, 문자 1건 2C, 필요 크레딧, 발송 후 잔여 크레딧 표시
- 완료: 크레딧/충전 화면에 상품 4개 카드와 크레딧 중심 문구 1차 적용
- 완료: 대시보드 보유 크레딧 카드, 발송 가능 건수, 추천 충전 상품 문구 적용
- 완료: 사이드바 잔액 영역을 보유 크레딧/발송 가능 건수 기준으로 전환
- 완료: 캠페인 상세 화면에 상태별 다음 단계 카드와 크레딧 요약 추가
- 완료: 캠페인 상세 발송 확인 모달의 비용 문구를 필요 크레딧/발송 후 잔여 크레딧 기준으로 전환
- 완료: 캠페인 목록, 승인요청/예약 다이얼로그, 이전 캠페인 복제 모달의 예산 문구를 필요 크레딧 기준으로 전환
- 완료: 발송 내역 화면에 발송 대상, 필요 크레딧, 완료 캠페인, 성공률 요약 추가
- 완료: 발송 내역 각 캠페인 행에 필요 크레딧과 문자 1건 2C 기준 표시
- 완료: 발송 내역 CSV 내보내기를 `예산` 대신 `필요크레딧` 기준으로 전환
- 완료: 리포트 화면의 `총 광고비`, `누적 사용 예산`, `클릭당 비용` 표현을 크레딧 기준으로 전환
- 완료: 캠페인별 리포트 행에 필요 크레딧과 문자 1건 2C 기준 표시
- 유지: 기존 저장/발송/차감 조건은 변경하지 않음
- 대기: 관리자 리포트/사용자 관리의 잔액/예산 문구를 크레딧 기준으로 전환

### Phase 6. 관리자/리포트

- 사용자 크레딧 조회
- 수동 조정
- light 구매 여부 확인
- 만료 예정 크레딧 조회
- 캠페인별 사용 크레딧 리포트

### Phase 7. 검증

- 타입 체크
- 빌드
- 로컬 도커 테스트
- 캠페인 생성/검수/승인/발송/예약/취소 시나리오
- 결제 콜백 중복 테스트
- 동시 발송 클릭 테스트
- light 월 1회 제한 테스트
- 만료 크레딧 소진 순서 테스트
- 환불 신청/승인/완료/크레딧 차감 E2E 테스트

진행 상태:

- 완료: 타입 체크 통과
- 완료: 프로덕션 빌드 통과
- 완료: 로컬 Docker 기반 회원가입/로그인 확인
- 완료: 로컬 Docker 기반 크레딧 충전/라이트 월 1회 제한 확인
- 완료: 로컬 Docker 기반 예약/예약 취소/발송 시작/실패 복구 확인
- 완료: 로컬 Docker 기반 환불 E2E 확인

최근 로컬 환불 E2E 결과:

```txt
사용자 환불 신청: 10,000원
관리자 상태 변경: pending -> approved -> completed
환불 전 보유 크레딧: 18,000C
환불 후 보유 크레딧: 17,840C
차감 원장: refund -160C
적용 상품 단가: enterprise 1,000,000원 / 16,000C = 62.5원/C
브라우저 콘솔 에러: 없음
```

## 9. 테스트 케이스

### 9.1 크레딧 계산

- 999건 발송 불가
- 1,000건 발송 시 2,000C 필요
- 5,000건 발송 시 10,000C 필요
- 보유 1,999C에서 1,000건 발송 불가
- 보유 2,000C에서 1,000건 발송 가능

### 9.2 상품 구매

- light 첫 구매 가능
- 같은 달 light 두 번째 구매 불가
- 다음 달 light 다시 구매 가능
- topup/booster/enterprise 반복 구매 가능
- 결제 콜백 중복 수신 시 크레딧 1회만 지급

### 9.3 예약

- 예약 시 크레딧 reserved 처리
- 예약 후 사용 가능 크레딧 감소
- 예약 취소 시 reserved 해제
- 예약 발송 시작 시 used 처리
- 예약 발송 실패 시 reserved 해제

### 9.4 소진 순서

- 만료일이 빠른 grant부터 차감
- 첫 grant 부족 시 다음 grant에서 이어서 차감
- 만료된 grant는 사용 가능 크레딧에서 제외
- 만료된 grant는 환불 대상에서 제외

### 9.5 환불

- 잔여 크레딧만 환불 대상
- 이미 사용한 크레딧 환불 불가
- 만료된 크레딧 환불 불가
- 예약 중인 크레딧은 예약 해제 후 환불 가능 여부 판단

## 10. 주요 리스크

### 10.1 금액/크레딧 혼용

가장 큰 리스크다. 화면과 서버에서 `balance`, `budget`, `cost`가 남아 있으면 사용자가 금액인지 크레딧인지 혼동한다.

대응:

- 서버 내부 명칭부터 credit 중심으로 정리
- 프론트 문구 일괄 전환
- 레거시 필드는 호환용으로만 사용

### 10.2 중복 차감

발송 버튼 중복 클릭, 콜백 중복, 네트워크 재시도에서 발생할 수 있다.

대응:

- idempotency key
- campaign credit status
- DB transaction
- 같은 캠페인 used 상태 중복 차단

### 10.3 예약 크레딧 미구현

예약 시 크레딧을 잡아두지 않으면 발송 시점에 부족해질 수 있다.

대응:

- 예약 발송은 reserved 필수
- 예약 해제/실패 복구 로직 필수

### 10.4 환불/만료 법무 리스크

유효기간 12개월, 만료 후 환불 불가, 잔여분 환불은 법무/약관 확인이 필요하다.

대응:

- 초기 화면 문구는 "정책 준비 중" 또는 "약관 기준"으로 표시
- 정식 배포 전 약관/고지 문구 검토

### 10.5 로컬/상용 라우트 분기 리스크

로컬 개발 환경은 `server/localApiRouter.ts`가 일부 API를 먼저 처리하고, 상용/서버리스 환경은 `src/handlers/*` 라우트를 사용한다. 한쪽만 수정하면 로컬 테스트는 통과하지만 상용 API가 빠지거나, 반대로 상용 핸들러는 맞는데 로컬 UI 검증이 끊길 수 있다.

대응:

- 사용자 기능은 `server/routes.ts`와 `src/handlers/*` 양쪽 흐름을 같이 확인
- 관리자 기능은 로컬 전용 API와 서버리스 관리자 핸들러를 같이 확인
- 로컬 전용 보강은 반드시 `NODE_ENV=development`에서만 실행되는 라우터에 둠
- 배포 전에는 `api/router.js` 번들 갱신 여부를 확인
- 브라우저 E2E는 로컬 Docker, 타입 체크, 빌드를 모두 통과해야 완료로 본다

## 11. 배포 전 게이트

크레딧 전환은 돈/발송권/환불이 연결되므로 아래 항목을 모두 통과하기 전에는 상용 반영하지 않는다.

### 11.1 환경 플래그

| 항목 | 기준 |
| --- | --- |
| `CREDIT_MODE_ENABLED` | 상용 전환 직전까지 기본값 false 유지 |
| `CREDIT_SHADOW_LOG_ENABLED` | 상용 사전 관찰 시 true 검토 |
| 로컬 개발 충전 버튼 | 개발 환경에서만 노출 |
| 환불 완료 차감 | 관리자 완료 액션에서만 수행 |
| 실패 복구 API | 로컬 개발 또는 내부 시크릿 요청만 허용 |

### 11.2 필수 회귀 시나리오

| 영역 | 확인 |
| --- | --- |
| 인증 | 로컬 회원가입/로그인, 관리자 로그인 |
| 충전 | 4개 상품 지급, 라이트 월 1회 제한 |
| 캠페인 생성 | 999건 차단, 1,000건 허용, 필요 크레딧 표시 |
| 승인 템플릿 | 승인된 템플릿만 캠페인 생성에 사용 가능 |
| 예약 | 예약 시 reserve, 취소 시 release |
| 발송 | start 중복 호출 시 추가 차감 없음 |
| 실패 | SKT 접수 실패 전액 복구, 부분 실패 잔여분 복구, 과복구 방지 |
| 환불 | 신청, 승인, 완료, 원장 refund 차감 |
| 레거시 fallback | 크레딧 장부 없는 사용자는 기존 balance 표시 유지 |
| 빌드 | 타입 체크와 프로덕션 빌드 통과 |

### 11.3 배포 직전 수동 확인

```txt
1. 신규 계정 생성
2. 라이트 충전 1회 지급
3. 같은 달 라이트 재구매 차단
4. 엔터프라이즈 지급
5. 1,000건 캠페인 생성
6. 승인 템플릿만 선택되는지 확인
7. 예약 발송으로 2,000C reserve
8. 예약 취소로 2,000C release
9. 즉시 발송으로 2,000C use
10. 실패 복구로 adjustment 확인
11. 10,000원 환불 신청
12. 관리자 승인/완료
13. 상품 단가 기준 크레딧 차감 확인
14. 대시보드/빌링/사이드바/리포트 숫자 일관성 확인
```

## 12. 제품 문구 초안

### 보유 크레딧

```txt
현재 8,400C를 보유하고 있어요.
최대 4,200건까지 보낼 수 있어요.
```

### 최소 발송

```txt
캠페인은 최소 1,000건부터 발송할 수 있어요.
1,000건 발송에는 2,000C가 필요해요.
```

### 크레딧 부족

```txt
크레딧이 800C 부족해요.
추가 충전 후 바로 이어서 발송할 수 있어요.
```

### light 제한

```txt
라이트 충전은 매월 1회만 구매할 수 있어요.
이번 달 라이트 충전을 이미 사용했어요.
```

### 유효기간

```txt
충전한 크레딧은 지급일로부터 12개월 동안 사용할 수 있어요.
먼저 만료되는 크레딧부터 자동으로 사용돼요.
```

## 13. 1차 구현 권장 범위

처음부터 전부 바꾸지 말고 다음 범위만 먼저 적용한다.

1. 정책 상수와 계산 함수 통합
2. 최소 1,000건 검증
3. 필요 크레딧 `targetCount * 2` 적용
4. 프론트 문구를 잔액/예산에서 크레딧 중심으로 변경
5. 충전 상품 UI를 4개 상품 기준으로 변경
6. light 월 1회 제한 서버 검증
7. 캠페인 상세 발송 시작 시 크레딧 차감

예약 크레딧, grant별 만료/소진, 환불은 2차에서 정확하게 들어가는 것이 안전하다. 단, DB 설계는 1차부터 해당 확장을 고려해 둔다.

## 14. 오픈 질문

1. SKT 접수 성공의 정확한 판정 기준은 무엇인가?
2. 수신 실패분에도 SKT 정산비가 발생하는가?
3. 예약 발송은 1차부터 reserved 구조를 넣을 것인가, 2차로 나눌 것인가? -> 현재 로컬 1차 구현은 reserved/release/use 전환까지 포함
4. 환불 정책 문구를 약관에 어떻게 반영할 것인가?
5. 기존 사용자의 `balance`를 어떤 기준으로 크레딧으로 전환할 것인가?
