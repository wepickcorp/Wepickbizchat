import { CREDIT_POLICY, type CampaignCreditEstimate } from "@shared/credit-policy";

export function formatCreditNumber(value: number) {
  return Math.floor(value).toLocaleString("ko-KR");
}

export const CREDIT_COPY = {
  messageUnit: `문자 1건은 ${CREDIT_POLICY.creditPerMessage}C로 계산돼요.`,
  minimumSend: `캠페인은 템플릿 1개당 최소 ${formatCreditNumber(CREDIT_POLICY.minSendPerTemplate)}건부터 발송할 수 있어요.`,
  expiry: `크레딧은 지급일로부터 ${CREDIT_POLICY.creditValidityMonths}개월 동안 사용할 수 있어요.`,
  consumeOrder: "유효기간이 가까운 크레딧부터 먼저 사용돼요.",
  lightMonthlyLimit: "라이트 충전은 매월 1회만 구매할 수 있어요.",
  lightNextMonth: "다음 달 1일부터 다시 구매할 수 있어요.",
};

export function getCreditShortageMessage(estimate: CampaignCreditEstimate) {
  return `${formatCreditNumber(estimate.shortageCredits)}C가 부족해요. 크레딧을 충전하면 이어서 진행할 수 있어요.`;
}

export function getMinimumSendMessage(estimate: CampaignCreditEstimate) {
  return `최소 ${formatCreditNumber(estimate.minTargetCount)}건부터 발송할 수 있어요.`;
}
