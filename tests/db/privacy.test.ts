// Privacy (README "Privacy"): during a round each player gets only their own character.
// Nobody, not even the doppel or the host, can read who the doppel is, through tables,
// functions or Realtime, until the host reveals it.
import { beforeAll, describe, expect, test } from "vitest";
import { addPairs, addUser, as, call, freshDb, type Db } from "./db";

type State = { status: string; room: { id: string; reveal: unknown }; players: Record<string, unknown>[]; card: { character: string } | null };

let db: Db;
let room: string;
const ids: string[] = [];

beforeAll(async () => {
  db = await freshDb();
  await addPairs(db, 8);
  for (const name of ["Ann", "Ben", "Cho", "Dee"]) ids.push(await addUser(db, name));
  const { code, room_id } = await call<{ code: string; room_id: string }>(db, ids[0], "create_room");
  room = room_id;
  for (const id of ids.slice(1)) await call(db, id, "join_room", code);
  await call(db, ids[0], "start_round", room);
}, 30_000);

describe("tables (RLS)", () => {
  test("no player reads the assignments, not even their own row (it holds the role)", async () => {
    for (const id of ids) await expect(as(db, id, "select * from imposter.assignments")).rejects.toThrow(/permission denied/);
    await expect(as(db, ids[1], "select character_id from imposter.assignments where user_id = $1", [ids[1]])).rejects.toThrow(/permission denied/);
  });

  test("anon cannot read assignments at all", async () => {
    await expect(as(db, null, "select * from imposter.assignments")).rejects.toThrow(/permission denied/);
  });

  test("rooms (with the round's record), members, pairs and recent pairs are not readable directly", async () => {
    for (const table of ["rooms", "members", "pairs", "recent_pairs"]) {
      await expect(as(db, ids[1], `select * from imposter.${table}`), table).rejects.toThrow(/permission denied/);
      await expect(as(db, null, `select * from imposter.${table}`), table).rejects.toThrow(/permission denied/);
    }
  });

  test("players cannot write cards", async () => {
    await expect(as(db, ids[1], "update imposter.assignments set is_imposter = true")).rejects.toThrow(/permission denied/);
    await expect(as(db, ids[1], "insert into imposter.assignments values ($1, $2, 9, 'x', true)", [room, ids[1]])).rejects.toThrow(/permission denied/);
  });

  test("RLS still holds if every table is granted to the API roles (Supabase's 'expose schema' snippet)", async () => {
    await db.exec("grant all on all tables in schema imposter to anon, authenticated");
    try {
      for (const table of ["assignments", "rooms", "members", "pairs", "recent_pairs"]) {
        expect(await as(db, ids[1], `select * from imposter.${table}`), table).toEqual([]);
        expect(await as(db, null, `select * from imposter.${table}`), table).toEqual([]);
      }
      await expect(as(db, ids[1], "insert into imposter.assignments values ($1, $2, 9, 'x', true)", [room, ids[1]])).rejects.toThrow(/row-level security/);
      expect(await as(db, ids[1], "update imposter.assignments set is_imposter = true where user_id <> auth.uid() returning *")).toEqual([]);
      expect(await as(db, ids[1], "delete from imposter.members returning *")).toEqual([]);
    } finally {
      await db.exec("revoke all on all tables in schema imposter from anon, authenticated");
    }
  });
});

describe("functions", () => {
  test("my_state gives each player only their own character: no role, flag or pair, the host included", async () => {
    const cards = await db.query<{ user_id: string; character_id: string }>("select * from imposter.assignments");
    const answers: string[] = [];
    for (const id of ids) {
      const state = await call<State>(db, id, "my_state", room);
      const mine = cards.rows.find((c) => c.user_id === id)!;
      expect(state.card).toEqual({ character: mine.character_id });
      expect(state.room.reveal).toBeNull();
      for (const p of state.players) expect(Object.keys(p).sort()).toEqual(["connected", "host", "id", "name", "waiting"]);
      // No other character id, pair id, role or flag appears anywhere in the answer.
      const text = JSON.stringify({ ...state, card: null });
      for (const c of cards.rows) expect(text).not.toContain(`"${c.character_id}"`);
      expect(text).not.toMatch(/"p\d+"|imposter|doppel/i);
      // Apart from their own character and who is asking, every answer is the same.
      answers.push(JSON.stringify({ ...state, now: 0, card: null, me: null, room: { ...state.room, host: null } }));
    }
    expect(new Set(answers).size).toBe(1);
  });

  test("anon cannot call any function", async () => {
    for (const fn of ["my_state()", "create_room()", "join_room('ABCDEF')", "leave_room()", `start_round('${room}')`]) {
      await expect(as(db, null, `select imposter.${fn}`), fn).rejects.toThrow(/permission denied/);
    }
  });

  test("internal helpers are not callable by players", async () => {
    for (const fn of [`ping('${room}')`, `pass_host('${room}', '${ids[0]}')`, "cleanup()", "player()"]) {
      await expect(as(db, ids[1], `select imposter.${fn}`), fn).rejects.toThrow(/permission denied/);
    }
  });

  test("Realtime carries only an empty 'changed' ping", async () => {
    const sent = (await db.query<{ payload: unknown; event: string; topic: string; private: boolean }>("select payload, event, topic, private from realtime.sent")).rows;
    expect(sent.length).toBeGreaterThan(0);
    for (const s of sent) expect(s).toEqual({ payload: {}, event: "changed", topic: `room:${room}`, private: false });
  });
});

describe("accounts (shared profiles, read on every call)", () => {
  test("pending, blocked and profile-less accounts cannot play", async () => {
    const pending = await addUser(db, "Pen", "pending");
    const blocked = await addUser(db, "Blo", "blocked");
    const banned = await addUser(db, "Ban", "blocked", new Date(Date.now() + 86_400_000).toISOString());
    const [{ id: bare }] = (await db.query<{ id: string }>("insert into auth.users default values returning id")).rows;
    for (const id of [pending, blocked, banned, bare]) await expect(call(db, id, "my_state")).rejects.toThrow(/not_allowed/);
  });

  test("a timed ban that has ended counts as approved (and is not written)", async () => {
    const id = await addUser(db, "Was", "blocked", new Date(Date.now() - 1000).toISOString());
    expect(await call<State>(db, id, "my_state")).toEqual({ status: "none" });
    expect((await db.query("select status from public.profiles where id = $1", [id])).rows).toEqual([{ status: "blocked" }]);
  });

  test("a ban takes effect on the next call", async () => {
    const id = await addUser(db, "Eve");
    expect(await call<State>(db, id, "my_state")).toEqual({ status: "none" });
    await db.query("update public.profiles set status = 'blocked' where id = $1", [id]);
    await expect(call(db, id, "my_state")).rejects.toThrow(/not_allowed/);
  });
});
