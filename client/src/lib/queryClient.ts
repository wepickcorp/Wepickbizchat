import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { supabase } from "./supabase";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// 대리 로그인 상태 확인
function isImpersonating(): boolean {
  const impersonateToken = localStorage.getItem("impersonateToken");
  const impersonateUser = localStorage.getItem("impersonateUser");
  return !!(impersonateToken && impersonateUser);
}

// 대리 로그인 사용자 ID 가져오기
function getImpersonatedUserId(): string | null {
  try {
    const impersonateUser = localStorage.getItem("impersonateUser");
    if (impersonateUser) {
      const user = JSON.parse(impersonateUser);
      return user.id || null;
    }
  } catch {
    return null;
  }
  return null;
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  // 대리 로그인 중이면 impersonation 헤더 추가
  if (isImpersonating()) {
    const impersonateToken = localStorage.getItem("impersonateToken");
    const userId = getImpersonatedUserId();
    if (impersonateToken && userId) {
      headers["X-Impersonate-Token"] = impersonateToken;
      headers["X-Impersonate-User-Id"] = userId;
    }
    return headers;
  }

  // 일반 로그인: Supabase 토큰 사용
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  } else {
    const adminToken = localStorage.getItem("adminToken");
    if (adminToken) {
      headers["Authorization"] = `Bearer ${adminToken}`;
    }
  }
  return headers;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers = await getAuthHeaders();

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  if (res.status === 401) {
    // 대리 로그인 중이면 Supabase 로그아웃 호출 안 함
    if (isImpersonating()) {
      localStorage.removeItem("impersonateToken");
      localStorage.removeItem("impersonateUser");
      window.location.href = "/auth?expired=impersonate";
      throw new Error("Impersonation session expired");
    }
    await supabase.auth.signOut();
    window.location.href = "/auth";
    throw new Error("Unauthorized");
  }

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const headers = await getAuthHeaders();

    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    if (res.status === 401) {
      // 대리 로그인 중이면 Supabase 로그아웃 호출 안 함
      if (isImpersonating()) {
        localStorage.removeItem("impersonateToken");
        localStorage.removeItem("impersonateUser");
        window.location.href = "/auth?expired=impersonate";
        throw new Error("Impersonation session expired");
      }
      await supabase.auth.signOut();
      window.location.href = "/auth";
      throw new Error("Unauthorized");
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
