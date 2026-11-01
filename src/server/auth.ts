// Sign-in, all in this one module (README "Sign-in and the PolyHydra hand-off").
//
// Today: username + password with the shared PolyHydra accounts and the same rules as
// the PolyHydra sign-in (The Gilded Delve, ACCOUNTS.md A1/A11.4): the server finds the
// account's internal address by username; unknown names and wrong passwords get the same
// answer after the same wait; 5 wrong passwords lock the name typed for 15 minutes
// (the shared login_locks table); admin accounts never sign in here. No sign-up.
//
// Later: the hub hand-off replaces signIn() (a single-use 60-second code arrives by form
// POST and the server exchanges it for a session). Only this file and its route change.
//
// This game never creates, changes or approves accounts.
import { adminClient, supabaseConfigured, userClient } from "./supabase";

type Profile = { id: string; username: string; display_name: string | null; status: "pending" | "approved" | "blocked"; banned_until: string | null };
export type SignInError = "wrong" | "locked" | "pending" | "blocked" | "off";
export type Player = { name: string; allowed: boolean };

/** Approved, or blocked by a timed ban that has ended (read, never written). Same rule as imposter.player(). */
export const allowed = (p: Pick<Profile, "status" | "banned_until">) =>
  p.status === "approved" || (p.status === "blocked" && !!p.banned_until && Date.parse(p.banned_until) < Date.now());

const COLUMNS = "id, username, display_name, status, banned_until";
const usernameKey = (name: string) => name.normalize("NFC").trim().toLowerCase();
const slow = () => new Promise((r) => setTimeout(r, 1000));

async function profileByUsername(username: string) {
  // Exact, case-insensitive: ilike with its wildcards escaped.
  const pattern = username.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data } = await adminClient().from("profiles").select(COLUMNS).ilike("username", pattern).limit(1);
  return (data?.[0] as Profile | undefined) ?? null;
}

async function locked(key: string) {
  const { data } = await adminClient().from("login_locks").select("locked_until").eq("username_key", key).eq("kind", "password").maybeSingle();
  return !!data?.locked_until && Date.parse(data.locked_until) > Date.now();
}

export async function signIn(rawUsername: string, password: string): Promise<{ error: SignInError } | { ok: true }> {
  if (!supabaseConfigured()) return { error: "off" };
  const username = rawUsername.normalize("NFC").trim();
  const key = usernameKey(username);
  if (await locked(key)) return slow().then(() => ({ error: "locked" as const }));
  const wrong = async () => {
    const { data: lockedUntil } = await adminClient().rpc("login_fail", { p_key: key, p_kind: "password" });
    await slow();
    return { error: lockedUntil ? ("locked" as const) : ("wrong" as const) };
  };
  const profile = username ? await profileByUsername(username) : null;
  const email = profile ? (await adminClient().auth.admin.getUserById(profile.id)).data.user?.email : null;
  if (!profile || !email) return wrong();
  const supabase = await userClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return wrong();
  if (data.user.app_metadata?.kind === "admin") {
    await supabase.auth.signOut({ scope: "local" });
    return wrong();
  }
  await adminClient().from("login_locks").delete().eq("username_key", key).eq("kind", "password");
  if (!allowed(profile)) {
    await supabase.auth.signOut({ scope: "local" });
    return { error: profile.status === "pending" ? "pending" : "blocked" };
  }
  return { ok: true };
}

export async function signOut() {
  if (!supabaseConfigured()) return;
  await (await userClient()).auth.signOut({ scope: "local" });
}

/** The signed-in player (status read from the shared profiles table), or null. */
export async function currentPlayer(): Promise<Player | null> {
  if (!supabaseConfigured()) return null;
  const { data } = await (await userClient()).auth.getUser();
  if (!data.user || data.user.app_metadata?.kind === "admin") return null;
  const { data: profile } = await adminClient().from("profiles").select(COLUMNS).eq("id", data.user.id).maybeSingle<Profile>();
  if (!profile) return null;
  return { name: profile.display_name || profile.username, allowed: allowed(profile) };
}
