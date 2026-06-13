const DEFAULT_BASE_URL = "http://127.0.0.1:5050";

const baseUrl = (process.env.CREDIT_VERIFY_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");

const checks = [
  {
    name: "Seed credit demo data",
    path: "/api/local/seed-credit-demo",
    required: true,
  },
  {
    name: "Campaign credit flow",
    path: "/api/local/verify-campaign-credit-flow",
    required: true,
  },
  {
    name: "Campaign credit idempotency",
    path: "/api/local/verify-campaign-credit-idempotency",
    required: true,
  },
  {
    name: "Campaign credit guards",
    path: "/api/local/verify-campaign-credit-guards",
    required: true,
  },
  {
    name: "BizChat callback credit handling",
    path: "/api/local/verify-bizchat-callback-credit",
    required: true,
  },
  {
    name: "Credit purchase guards",
    path: "/api/local/verify-credit-purchase-guards",
    required: true,
  },
] as const;

type CheckResult = {
  name: string;
  path: string;
  ok: boolean;
  status?: number;
  success?: unknown;
  error?: string;
  durationMs: number;
};

async function readJsonSafely(response: Response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

async function runCheck(check: (typeof checks)[number]): Promise<CheckResult> {
  const startedAt = Date.now();
  const url = `${baseUrl}${check.path}`;

  try {
    const response = await fetch(url, { method: "GET" });
    const body = await readJsonSafely(response);
    const ok = response.ok && (body?.success === undefined || body.success === true);

    return {
      name: check.name,
      path: check.path,
      ok,
      status: response.status,
      success: body?.success,
      error: ok ? undefined : body?.error || body?.details || body?.raw || response.statusText,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      name: check.name,
      path: check.path,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    };
  }
}

function printResult(result: CheckResult) {
  const icon = result.ok ? "PASS" : "FAIL";
  const status = result.status ? `HTTP ${result.status}` : "NO_RESPONSE";
  console.log(`${icon} ${result.name} (${status}, ${result.durationMs}ms)`);
  if (!result.ok) {
    console.log(`  ${result.path}`);
    console.log(`  ${result.error || "Unknown error"}`);
  }
}

async function main() {
  console.log(`Running local credit verification against ${baseUrl}`);

  const results: CheckResult[] = [];
  for (const check of checks) {
    const result = await runCheck(check);
    results.push(result);
    printResult(result);

    if (check.required && !result.ok) {
      break;
    }
  }

  const failed = results.filter((result) => !result.ok);
  const passed = results.length - failed.length;

  console.log("");
  console.log(`Credit verification summary: ${passed}/${checks.length} passed`);

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
