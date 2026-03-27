import { createClient } from "@supabase/supabase-js";
import type { Session } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Supabase client environment is missing. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

let cachedSession: Session | null = null;
let authBootstrapPromise: Promise<Session | null> | null = null;

function updateCachedSession(session: Session | null) {
  cachedSession = session;
}

authBootstrapPromise = supabase.auth.getSession().then(({ data }) => {
  updateCachedSession(data.session);
  return data.session;
});

supabase.auth.onAuthStateChange((_event, nextSession) => {
  updateCachedSession(nextSession);
});

export function getCachedAccessToken() {
  return cachedSession?.access_token ?? null;
}

export async function getAccessToken() {
  if (cachedSession) {
    return cachedSession.access_token;
  }

  const session = await authBootstrapPromise;
  return session?.access_token ?? null;
}

if (typeof window !== "undefined") {
  window.supabase = supabase;
}
