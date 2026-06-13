import {
  CREDIT_POLICY,
  CREDIT_PRODUCTS,
  type CreditProductType,
  calculateCampaignCredits,
  getCreditExpiryDate,
  listCreditProducts,
} from "@shared/credit-policy";

export interface CreditAvailabilityInput {
  availableCredits: number;
  targetCount: number;
  templateCount?: number;
}

export function getCreditPolicySnapshot() {
  return {
    policy: CREDIT_POLICY,
    products: listCreditProducts(),
  };
}

export function estimateCampaignCreditAvailability(input: CreditAvailabilityInput) {
  const estimate = calculateCampaignCredits(
    {
      targetCount: input.targetCount,
      templateCount: input.templateCount,
    },
    input.availableCredits,
  );

  return {
    ...estimate,
    availableCredits: Math.max(0, Math.floor(input.availableCredits || 0)),
    canSend: !estimate.isBelowMinimum && estimate.shortageCredits === 0,
  };
}

export function getCreditProductForCheckout(productType: CreditProductType) {
  return CREDIT_PRODUCTS[productType];
}

export function getProductExpiryDate(purchasedAt = new Date()) {
  return getCreditExpiryDate(purchasedAt);
}

export function isCreditProductType(value: string): value is CreditProductType {
  return value in CREDIT_PRODUCTS;
}

export function getKstMonthRange(date = new Date()) {
  const kstDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const year = kstDate.getUTCFullYear();
  const month = kstDate.getUTCMonth();

  return {
    start: new Date(Date.UTC(year, month, 1, -9, 0, 0, 0)),
    end: new Date(Date.UTC(year, month + 1, 1, -9, 0, 0, 0)),
  };
}
