import type { PropsWithChildren } from "react";
import { createContext, useContext, useEffect, useState } from "react";

import type { Session, User } from "@supabase/supabase-js";

import { getAccessToken, supabase } from "../lib/supabase";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  accessToken: string | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!ignore) {
        setSession(data.session);
        setUser(data.session?.user ?? null);
        setAccessToken((await getAccessToken()) ?? null);
        setIsLoading(false);
      }
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setAccessToken(nextSession?.access_token ?? null);
      setIsLoading(false);
    });

    return () => {
      ignore = true;
      subscription.unsubscribe();
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
          await supabase.auth.signOut();
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
