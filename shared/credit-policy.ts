export const CREDIT_PRODUCTS = {
  light: {
    productType: "light",
    name: "라이트 충전",
    priceKrw: 100_000,
    credits: 2_000,
    messageCount: 1_000,
    unitPriceKrw: 100,
    monthlyLimitCount: 1,
  },
  topup: {
    productType: "topup",
    name: "추가 충전",
    priceKrw: 100_000,
    credits: 1_200,
    messageCount: 600,
    unitPriceKrw: 166.6667,
    monthlyLimitCount: null,
  },
  booster: {
    productType: "booster",
    name: "부스터 패키지",
    priceKrw: 500_000,
    credits: 7_000,
    messageCount: 3_500,
    unitPriceKrw: 142.8572,
    monthlyLimitCount: null,
  },
  enterprise: {
    productType: "enterprise",
    name: "엔터프라이즈 패키지",
    priceKrw: 1_000_000,
    credits: 16_000,
    messageCount: 8_000,
    unitPriceKrw: 125,
    monthlyLimitCount: null,
  },
} as const;

export type CreditProductType = keyof typeof CREDIT_PRODUCTS;

export const CREDIT_POLICY = {
  creditPerMessage: 2,
  minSendPerTemplate: 1_000,
  minCreditsPerTemplate: 2_000,
  creditValidityMonths: 12,
  sktSettlementCostKrwPerMessage: 70,
  lightMonthlyLimitCount: 1,
} as const;

export interface CampaignCreditInput {
  targetCount: number;
  templateCount?: number;
}

export interface CampaignCreditEstimate {
  targetCount: number;
  templateCount: number;
  minTargetCount: number;
  neededCredits: number;
  minNeededCredits: number;
  isBelowMinimum: boolean;
  shortageCredits: number;
}

export function calculateCampaignCredits(
  input: CampaignCreditInput,
  availableCredits = 0,
): CampaignCreditEstimate {
  const templateCount = Math.max(1, Math.floor(input.templateCount ?? 1));
  const targetCount = Math.max(0, Math.floor(input.targetCount || 0));
  const minTargetCount = templateCount * CREDIT_POLICY.minSendPerTemplate;
  const minNeededCredits = templateCount * CREDIT_POLICY.minCreditsPerTemplate;
  const neededCredits = targetCount * CREDIT_POLICY.creditPerMessage;

  return {
    targetCount,
    templateCount,
    minTargetCount,
    neededCredits,
    minNeededCredits,
    isBelowMinimum: targetCount < minTargetCount,
    shortageCredits: Math.max(0, neededCredits - Math.max(0, availableCredits)),
  };
}

export function getCreditProduct(productType: CreditProductType) {
  return CREDIT_PRODUCTS[productType];
}

export function listCreditProducts() {
  return Object.values(CREDIT_PRODUCTS);
}

export function getCreditExpiryDate(purchasedAt: Date) {
  const expiresAt = new Date(purchasedAt);
  expiresAt.setMonth(expiresAt.getMonth() + CREDIT_POLICY.creditValidityMonths);
  return expiresAt;
}
