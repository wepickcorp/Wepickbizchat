# Credit Production Release Checklist

Use this checklist before enabling or deploying the credit-based campaign flow in production.

## Release Scope

- Credit policy:
  - No free signup credits.
  - 1 message = 2C.
  - Minimum send = 1,000 messages per template.
  - Minimum required credits = 2,000C per template.
  - Credit expiry = 12 months.
  - Light package can be purchased once per KST month.
- Products:
  - Light: 100,000 KRW, 2,000C, monthly limit 1.
  - Topup: 100,000 KRW, 1,200C.
  - Booster: 500,000 KRW, 7,000C.
  - Enterprise: 1,000,000 KRW, 16,000C.
- Existing sender-number policy is unchanged.
- Existing non-credit mode must remain available while `CREDIT_MODE_ENABLED=false`.

## Environment

- [ ] `CREDIT_MODE_ENABLED` is intentionally set for the target environment.
- [ ] `CREDIT_MODE_ENABLED=true` is set for the credit-based production release.
- [ ] `BIZCHAT_USE_PROD=true` is set before real SKT/BizChat sending.
- [ ] `KISPG_USE_PROD=true` is set before real payment capture.
- [ ] `DATABASE_URL` points to the intended production database.
- [ ] Stripe secrets and webhook secret are configured.
- [ ] KISPG MID, merchant key, and production/test flag are configured.
- [ ] BizChat callback URL is configured to the correct production endpoint.
- [ ] Admin JWT secret is configured.
- [ ] No production secret uses local defaults such as `local-dev-*` or `wepick-admin-secret`.

## Database

- [ ] `credit_grants` exists.
- [ ] `credit_ledger` exists.
- [ ] `credit_ledger.idempotency_key` has a unique index.
- [ ] `credit_grants` has indexes for user expiry and remaining credits.
- [ ] Existing campaign status codes are not changed unexpectedly.
- [ ] Existing sender-number tables and approval data are untouched.
- [ ] `migrations/0001_credit_system.sql` has been applied to the production database before deploying the new app code.

## Required Local Verification

Run these before deployment:

```bash
npm run verify:bizchat-callback
npm run verify:credit-local
npm run verify:prod-env
npm run check
npm run build
```

If the terminal cannot reach the Docker app port, open this in the local browser instead:

```text
http://127.0.0.1:5050/api/local/verify-credit-all
```

Expected result:

```json
{
  "success": true,
  "passed": 7,
  "total": 7
}
```

The first check in `/api/local/verify-credit-all` is `/api/local/verify-db-schema`, which verifies required credit tables, columns, and indexes against the actual local database.

## Campaign Flow

- [ ] Campaign create/start blocks sends below 1,000 targets per template.
- [ ] Campaign create/start blocks insufficient credits.
- [ ] Approval request reserves credits once.
- [ ] Cancel before send releases reserved credits once.
- [ ] Send start converts reserved credits to used credits without double subtraction.
- [ ] Direct send uses active credit lots from earliest expiry first.
- [ ] Start is blocked if reserved credits do not match required credits.
- [ ] Reserved credits cannot be released after send start.
- [ ] Failure restore cannot exceed originally used credits.

## Payment And Credit Grant

- [ ] Stripe checkout amount matches product policy.
- [ ] Stripe webhook grants credits once per payment reference.
- [ ] KISPG auth amount matches product policy.
- [ ] KISPG callback grants credits once per TID.
- [ ] Duplicate payment callbacks do not duplicate grants.
- [ ] Light second purchase in the same KST month is blocked.
- [ ] Topup, booster, and enterprise can be purchased repeatedly.
- [ ] Grant ledger entries include `credit-grant:{paymentReference}` idempotency keys.

## BizChat Callback

- [ ] States `17` and `25` release reserved credits.
- [ ] States `35` and `40` restore only when a usable count is present.
- [ ] Missing count fields do not trigger automatic restore.
- [ ] `settleCnt`/`settleCount` wins over `successCnt`/`successCount`.
- [ ] Duplicate callbacks do not duplicate release or restore entries.
- [ ] Callback responses expose `observedCounts` and `creditAction` for staging verification.

## Refunds

- [ ] Refund requests require a pending request and valid bank details.
- [ ] Credit-mode refund completion deducts only active refundable credit lots.
- [ ] Refund completion writes one `refund` ledger entry.
- [ ] Refund completion, ledger write, and admin log are handled atomically.
- [ ] Duplicate refund completion does not double deduct credits.
- [ ] Non-credit mode still blocks refunds larger than legacy balance.

## Admin Manual Adjustments

- [ ] Admin adjustment requests include `adjustmentKey`.
- [ ] Duplicate `adjustmentKey` requests do not double grant or deduct credits.
- [ ] Manual deductions use active lots from earliest expiry first.
- [ ] Manual deductions larger than active balance are rejected.
- [ ] Every successful adjustment writes a `credit_ledger` `adjustment` entry.
- [ ] Every successful adjustment writes a `credit_adjust` admin log.

## UI Smoke Test

- [ ] Billing page shows credit products and correct policy text.
- [ ] Billing page shows current credit balance and ledger entries.
- [ ] Campaign creation shows needed credits and minimum-send warning.
- [ ] Campaign list/detail shows credit status consistently.
- [ ] Dashboard, send history, and reports use credit wording correctly.
- [ ] Admin user detail shows lots, available credits, reserved credits, and recent ledger.
- [ ] Admin adjustment dialog handles success and error messages.

