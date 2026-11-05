import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

export const PASSWORD = "e2e-password-123";
export const ACCOUNTS = [
  { username: "e2e_ann", name: "Ann" },
  { username: "e2e_ben", name: "Ben" },
  { username: "e2e_cho", name: "Cho" },
  { username: "e2e_dee", name: "Dee" },
];
/** Waiting for approval: may not play. */
export const PENDING = { username: "e2e_pen", name: "Pen" };

/** The game's API as one test account, straight to the database (as a phone would call it). */
export async function api(a: (typeof ACCOUNTS)[number]) {
  const db = createClient(process.env.E2E_SUPABASE_URL!, process.env.E2E_ANON_KEY!, { auth: { persistSession: false }, db: { schema: "imposter" } });
  const { error } = await db.auth.signInWithPassword({ email: `${a.username}@e2e.invalid`, password: PASSWORD });
  if (error) throw error;
  return db;
}

/** Copies data/pairs.json into the local database again (as npm run data:sync does). */
export function syncPairs() {
  const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: process.env.E2E_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.E2E_SERVICE_KEY };
  execSync("node scripts/sync-pairs.mjs", { stdio: "inherit", env });
}

/** Every test account leaves its room, so each test starts at the main menu. */
export async function leaveRooms() {
  for (const a of ACCOUNTS) await (await api(a)).rpc("leave_room");
}
