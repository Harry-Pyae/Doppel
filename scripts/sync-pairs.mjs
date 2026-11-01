// npm run data:sync: copies data/pairs.json into imposter.pairs (the round function
// deals from that table). Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// (read from .env.local, or the environment). Run it after every change to pairs.json.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { checkData, pairId } from "./check-data.mjs";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: use the environment as it is.
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (in .env.local) first.");
  process.exit(1);
}
const { errors } = checkData();
if (errors.length) {
  console.error("Fix the data first (npm run data:check).");
  process.exit(1);
}

const pairs = JSON.parse(readFileSync(new URL("../data/pairs.json", import.meta.url), "utf8"));
const rows = pairs.map(([a, b]) => ({ id: pairId([a, b]), a, b }));
const db = createClient(url, key, { auth: { persistSession: false }, db: { schema: "imposter" } });
const up = await db.from("pairs").upsert(rows);
if (up.error) throw new Error(up.error.message);
const keep = rows.map((r) => `"${r.id}"`).join(",");
const gone = await db.from("pairs").delete().not("id", "in", `(${keep})`).select("id");
if (gone.error) throw new Error(gone.error.message);
console.log(`✓ ${rows.length} pairs in ${new URL(url).host}${gone.data.length ? `, ${gone.data.length} removed` : ""}.`);
