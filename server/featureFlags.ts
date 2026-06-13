export const featureFlags = {
  creditModeEnabled: process.env.CREDIT_MODE_ENABLED === "true",
  creditShadowLogEnabled: process.env.CREDIT_SHADOW_LOG_ENABLED === "true",
} as const;
