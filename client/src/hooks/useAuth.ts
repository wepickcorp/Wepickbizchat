import { useState, useEffect, useCallback } from 'react';
import { useQuery } from "@tanstack/react-query";
import { supabase } from '@/lib/supabase';
import type { User } from "@shared/schema";
import type { Session } from '@supabase/supabase-js';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [impersonatedUser, setImpersonatedUser] = useState<User | null>(null);
  const [isImpersonating, setIsImpersonating] = useState(false);

  useEffect(() => {
    const impersonateToken = localStorage.getItem("impersonateToken");
    const impersonateUserData = localStorage.getItem("impersonateUser");
    
    if (impersonateToken && impersonateUserData) {
      try {
        const userData = JSON.parse(impersonateUserData);
        setImpersonatedUser(userData);
        setIsImpersonating(true);
        setIsAuthLoading(false);
        return;
      } catch (e) {
        localStorage.removeItem("impersonateToken");
        localStorage.removeItem("impersonateUser");
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
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
  }, []);

  const { data: user, isLoading: isUserLoading, isError, error, refetch } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: 2,
    retryDelay: 1000,
    enabled: !!session && !isImpersonating,
  });

  useEffect(() => {
    if (isError && error) {
      console.error('Failed to fetch user:', error);
    }
  }, [isError, error]);

  const signOut = useCallback(async () => {
    if (isImpersonating) {
      localStorage.removeItem("impersonateToken");
      localStorage.removeItem("impersonateUser");
      window.close();
      return;
    }
    await supabase.auth.signOut();
    window.location.href = "/auth";
  }, [isImpersonating]);

  const endImpersonation = useCallback(() => {
    localStorage.removeItem("impersonateToken");
    localStorage.removeItem("impersonateUser");
    window.close();
  }, []);

  const isLoading = isAuthLoading || (!isImpersonating && !!session && isUserLoading && !isError);

  const effectiveUser = isImpersonating ? impersonatedUser : (session ? user : undefined);
  const effectiveSession = isImpersonating ? { user: impersonatedUser } as any : session;

  return {
    user: effectiveUser,
    session: effectiveSession,
    isLoading,
    isError: isImpersonating ? false : isError,
    isAuthenticated: isImpersonating ? true : (!!session && !!user),
    isImpersonating,
    refetchUser: refetch,
    signOut,
    endImpersonation,
  };
}
