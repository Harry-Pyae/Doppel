// Test accounts and pairs in the LOCAL Supabase (playwright.config.ts refuses any other).
// The game itself never creates accounts; only this test setup does, locally.
import { createClient } from "@supabase/supabase-js";
import { ACCOUNTS, PASSWORD, PENDING, syncPairs } from "./accounts";

export default async function setup() {
  const url = process.env.E2E_SUPABASE_URL!;
  const key = process.env.E2E_SERVICE_KEY!;
  if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error("E2E setup only runs against the local Supabase");
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const a of [...ACCOUNTS, PENDING]) {
    const email = `${a.username}@e2e.invalid`;
    let user = data.users.find((u) => u.email === email);
    if (!user) {
      const made = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
      if (made.error) throw made.error;
      user = made.data.user;
    }
    const { error } = await admin.from("profiles").upsert({ id: user.id, username: a.username, display_name: a.name, status: a === PENDING ? "pending" : "approved" });
    if (error) throw error;
  }
  // The current pairs.
  syncPairs();
}
