import assert from "node:assert/strict";
import {
  getBizChatCallbackCreditPlan,
  readBizChatCallbackCounts,
} from "../shared/bizchat-callback";

function verify(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

verify("reads top-level and nested count aliases", () => {
  const counts = readBizChatCallbackCounts({
    sendCount: 3000,
    data: {
      successCount: 2000,
      failCount: 1000,
    },
  });

  assert.equal(counts.sendCnt, 3000);
  assert.equal(counts.successCnt, 2000);
  assert.equal(counts.failCnt, 1000);
  assert.equal(counts.sources.sendCnt, "sendCount");
  assert.equal(counts.sources.successCnt, "data.successCount");
  assert.equal(counts.sources.failCnt, "data.failCount");
});

verify("prefers settlement count over success count", () => {
  const counts = readBizChatCallbackCounts({
    successCnt: 2500,
    settleCnt: 2000,
  });

  const plan = getBizChatCallbackCreditPlan({
    state: 40,
    targetCount: 3000,
    observedCounts: counts,
  });

  assert.equal(plan.type, "restore");
  if (plan.type !== "restore") return;
  assert.equal(plan.chargeableCount, 2000);
  assert.equal(plan.restoreCredits, 2000);
  assert.equal(plan.reason, "partial_delivery_failure");
});

verify("releases reserved credits for rejected or cancelled states", () => {
  for (const state of [17, 25]) {
    const plan = getBizChatCallbackCreditPlan({
      state,
      targetCount: 1000,
      observedCounts: readBizChatCallbackCounts({}),
    });

    assert.equal(plan.type, "release");
  }
});

verify("skips restore when completion callback has no count", () => {
  const plan = getBizChatCallbackCreditPlan({
    state: 40,
    targetCount: 1000,
    observedCounts: readBizChatCallbackCounts({}),
  });

  assert.equal(plan.type, "restore_skipped_no_count");
});

verify("restores full amount when settlement count is zero", () => {
  const plan = getBizChatCallbackCreditPlan({
    state: 40,
    targetCount: 1000,
    observedCounts: readBizChatCallbackCounts({ settleCnt: 0 }),
  });

  assert.equal(plan.type, "restore");
  if (plan.type !== "restore") return;
  assert.equal(plan.reason, "skt_receipt_failure");
  assert.equal(plan.chargeableCount, 0);
  assert.equal(plan.restoreCredits, 2000);
});

verify("does not restore when callback count covers target count", () => {
  const plan = getBizChatCallbackCreditPlan({
    state: 40,
    targetCount: 1000,
    observedCounts: readBizChatCallbackCounts({ successCnt: 1000 }),
  });

  assert.equal(plan.type, "restore_noop");
});

verify("ignores negative and non-numeric counts", () => {
  const counts = readBizChatCallbackCounts({
    successCnt: -1,
    data: {
      settleCnt: Number.NaN,
    },
  });

  const plan = getBizChatCallbackCreditPlan({
    state: 40,
    targetCount: 1000,
    observedCounts: counts,
  });

  assert.equal(counts.successCnt, undefined);
  assert.equal(counts.settleCnt, undefined);
  assert.equal(plan.type, "restore_skipped_no_count");
});

console.log("BizChat callback logic verification complete.");
