// The Supabase clients on the server. Only src/server touches the service-role key
// (tests/secrets.test.ts checks it); it never reaches the browser.
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseConfigured = () => !!(url() && anonKey() && serviceKey());

/** Sessions last 30 days, as in the shared PolyHydra sign-in. */
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

/** The signed-in player's client (their session cookie; RLS applies). */
export async function userClient(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(url()!, anonKey()!, {
    cookieOptions: { maxAge: SESSION_MAX_AGE, sameSite: "lax", secure: process.env.NODE_ENV === "production" },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server components cannot set cookies; the browser client refreshes the session itself.
        }
      },
    },
  });
}

let admin: SupabaseClient | undefined;
/** The service role, for the sign-in lookups only. Never writes accounts. */
export function adminClient(): SupabaseClient {
  admin ??= createClient(url()!, serviceKey()!, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}
