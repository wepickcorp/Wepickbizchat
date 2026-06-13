import { calculateCampaignCredits } from "./credit-policy";

export interface BizChatStateCallbackPayload {
  id?: string;
  state?: number;
  stateUpdateDate?: number;
  stateReason?: string;
  sendCount?: number;
  sendCnt?: number;
  sentCount?: number;
  sndCnt?: number;
  successCount?: number;
  successCnt?: number;
  succCnt?: number;
  settleCount?: number;
  failCnt?: number;
  failCount?: number;
  failureCnt?: number;
  settleCnt?: number;
  data?: {
    sendCount?: number;
    sendCnt?: number;
    sentCount?: number;
    sndCnt?: number;
    successCount?: number;
    successCnt?: number;
    succCnt?: number;
    settleCount?: number;
    failCnt?: number;
    failCount?: number;
    failureCnt?: number;
    settleCnt?: number;
  };
}

type CountKey = Exclude<
  keyof BizChatStateCallbackPayload,
  "data" | "id" | "state" | "stateUpdateDate" | "stateReason"
>;

function normalizeCount(rawValue: unknown) {
  const numericValue = Number(rawValue);
  return Number.isFinite(numericValue) && numericValue >= 0
    ? Math.floor(numericValue)
    : undefined;
}

function readFirstCount(payload: BizChatStateCallbackPayload, keys: CountKey[]) {
  for (const key of keys) {
    const topLevelCount = normalizeCount(payload[key]);
    if (topLevelCount !== undefined) {
      return { value: topLevelCount, source: key };
    }

    const dataCount = normalizeCount(payload.data?.[key]);
    if (dataCount !== undefined) {
      return { value: dataCount, source: `data.${key}` };
    }
  }

  return { value: undefined, source: undefined };
}

export function readBizChatCallbackCounts(payload: BizChatStateCallbackPayload) {
  const sendCountResult = readFirstCount(payload, ["sendCnt", "sendCount", "sentCount", "sndCnt"]);
  const successCountResult = readFirstCount(payload, ["successCnt", "successCount", "succCnt"]);
  const settleCountResult = readFirstCount(payload, ["settleCnt", "settleCount"]);
  const failCountResult = readFirstCount(payload, ["failCnt", "failCount", "failureCnt"]);

  return {
    sendCnt: sendCountResult.value,
    successCnt: successCountResult.value,
    settleCnt: settleCountResult.value,
    failCnt: failCountResult.value,
    sources: {
      sendCnt: sendCountResult.source,
      successCnt: successCountResult.source,
      settleCnt: settleCountResult.source,
      failCnt: failCountResult.source,
    },
  };
}

export function getBizChatCallbackCreditPlan(input: {
  state: number;
  targetCount: number;
  observedCounts: ReturnType<typeof readBizChatCallbackCounts>;
}) {
  const { state, targetCount, observedCounts } = input;

  if (state === 17 || state === 25) {
    return { type: "release" as const };
  }

  if (state !== 35 && state !== 40) {
    return { type: "none" as const };
  }

  const hasCallbackCount = observedCounts.settleCnt !== undefined || observedCounts.successCnt !== undefined;
  const chargeableCount = hasCallbackCount
    ? Math.min(targetCount, observedCounts.settleCnt ?? observedCounts.successCnt ?? 0)
    : targetCount;

  if (!hasCallbackCount) {
    return {
      type: "restore_skipped_no_count" as const,
      targetCount,
      countSources: observedCounts.sources,
    };
  }

  if (targetCount <= 0 || chargeableCount >= targetCount) {
    return {
      type: "restore_noop" as const,
      targetCount,
      chargeableCount,
    };
  }

  const restoreCredits = calculateCampaignCredits({ targetCount: targetCount - chargeableCount }).neededCredits;
  return {
    type: "restore" as const,
    reason: chargeableCount === 0 ? "skt_receipt_failure" as const : "partial_delivery_failure" as const,
    targetCount,
    chargeableCount,
    restoreCredits,
  };
}
