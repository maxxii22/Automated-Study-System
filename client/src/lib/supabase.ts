import type { Session, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Supabase client environment is missing. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
}

const resolvedSupabaseUrl = supabaseUrl;
const resolvedSupabaseAnonKey = supabaseAnonKey;

type AuthSessionListener = (session: Session | null) => void;

let cachedSession: Session | null = null;
let supabaseClientPromise: Promise<SupabaseClient> | null = null;
let authBootstrapPromise: Promise<Session | null> | null = null;
let authSubscriptionPromise: Promise<void> | null = null;

const authSessionListeners = new Set<AuthSessionListener>();

function updateCachedSession(session: Session | null) {
  cachedSession = session;
  authSessionListeners.forEach((listener) => listener(session));
}

export async function getSupabaseClient() {
  if (!supabaseClientPromise) {
    supabaseClientPromise = import("@supabase/supabase-js")
      .then(({ createClient }) => {
        const client = createClient(resolvedSupabaseUrl, resolvedSupabaseAnonKey);

        if (typeof window !== "undefined") {
          window.supabase = client;
        }

        return client;
      })
      .catch((error) => {
        supabaseClientPromise = null;
        throw error;
      });
  }

  return supabaseClientPromise;
}

async function ensureAuthSubscription() {
  if (!authSubscriptionPromise) {
    authSubscriptionPromise = getSupabaseClient()
      .then((client) => {
        client.auth.onAuthStateChange((_event, nextSession) => {
          updateCachedSession(nextSession);
        });
      })
      .catch((error) => {
        authSubscriptionPromise = null;
        throw error;
      });
  }

  return authSubscriptionPromise;
}

export function getCachedAccessToken() {
  return cachedSession?.access_token ?? null;
}

export function getCachedSession() {
  return cachedSession;
}

export async function hydrateSession() {
  await ensureAuthSubscription();

  if (!authBootstrapPromise) {
    authBootstrapPromise = getSupabaseClient()
      .then((client) => client.auth.getSession())
      .then(({ data }) => {
        updateCachedSession(data.session);
        return data.session;
      })
      .catch((error) => {
        authBootstrapPromise = null;
        throw error;
      });
  }

  return authBootstrapPromise;
}

export async function getAccessToken() {
  if (cachedSession) {
    return cachedSession.access_token;
  }

  const session = await hydrateSession();
  return session?.access_token ?? null;
}

export async function subscribeToAuthState(listener: AuthSessionListener) {
  authSessionListeners.add(listener);

  try {
    await ensureAuthSubscription();
  } catch (error) {
    authSessionListeners.delete(listener);
    throw error;
  }

  return () => {
    authSessionListeners.delete(listener);
  };
}

export async function signOut() {
  const client = await getSupabaseClient();
  await client.auth.signOut();
}
