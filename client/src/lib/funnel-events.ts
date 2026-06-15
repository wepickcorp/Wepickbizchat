type FunnelEventPayload = {
  eventName: string;
  funnelStep?: string;
  campaignId?: string;
  templateId?: string;
  productType?: string;
  metadata?: Record<string, unknown>;
};

const ANONYMOUS_ID_KEY = "bizchat:funnel-anonymous-id";

function createAnonymousId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `anon_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function getAnonymousId() {
  if (typeof window === "undefined") return undefined;

  try {
    const saved = window.localStorage.getItem(ANONYMOUS_ID_KEY);
    if (saved) return saved;

    const nextId = createAnonymousId();
    window.localStorage.setItem(ANONYMOUS_ID_KEY, nextId);
    return nextId;
  } catch {
    return createAnonymousId();
  }
}

export function trackFunnelEvent(payload: FunnelEventPayload) {
  if (typeof window === "undefined" || !payload.eventName) return;

  const body = JSON.stringify({
    ...payload,
    anonymousId: getAnonymousId(),
    pagePath: `${window.location.pathname}${window.location.search}`,
    referrer: document.referrer || undefined,
  });

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/events", blob);
      return;
    }

    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      credentials: "include",
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // 분석 로그는 사용자 행동을 막지 않아요.
  }
}
