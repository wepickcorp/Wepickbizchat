# BizChat Callback Staging Checklist

이 문서는 BizChat 실제 callback payload를 staging에서 확인할 때 쓰는 점검표다.

## Goal

- BizChat이 실제로 보내는 발송/정산 count 필드명을 확인한다.
- count가 없을 때 자동 복구가 발생하지 않는지 확인한다.
- count가 있을 때 잔여분만 복구되는지 확인한다.
- `state_reason`처럼 DB schema에 없는 필드를 쓰지 않는지 확인한다.

## Preconditions

- `CREDIT_MODE_ENABLED=true`
- 테스트 사용자는 충분한 크레딧을 보유해야 한다.
- 테스트 캠페인은 최소 1,000건 이상이어야 한다.
- 테스트 캠페인의 `bizchat_campaign_id`가 BizChat callback payload의 `id`와 일치해야 한다.
- 테스트는 staging 또는 로컬 DB에서만 수행한다.

## Local Baseline

먼저 로컬에서 기준 검증을 통과시킨다.

```bash
GET /api/local/verify-bizchat-callback-credit
```

Expected:

- `success: true`
- release scenario:
  - `creditAction.type: "release"`
  - `releasedCredits: 2000`
- no-count scenario:
  - `creditAction.type: "restore_skipped_no_count"`
  - balance does not increase after callback
- partial scenario:
  - `observedCounts.sources.successCnt: "data.successCount"`
  - `creditAction.type: "restore"`
  - `creditAction.reason: "partial_delivery_failure"`
  - `restoredCredits: 2000`

## Callback Endpoint

```text
POST /api/bizchat/callback/state
```

If `BIZCHAT_CALLBACK_AUTH_KEY` is configured, include one of:

```text
bizchat-callback-auth-key: <key>
x-auth-key: <key>
authorization: <key>
```

## Test Cases

### 1. Approval Rejected Or Cancelled

Payload shape:

```json
{
  "id": "<bizchatCampaignId>",
  "state": 25,
  "stateReason": "staging cancel test"
}
```

Expected response:

```json
{
  "success": true,
  "creditAction": {
    "type": "release"
  }
}
```

Ledger expectation:

- `reserve -2000C`
- `release +2000C`

### 2. Completed Without Count

Payload shape:

```json
{
  "id": "<bizchatCampaignId>",
  "state": 40
}
```

Expected response:

```json
{
  "success": true,
  "observedCounts": {
    "sources": {}
  },
  "creditAction": {
    "type": "restore_skipped_no_count"
  }
}
```

Ledger expectation:

- No automatic `adjustment` restore is created from this callback.

### 3. Partial Completion With Count

Payload shape:

```json
{
  "id": "<bizchatCampaignId>",
  "state": 40,
  "data": {
    "successCount": 2000
  }
}
```

For a 3,000-target campaign, expected response:

```json
{
  "success": true,
  "observedCounts": {
    "successCnt": 2000,
    "sources": {
      "successCnt": "data.successCount"
    }
  },
  "creditAction": {
    "type": "restore",
    "reason": "partial_delivery_failure",
    "targetCount": 3000,
    "chargeableCount": 2000,
    "restoreCredits": 2000,
    "restoredCredits": 2000
  }
}
```

Ledger expectation:

- `use -6000C`
- `adjustment +2000C`

### 4. Full SKT Receipt Failure

Payload shape:

```json
{
  "id": "<bizchatCampaignId>",
  "state": 40,
  "settleCnt": 0
}
```

Expected response:

```json
{
  "success": true,
  "creditAction": {
    "type": "restore",
    "reason": "skt_receipt_failure"
  }
}
```

Ledger expectation:

- Used credits are restored up to the remaining restorable amount.

## Accepted Count Aliases

The callback handler reads count fields from top-level payload or `data`.

| Meaning | Accepted fields |
| --- | --- |
| Send count | `sendCnt`, `sendCount`, `sentCount`, `sndCnt` |
| Success count | `successCnt`, `successCount`, `succCnt` |
| Settlement count | `settleCnt`, `settleCount` |
| Failure count | `failCnt`, `failCount`, `failureCnt` |

Settlement count wins over success count when both are present.

## Pass Criteria

- The real BizChat callback response includes a non-empty `observedCounts.sources` for completion states when BizChat sends count data.
- If BizChat sends no usable count, `creditAction.type` must be `restore_skipped_no_count`.
- No callback should fail because of missing `state_reason`.
- Credit ledger must never restore more than the original used credits for the campaign.

## If Field Names Differ

Do not enable automatic restore based on assumptions.

1. Save the raw staging callback payload.
2. Add the actual count field name to `shared/bizchat-callback.ts`.
3. Run:
   - type check
   - build
   - `/api/local/verify-bizchat-callback-credit`
4. Repeat the staging callback test.
