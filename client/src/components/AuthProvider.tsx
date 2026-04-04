import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from "react";
import { useLocation } from "react-router-dom";

import type { Session, User } from "@supabase/supabase-js";

import { getCachedSession, hydrateSession, signOut as signOutFromSupabase, subscribeToAuthState } from "../lib/supabase";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  accessToken: string | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function syncAuthState(
  nextSession: Session | null,
  setSession: (session: Session | null) => void,
  setUser: (user: User | null) => void,
  setAccessToken: (accessToken: string | null) => void
) {
  setSession(nextSession);
  setUser(nextSession?.user ?? null);
  setAccessToken(nextSession?.access_token ?? null);
}

export function AuthProvider({ children }: PropsWithChildren) {
  const location = useLocation();
  const initialSession = getCachedSession();
  const [session, setSession] = useState<Session | null>(initialSession);
  const [user, setUser] = useState<User | null>(initialSession?.user ?? null);
  const [accessToken, setAccessToken] = useState<string | null>(initialSession?.access_token ?? null);
  const [isLoading, setIsLoading] = useState(location.pathname !== "/");
  const authReadyPromiseRef = useRef<Promise<void> | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const ensureAuthReady = useCallback(
    async (shouldBlock: boolean) => {
      if (shouldBlock) {
        setIsLoading(true);
      }

      if (!authReadyPromiseRef.current) {
        authReadyPromiseRef.current = (async () => {
          if (!unsubscribeRef.current) {
            unsubscribeRef.current = await subscribeToAuthState((nextSession) => {
              syncAuthState(nextSession, setSession, setUser, setAccessToken);
              setIsLoading(false);
            });
          }

          const nextSession = await hydrateSession();
          syncAuthState(nextSession, setSession, setUser, setAccessToken);
          setIsLoading(false);
        })().catch((error) => {
          authReadyPromiseRef.current = null;
          setIsLoading(false);
          throw error;
        });
      }

      await authReadyPromiseRef.current;
      setIsLoading(false);
    },
    []
  );

  useEffect(() => {
    let timeoutId: number | null = null;
    const needsImmediateAuth = location.pathname !== "/";

    if (needsImmediateAuth) {
      void ensureAuthReady(true).catch(() => undefined);
    } else {
      timeoutId = window.setTimeout(() => {
        void ensureAuthReady(false).catch(() => undefined);
      }, 1200);
    }

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [ensureAuthReady, location.pathname]);

  useEffect(() => {
    return () => {
      unsubscribeRef.current?.();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        accessToken,
        isLoading,
        signOut: async () => {
          await ensureAuthReady(false);
          await signOutFromSupabase();
        }
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }

  return context;
}