## Final Product QA Before Production

Use this section as the final product checklist for the credit-based redesign.

### 1. DB And Migration Safety

- [ ] Production migration is additive only. Do not drop legacy `users.balance`, `transactions`, or campaign budget fields during the first credit rollout.
- [ ] Existing production users have a clear migration rule: legacy balance stays legacy, or is converted into credit grants by an explicit one-time script.
- [ ] If existing balances are converted, each converted grant has an expiry date, ledger entry, and idempotency key.
- [ ] Rollback with `CREDIT_MODE_ENABLED=false` has been tested after the new tables exist.
- [ ] Credit tables and indexes are verified in the target DB before exposing the new UI.

### 2. Existing Customer Protection

- [ ] Existing sender-number approval policy is unchanged.
- [ ] Existing approved sender numbers still appear and can be selected.
- [ ] Existing campaigns are readable after the redesign, even if they were created before credit mode.
- [ ] Existing campaign statuses do not trigger unexpected credit reservation, use, release, or refund entries.
- [ ] Existing admin accounts can still access refund, campaign, user, log, and transaction pages.

### 3. Credit Policy Consistency

- [ ] `1 message = 2C` is used in client, server, handlers, summaries, reports, and local verification.
- [ ] Minimum send is blocked below 1,000 recipients per template.
- [ ] Minimum required credit is 2,000C per template.
- [ ] Light product can be purchased once per KST calendar month.
- [ ] Topup, booster, and enterprise have no monthly purchase limit.
- [ ] Credits expire after 12 months and earliest-expiring lots are consumed first.

### 4. Payment And Refund Safety

- [ ] Product price and granted credits match the approved policy table.
- [ ] Payment callback retries cannot grant credits twice.
- [ ] Refund request amount cannot exceed refundable remaining credit value.
- [ ] Refund completion deducts credits once and writes a refund ledger entry.
- [ ] Refund approve/reject/complete actions require admin confirmation.
- [ ] Refund status changes are visible to admin and user after refresh.

### 5. Campaign Send Safety

- [ ] Campaign creation does not deduct credits.
- [ ] Approval request reserves credits once.
- [ ] Cancel before send releases reserved credits once.
- [ ] Send start converts reserved credits into used credits without double subtraction.
- [ ] Send start is blocked when reserved credits and required credits do not match.
- [ ] Reserved credits cannot be released after send starts.
- [ ] Internal failure, SKT receipt failure, and partial failure recovery cannot restore more than the original used credits.

### 6. Message Template Safety

- [ ] Customers cannot freely write unreviewed message copy for actual sends.
- [ ] Customers can only fill approved variable fields such as brand, event name, benefit, period, location, and URL.
- [ ] Message preview shows the final send copy before campaign submission.
- [ ] Missing desired copy can be requested through the message-copy request flow.
- [ ] Admin-reviewed customer-only templates are visible only to that customer.
- [ ] Official templates can later be promoted for all users by admin decision.

### 7. UI/UX Regression

- [ ] Bottom navigation labels are `홈 / 캠페인 / 크레딧 / 리포트 / 전체`.
- [ ] Top page intro blocks are removed where they duplicate the bottom navigation context.
- [ ] Main CTAs are not competing with each other on the same screen.
- [ ] Touch targets are at least 44px high and separated enough to avoid accidental taps.
- [ ] Campaign creation keeps choices chunked by step to reduce decision load.
- [ ] Dashboard, billing, campaigns, reports, more, and landing have no horizontal overflow on mobile.
- [ ] Desktop landing keeps the phone mockup on the right; mobile places it below the hero text.
- [ ] Icons use the same rounded, orange-accent visual style across main navigation, cards, and reports.

### 8. Final Verification Commands

- [ ] Type check passes.
- [ ] Production build passes.
- [ ] `/api/local/verify-credit-all` returns success.
- [ ] `/api/local/verify-template-variable-campaign-flow` returns success.
- [ ] `/api/local/verify-template-sender-preflight` returns success.
- [ ] `/api/local/verify-admin-credit-ops` returns success.
- [ ] `/api/local/verify-credit-purchase-guards` returns success.
- [ ] `/api/local/verify-db-schema` returns success.
- [ ] Browser QA confirms no console errors on core pages.

## Rollback Plan

- [ ] Keep `CREDIT_MODE_ENABLED=false` available as the first rollback lever.
- [ ] Do not delete legacy `users.balance` behavior until credit mode has settled in production.
- [ ] If payment grants fail, stop checkout entry points before retrying webhooks.
- [ ] If BizChat callback fields are uncertain, disable automatic restore and review callback payloads manually.
- [ ] If a credit ledger mistake occurs, fix by an explicit admin adjustment entry rather than editing ledger history.

## Final Go/No-Go

- [ ] All required local verification passes.
- [ ] Production environment variables are confirmed.
- [ ] Payment test transactions are verified in staging.
- [ ] BizChat callback payloads are verified in staging.
- [ ] Admin refund and manual adjustment flows are verified with test users.
- [ ] Rollback owner and decision point are agreed before release.
