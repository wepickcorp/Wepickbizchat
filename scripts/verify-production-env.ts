const required = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "ADMIN_JWT_SECRET",
  "ADMIN_SALT",
  "CRON_SECRET",
  "BIZCHAT_PROD_API_KEY",
  "BIZCHAT_CALLBACK_AUTH_KEY",
  "KISPG_MID",
  "KISPG_MERCHANT_KEY",
  "KISPG_RETURN_URL",
];

const exactValues: Record<string, string> = {
  CREDIT_MODE_ENABLED: "true",
  BIZCHAT_USE_PROD: "true",
  KISPG_USE_PROD: "true",
};

const forbiddenTrueValues = [
  "ENABLE_DIRECT_CHARGE",
  "ENABLE_STRIPE_PAYMENTS",
];

const insecureValues = new Set([
  "wepick-admin-secret",
  "local-dev-admin-secret",
  "local-dev-session-secret",
  "local-dev-cron-secret",
  "local-dev-admin-salt",
]);

const missing = required.filter((key) => !process.env[key]?.trim());
const wrongValues = Object.entries(exactValues).filter(([key, expected]) => process.env[key] !== expected);
const forbiddenEnabled = forbiddenTrueValues.filter((key) => process.env[key] === "true");
const invalidUrls = [
  ["KISPG_RETURN_URL", process.env.KISPG_RETURN_URL],
].filter(([, value]) => value && !String(value).startsWith("https://"));
const insecure = [...required, ...Object.keys(exactValues)].filter((key) => {
  const value = process.env[key];
  return value ? insecureValues.has(value) : false;
});

if (missing.length || wrongValues.length || forbiddenEnabled.length || invalidUrls.length || insecure.length) {
  console.error("Production environment check failed.");

  if (missing.length) {
    console.error(`Missing required env: ${missing.join(", ")}`);
  }

  if (wrongValues.length) {
    console.error(
      `Invalid env values: ${wrongValues
        .map(([key, expected]) => `${key} must be ${expected}`)
        .join(", ")}`,
    );
  }

  if (forbiddenEnabled.length) {
    console.error(`Disabled payment paths must not be enabled: ${forbiddenEnabled.join(", ")}`);
  }

  if (invalidUrls.length) {
    console.error(`Invalid URL values: ${invalidUrls.map(([key]) => `${key} must start with https://`).join(", ")}`);
  }

  if (insecure.length) {
    console.error(`Insecure local default values detected: ${insecure.join(", ")}`);
  }

  process.exit(1);
}

console.log("Production environment check passed.");
