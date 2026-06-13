import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from "@tanstack/react-query";
import { supabase } from '@/lib/supabase';
import type { User } from "@shared/schema";
import type { Session } from '@supabase/supabase-js';

// 대리 로그인 토큰에서 만료 시간 추출
function getImpersonateTokenExpiry(token: string): number | null {
  try {
    const decoded = JSON.parse(atob(token));
    const payload = JSON.parse(decoded.data);
    return payload.exp || null;
  } catch {
    return null;
  }
}

// 대리 로그인 토큰 유효성 검증
function isImpersonateTokenValid(token: string): boolean {
  const expiry = getImpersonateTokenExpiry(token);
  if (!expiry) return false;
  return expiry > Date.now();
}

// 초기 대리 로그인 상태 확인 (동기적으로)
function getInitialImpersonationState(): { isImpersonating: boolean; user: User | null } {
  const impersonateToken = localStorage.getItem("impersonateToken");
  const impersonateUserData = localStorage.getItem("impersonateUser");

  if (impersonateToken && impersonateUserData) {
    if (isImpersonateTokenValid(impersonateToken)) {
      try {
        const userData = JSON.parse(impersonateUserData);
        return { isImpersonating: true, user: userData };
      } catch {
        // 파싱 실패 시 정리
        localStorage.removeItem("impersonateToken");
        localStorage.removeItem("impersonateUser");
      }
    } else {
      // 만료된 토큰 정리
      localStorage.removeItem("impersonateToken");
      localStorage.removeItem("impersonateUser");
    }
  }

  return { isImpersonating: false, user: null };
}

export function useAuth() {
  // 초기 상태를 동기적으로 설정 (hydration 문제 방지)
  const initialState = getInitialImpersonationState();
  const isLocalDev = import.meta.env.DEV;

  const [session, setSession] = useState<Session | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(!initialState.isImpersonating);
  const [hasLocalDevAuth, setHasLocalDevAuth] = useState(
    isLocalDev && localStorage.getItem("localDevAuth") === "1"
  );
  const [impersonatedUser, setImpersonatedUser] = useState<User | null>(initialState.user);
  const [isImpersonating, setIsImpersonating] = useState(initialState.isImpersonating);
  const isImpersonatingRef = useRef(initialState.isImpersonating);

  // ref 동기화
  useEffect(() => {
    isImpersonatingRef.current = isImpersonating;
  }, [isImpersonating]);

  // 대리 로그인 세션 정리 함수
  const clearImpersonation = useCallback(() => {
    localStorage.removeItem("impersonateToken");
    localStorage.removeItem("impersonateUser");
    setImpersonatedUser(null);
    setIsImpersonating(false);
    isImpersonatingRef.current = false;
  }, []);

  // 대리 로그인 토큰 만료 체크 (별도 useEffect)
  useEffect(() => {
    if (!isImpersonating) return;

    // 1분마다 토큰 만료 여부 확인
    const intervalId = setInterval(() => {
      const token = localStorage.getItem("impersonateToken");
      if (!token || !isImpersonateTokenValid(token)) {
        console.log('[Impersonate] Token expired during session');
        clearImpersonation();
        // window.close()가 실패하면 (팝업이 아닌 경우) 알림 표시
        try {
          window.close();
          // 창이 닫히지 않았으면 리다이렉트
          setTimeout(() => {
            window.location.href = '/auth?expired=impersonate';
          }, 100);
        } catch {
          window.location.href = '/auth?expired=impersonate';
        }
      }
    }, 60000);

    return () => clearInterval(intervalId);
  }, [isImpersonating, clearImpersonation]);

  // Supabase 인증 리스너 (대리 로그인이 끝나면 다시 연결)
  useEffect(() => {
    // 대리 로그인 중에는 Supabase 세션을 가져오지 않음
    if (isImpersonating) {
      return;
    }

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.warn('[Auth] Session restore failed, signing out:', error.message);
        supabase.auth.signOut();
      }
      setSession(session);
      setIsAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setIsAuthLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [isImpersonating]); // isImpersonating이 false가 되면 리스너 재설정

  const { data: user, isLoading: isUserLoading, isError, error, refetch } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: 2,
    retryDelay: 1000,
    enabled: (!!session || hasLocalDevAuth) && !isImpersonating,
  });

  useEffect(() => {
    if (isError && error) {
      console.error('Failed to fetch user:', error);
    }
  }, [isError, error]);

  const signOut = useCallback(async () => {
    if (isImpersonatingRef.current) {
      localStorage.removeItem("impersonateToken");
      localStorage.removeItem("impersonateUser");
      try {
        window.close();
        setTimeout(() => {
          window.location.href = '/auth?ended=impersonate';
        }, 100);
      } catch {
        window.location.href = '/auth?ended=impersonate';
      }
      return;
    }
    if (hasLocalDevAuth) {
      await fetch("/api/dev/auth/logout", {
        method: "POST",
        credentials: "include",
      }).catch(() => undefined);
      localStorage.removeItem("localDevAuth");
      setHasLocalDevAuth(false);
      window.location.href = "/auth";
      return;
    }
    await supabase.auth.signOut();
    window.location.href = "/auth";
  }, []);

  const endImpersonation = useCallback(() => {
    localStorage.removeItem("impersonateToken");
    localStorage.removeItem("impersonateUser");
    try {
      window.close();
      // 창이 닫히지 않았으면 리다이렉트
      setTimeout(() => {
        window.location.href = '/auth?ended=impersonate';
      }, 100);
    } catch {
      window.location.href = '/auth?ended=impersonate';
    }
  }, []);

  const isLoading = isAuthLoading || (!isImpersonating && (!!session || hasLocalDevAuth) && isUserLoading && !isError);

  const effectiveUser = isImpersonating ? impersonatedUser : ((session || hasLocalDevAuth) ? user : undefined);
  const effectiveSession = isImpersonating
    ? { user: impersonatedUser } as any
    : session || (hasLocalDevAuth && user ? { user } as any : null);

  return {
    user: effectiveUser,
    session: effectiveSession,
    isLoading,
    isError: isImpersonating ? false : isError,
    isAuthenticated: isImpersonating ? true : (!!effectiveSession && !!effectiveUser),
    isImpersonating,
    refetchUser: refetch,
    signOut,
    endImpersonation,
  };
}
