// The browser's Supabase client: the anon key plus the player's own session. It can
// call the imposter functions and listen for "room changed"; RLS does the rest.
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;
export function browserClient() {
  client ??= createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    db: { schema: "imposter" },
  }) as unknown as SupabaseClient;
  return client;
}
