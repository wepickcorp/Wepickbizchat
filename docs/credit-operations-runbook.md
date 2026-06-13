# Credit Operations Runbook

Before production rollout, use `docs/credit-production-release-checklist.md` as the final go/no-go checklist.

## Credit Units

- 1 message send = 2C
- Minimum send volume = 1,000 messages per template
- Minimum required credits = 2,000C per template
- Credits expire 12 months after grant
- Credits are consumed from the earliest expiring grant first

## Campaign Credit Flow

| Step | Ledger type | Amount | Notes |
| --- | --- | ---: | --- |
| Credit purchase/grant | `grant` | `+credits` | Product credits are granted once per payment idempotency key. |
| Approval request | `reserve` | `-neededCredits` | Credits are held when the campaign is submitted for approval. |
| Cancel before send | `release` | `+reservedCredits` | Reserved credits are returned. |
| Send start | `use` | `-neededCredits` | Reserved credits are converted to used credits without subtracting again. |
| Refund | `refund` | `-refundedCredits` | Only refundable remaining credits can be refunded. |
| Failure recovery | `adjustment` | `+restoredCredits` | Used credits can be restored according to failure policy. |

## Failure Recovery Policy

| Reason | API reason | Recovery |
| --- | --- | --- |
| Internal failure before valid send | `internal_failure` | Full restore up to remaining restorable used credits |
| SKT receipt failure before delivery starts | `skt_receipt_failure` | Full restore up to remaining restorable used credits |
| Partial receipt/delivery failure | `partial_delivery_failure` | Restore only unprocessed remainder |

For partial recovery, the caller must send a chargeable count:

```json
{
  "reason": "partial_delivery_failure",
  "chargeableCount": 2000
}
```

Example:

| Item | Value |
| --- | ---: |
| Target count | 3,000 |
| Used credits | 6,000C |
| Chargeable count | 2,000 |
| Unprocessed count | 1,000 |
| Restored credits | 2,000C |

## BizChat Callback Recovery

The BizChat state callback is the production integration point for automatic credit recovery.
Use `docs/bizchat-callback-staging-checklist.md` before connecting or changing real callback payloads.

| BizChat state | Credit action |
| --- | --- |
| `17`, `25` | Release reserved credits because the campaign did not proceed to send |
| `35`, `40` with a chargeable count field | Restore the unprocessed remainder |
| `35`, `40` without count fields | Update campaign state only, no automatic restore |

Safety notes:

- Callback counts are read from top-level fields or `data`.
- Count aliases are accepted for staging verification:
  - send count: `sendCnt`, `sendCount`, `sentCount`, `sndCnt`
  - success count: `successCnt`, `successCount`, `succCnt`
  - settlement count: `settleCnt`, `settleCount`
  - failure count: `failCnt`, `failCount`, `failureCnt`
- `settleCnt`/`settleCount` is preferred over `successCnt`/`successCount` when both are present.
- If callback count is `0`, the restore is labeled `SKT 접수 실패 복구`.
- If callback count is greater than `0` but lower than target count, the restore is labeled `잔여 발송분 복구`.
- Callback responses include `observedCounts` and `creditAction` so staging tests can confirm which fields were recognized.
- `stateReason` can be received from BizChat, but it is not written until a matching DB column/migration exists.
- If BizChat changes payload field names, automatic restore should stay disabled until the new count field is confirmed in staging.

## Safety Rules

- A restore is idempotent by `campaign-restore:{campaignId}:{reason}`.
- Total restored credits for a campaign cannot exceed the campaign's used credits.
- A second restore reason can only restore the remaining restorable amount.
- Reserved credits cannot be released after a campaign has started.
- If a reserved amount does not match the needed amount at send start, send start is blocked.

## Operator Labels

The credit ledger UI labels `adjustment` entries based on description:

| Description contains | UI label | Meaning |
| --- | --- | --- |
| `잔여 발송분 복구` | 잔여분 복구 | Partial recovery |
| `SKT 접수 실패 복구` | SKT 접수 실패 복구 | Full recovery before SKT receipt |
| `내부` or `실패 복구` | 전액 복구 | Internal/full recovery |
| Other adjustment | 수동 조정 | Admin/manual correction |

## Local Verification

Use the local verification endpoints after changing credit logic:

| Command | Checks |
| --- | --- |
| `npm run verify:bizchat-callback` | BizChat callback count aliases and credit action planning |
| `npm run verify:credit-local` | Runs all local credit and DB schema verification endpoints against `http://127.0.0.1:5050` |

| Endpoint | Checks |
| --- | --- |
| `/api/local/verify-db-schema` | required credit tables, columns, and indexes |
| `/api/local/verify-campaign-credit-flow` | reserve, release, use, full restore, partial restore, over-restore guard |
| `/api/local/verify-campaign-credit-idempotency` | duplicate reserve/release/use/restore calls only write once |
| `/api/local/verify-campaign-credit-guards` | insufficient credits, minimum send count, mismatched reserve/use, release-after-start guard |
| `/api/local/verify-bizchat-callback-credit` | BizChat callback release, no-count restore skip, count alias partial restore, duplicate callback idempotency |
| `/api/local/verify-credit-purchase-guards` | payment grant idempotency, light monthly limit, unlimited topup grants, 12-month expiry |
| `/api/local/verify-admin-credit-ops` | admin refund completion, duplicate refund guard, insufficient refundable value guard, manual adjustment idempotency, over-deduct guard, admin logs |
| `/api/local/verify-template-sender-preflight` | template validation, system approved templates, approved-only campaign templates, sender number code policy |
| `/api/local/verify-credit-all` | runs DB schema and all local credit endpoint checks in sequence |

All credit-affecting changes must pass type check, build, and these local verification endpoints before deployment.

## Admin Manual Adjustments

Admin credit adjustments must include an `adjustmentKey` generated by the client for each submit attempt. The API stores it as `admin-adjust:{userId}:{adjustmentKey}` in `credit_ledger.idempotency_key`, so accidental double-clicks or request retries do not create a second grant/deduction.

Manual deductions must only consume active lots with remaining credits and the earliest expiry first. If the active balance is lower than the requested deduction, the API must reject the request without writing a ledger entry.
