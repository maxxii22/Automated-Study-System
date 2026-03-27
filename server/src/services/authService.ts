import { createClient } from "@supabase/supabase-js";

import { env, getSupabaseAdminUserIds } from "../config/env.js";

export type AuthenticatedUser = {
  id: string;
  email?: string;
  isAdmin: boolean;
};

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export async function verifyAccessToken(accessToken: string) {
  const { data, error } = await supabase.auth.getUser(accessToken);

  if (error || !data.user) {
    return null;
  }

  const adminUserIds = new Set(getSupabaseAdminUserIds());

  return {
    id: data.user.id,
    email: data.user.email ?? undefined,
    isAdmin: adminUserIds.has(data.user.id)
  } satisfies AuthenticatedUser;
}
