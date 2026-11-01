// A real Postgres in-process (PGlite) with the Supabase shim and the migrations,
// for the RLS privacy tests and the room rules, without Docker.
import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const root = new URL("../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

export async function freshDb() {
  const db = new PGlite();
  await db.exec(read("tests/db/shim.sql"));
  for (const file of readdirSync(new URL("supabase/migrations/", root)).sort()) await db.exec(read(`supabase/migrations/${file}`));
  return db;
}

export type Db = Awaited<ReturnType<typeof freshDb>>;

/** Runs `sql` as a signed-in user (role authenticated, auth.uid() = uid), or as anon when uid is null. */
export async function as<T = Record<string, unknown>>(db: Db, uid: string | null, sql: string, params: unknown[] = []) {
  await db.exec(uid ? `set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);` : "set role anon; select set_config('request.jwt.claim.sub', '', false);");
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec("reset role;");
  }
}

/** One function call as a user; returns its single value. */
export async function call<T = unknown>(db: Db, uid: string | null, fn: string, ...args: unknown[]) {
  const params = args.map((_, i) => `$${i + 1}`).join(", ");
  const [row] = await as<{ v: T }>(db, uid, `select imposter.${fn}(${params}) as v`, args);
  return row.v;
}

/** An account in auth.users plus its shared profile. */
export async function addUser(db: Db, name: string, status = "approved", bannedUntil: string | null = null) {
  const [{ id }] = (await db.query<{ id: string }>("insert into auth.users (email) values ($1) returning id", [`${name}@example.test`])).rows;
  await db.query("insert into public.profiles (id, username, display_name, status, banned_until) values ($1, $2, $3, $4, $5)", [id, name.toLowerCase(), name, status, bannedUntil]);
  return id;
}

export async function addPairs(db: Db, count: number) {
  for (let i = 1; i <= count; i++) await db.query("insert into imposter.pairs (id, a, b) values ($1, $2, $3)", [`p${i}`, `a${i}`, `b${i}`]);
}
