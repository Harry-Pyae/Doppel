// The room rules the database enforces (README "Rules"), on a real Postgres.
import { beforeEach, describe, expect, test } from "vitest";
import { addPairs, addUser, call, freshDb, type Db } from "./db";

type Player = { id: string; name: string; host: boolean; connected: boolean; waiting: boolean };
type State = {
  status: string;
  now: number;
  room: {
    id: string;
    code: string;
    phase: string;
    round: number;
    host: boolean;
    host_changed_at: string | null;
    timer: { minutes: number; started_at: number | null; ends_at: number | null };
  };
  me: { id: string; waiting: boolean };
  players: Player[];
  card: { character: string; imposter: boolean } | null;
};

let db: Db;
const users: string[] = [];

/** A room hosted by users[0] with users[1..n-1] in it. */
async function room(n: number) {
  const { code, room_id } = await call<{ code: string; room_id: string }>(db, users[0], "create_room");
  for (const id of users.slice(1, n)) await call(db, id, "join_room", code);
  return { code, id: room_id };
}
const state = (uid: string, roomId?: string) => call<State>(db, uid, "my_state", roomId ?? null);
const cards = async (roomId: string) => (await db.query<{ user_id: string; character_id: string; is_imposter: boolean }>("select * from imposter.assignments where room_id = $1", [roomId])).rows;

beforeEach(async () => {
  db = await freshDb();
  await addPairs(db, 8);
  users.length = 0;
  for (let i = 0; i < 14; i++) users.push(await addUser(db, `Player${i}`));
}, 30_000);

describe("rooms and codes", () => {
  test("codes are 6 characters without 0, O, 1 or I", async () => {
    for (let i = 0; i < 20; i++) {
      const { code } = await call<{ code: string }>(db, users[i % 14], "create_room");
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    }
  });

  test("joining ignores case and spaces", async () => {
    const { code, room_id: id } = await call<{ code: string; room_id: string }>(db, users[0], "create_room");
    const sloppy = ` ${code.slice(0, 3).toLowerCase()} ${code.slice(3)} `;
    expect(await call(db, users[1], "join_room", sloppy)).toEqual({ room_id: id, waiting: false });
    // A second tap is harmless.
    expect(await call(db, users[1], "join_room", code)).toEqual({ room_id: id, waiting: false });
    expect((await state(users[0])).players.map((p) => p.name)).toEqual(["Player0", "Player1"]);
  });

  test("unknown codes are 'room not found'", async () => {
    await expect(call(db, users[1], "join_room", "ZZZZZZ")).rejects.toThrow(/room_not_found/);
    await expect(call(db, users[1], "join_room", "O0I1AB")).rejects.toThrow(/room_not_found/);
  });

  test("a room holds at most 12", async () => {
    const r = await room(12);
    await expect(call(db, users[12], "join_room", r.code)).rejects.toThrow(/room_full/);
  });

  test("the list shows the host and who is connected", async () => {
    const r = await room(3);
    await db.query("update imposter.members set seen_at = now() - interval '30 seconds' where user_id = $1", [users[2]]);
    const players = (await state(users[1], r.id)).players;
    expect(players.map((p) => [p.name, p.host, p.connected])).toEqual([
      ["Player0", true, true],
      ["Player1", false, true],
      ["Player2", false, false],
    ]);
  });

  test("one room at a time: creating or joining another leaves the first", async () => {
    const a = await room(3);
    const b = await call<{ code: string; room_id: string }>(db, users[5], "create_room");
    await call(db, users[1], "join_room", b.code);
    expect((await state(users[0], a.id)).players.map((p) => p.name)).toEqual(["Player0", "Player2"]);
    expect((await state(users[1])).room.id).toBe(b.room_id);
  });
});

describe("rounds", () => {
  test("start needs 3 players and only the host may start", async () => {
    const two = await room(2);
    await expect(call(db, users[0], "start_round", two.id)).rejects.toThrow(/not_enough_players/);
    await call(db, users[2], "join_room", two.code);
    await expect(call(db, users[1], "start_round", two.id)).rejects.toThrow(/not_host/);
    await call(db, users[0], "start_round", two.id);
    await expect(call(db, users[0], "start_round", two.id)).rejects.toThrow(/round_in_progress/);
  });

  test("exactly one imposter; everyone else shares one character; both come from one pair", async () => {
    const r = await room(12);
    const pairs = (await db.query<{ a: string; b: string }>("select a, b from imposter.pairs")).rows;
    const sides = new Set<string>();
    for (let round = 0; round < 12; round++) {
      await call(db, users[0], "start_round", r.id);
      const dealt = await cards(r.id);
      expect(dealt).toHaveLength(12);
      const imposters = dealt.filter((c) => c.is_imposter);
      expect(imposters).toHaveLength(1);
      const others = new Set(dealt.filter((c) => !c.is_imposter).map((c) => c.character_id));
      expect(others.size).toBe(1);
      const [majority] = others;
      expect(imposters[0].character_id).not.toBe(majority);
      const pair = pairs.find((p) => [p.a, p.b].includes(majority))!;
      expect([pair.a, pair.b]).toContain(imposters[0].character_id);
      sides.add(majority === pair.a ? "a" : "b");
      await call(db, users[0], "restart_round", r.id);
    }
    // The majority side is random (12 rounds all one side: 1 in 2048).
    expect(sides.size).toBe(2);
  });

  test("the imposter is random", async () => {
    const r = await room(3);
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      await call(db, users[0], "start_round", r.id);
      seen.add((await cards(r.id)).find((c) => c.is_imposter)!.user_id);
      await call(db, users[0], "restart_round", r.id);
    }
    expect(seen.size).toBe(3);
  });

  test("a pair is never one of the room's last 5 (8 pairs)", async () => {
    const r = await room(3);
    const history: string[] = [];
    for (let i = 0; i < 30; i++) {
      await call(db, users[0], "start_round", r.id);
      const [{ pair_id }] = (await db.query<{ pair_id: string }>("select pair_id from imposter.recent_pairs where room_id = $1 order by used_at desc limit 1", [r.id])).rows;
      expect(history.slice(-5)).not.toContain(pair_id);
      history.push(pair_id);
      await call(db, users[0], "restart_round", r.id);
    }
    expect((await db.query("select * from imposter.recent_pairs where room_id = $1", [r.id])).rows).toHaveLength(5);
  });

  test("with few pairs, the last ones are avoided while one is left", async () => {
    await db.exec("delete from imposter.pairs where id not in ('p1', 'p2', 'p3')");
    const r = await room(3);
    const history: string[] = [];
    for (let i = 0; i < 12; i++) {
      await call(db, users[0], "start_round", r.id);
      const [{ pair_id }] = (await db.query<{ pair_id: string }>("select pair_id from imposter.recent_pairs where room_id = $1 order by used_at desc limit 1", [r.id])).rows;
      expect(history.slice(-2)).not.toContain(pair_id);
      history.push(pair_id);
      await call(db, users[0], "restart_round", r.id);
    }
  });

  test("joiners during a round wait, get no card, and play after Restart", async () => {
    const r = await room(3);
    await call(db, users[0], "start_round", r.id);
    expect(await call(db, users[3], "join_room", r.code)).toEqual({ room_id: r.id, waiting: true });
    const late = await state(users[3]);
    expect(late.me.waiting).toBe(true);
    expect(late.card).toBeNull();
    await call(db, users[0], "restart_round", r.id);
    expect((await state(users[3])).me.waiting).toBe(false);
    await call(db, users[0], "start_round", r.id);
    expect(await cards(r.id)).toHaveLength(4);
  });

  test("Restart keeps the list and clears the cards; End closes the room for everyone", async () => {
    const r = await room(4);
    await call(db, users[0], "start_round", r.id);
    await expect(call(db, users[1], "restart_round", r.id)).rejects.toThrow(/not_host/);
    await call(db, users[0], "restart_round", r.id);
    const after = await state(users[1]);
    expect(after.room.phase).toBe("lobby");
    expect(after.card).toBeNull();
    expect(after.players).toHaveLength(4);
    expect(await cards(r.id)).toEqual([]);
    await expect(call(db, users[1], "end_room", r.id)).rejects.toThrow(/not_host/);
    await call(db, users[0], "end_room", r.id);
    expect(await state(users[1], r.id)).toEqual({ status: "ended" });
    expect(await state(users[0], r.id)).toEqual({ status: "ended" });
  });
});

describe("players leaving", () => {
  test("removed players cannot rejoin (by account) and are told so", async () => {
    const r = await room(4);
    await expect(call(db, users[1], "remove_player", r.id, users[2])).rejects.toThrow(/not_host/);
    await call(db, users[0], "remove_player", r.id, users[2]);
    expect(await state(users[2], r.id)).toEqual({ status: "removed" });
    await expect(call(db, users[2], "join_room", r.code)).rejects.toThrow(/removed/);
    expect((await state(users[0])).players.map((p) => p.name)).toEqual(["Player0", "Player1", "Player3"]);
    // They can still make or join other rooms.
    await call(db, users[2], "create_room");
  });

  test("a removed player's card is deleted", async () => {
    const r = await room(4);
    await call(db, users[0], "start_round", r.id);
    await call(db, users[0], "remove_player", r.id, users[3]);
    expect((await cards(r.id)).map((c) => c.user_id)).not.toContain(users[3]);
  });

  test("a host away for 3 minutes (not less) passes the role to the longest-connected player", async () => {
    await room(4);
    await db.query("update imposter.members set connected_since = now() - interval '5 minutes' where user_id = $1", [users[2]]);
    await db.query("update imposter.members set seen_at = now() - interval '170 seconds' where user_id = $1", [users[0]]);
    expect((await state(users[1])).room.host).toBe(false);
    expect((await state(users[0])).room.host).toBe(true);
    await db.query("update imposter.members set seen_at = now() - interval '181 seconds' where user_id = $1", [users[0]]);
    const s = await state(users[1]);
    expect(s.players.find((p) => p.host)?.name).toBe("Player2");
    expect(s.room.host_changed_at).not.toBeNull();
    expect((await state(users[2])).room.host).toBe(true);
    // The old host is still in the room, as a player.
    expect((await state(users[0])).room.host).toBe(false);
  });

  test("an away player does not become host", async () => {
    const r = await room(3);
    await db.query("update imposter.members set seen_at = now() - interval '181 seconds', connected_since = now() - interval '1 hour' where user_id = $1", [users[0]]);
    await db.query("update imposter.members set seen_at = now() - interval '40 seconds', connected_since = now() - interval '1 hour' where user_id = $1", [users[1]]);
    await state(users[2], r.id);
    expect((await state(users[2])).room.host).toBe(true);
  });

  test("a host who leaves passes the role at once; the last one out deletes the room", async () => {
    const r = await room(3);
    await call(db, users[0], "leave_room");
    expect((await state(users[0], r.id)).status).toBe("none");
    expect((await state(users[1])).room.host).toBe(true);
    await call(db, users[1], "leave_room");
    await call(db, users[2], "leave_room");
    expect((await db.query("select * from imposter.rooms")).rows).toEqual([]);
  });
});

describe("round timer", () => {
  test("2 minutes by default; only the host sets it, to Off, 1, 2, 3 or 5 minutes; everyone sees it", async () => {
    const r = await room(3);
    expect((await state(users[1])).room.timer).toEqual({ minutes: 2, started_at: null, ends_at: null });
    await expect(call(db, users[1], "set_timer", r.id, 5)).rejects.toThrow(/not_host/);
    await expect(call(db, users[0], "set_timer", r.id, 4)).rejects.toThrow(/bad_timer/);
    for (const m of [0, 1, 3, 5]) {
      await call(db, users[0], "set_timer", r.id, m);
      expect((await state(users[2])).room.timer.minutes).toBe(m);
    }
  });

  test("only the host starts, adds to and stops it; only during a round; never on its own", async () => {
    const r = await room(3);
    await expect(call(db, users[0], "timer", r.id, "start")).rejects.toThrow(/no_round/);
    await call(db, users[0], "start_round", r.id);
    expect((await state(users[1])).room.timer.ends_at).toBeNull();
    for (const action of ["start", "add", "stop"]) await expect(call(db, users[1], "timer", r.id, action)).rejects.toThrow(/not_host/);
    await expect(call(db, users[0], "timer", r.id, "add")).rejects.toThrow(/timer_not_running/);

    await call(db, users[0], "timer", r.id, "start");
    let s = await state(users[1]);
    const { started_at, ends_at } = s.room.timer;
    expect(ends_at! - started_at!).toBe(120_000);
    expect(Math.abs(ends_at! - 120_000 - s.now)).toBeLessThan(2_000);
    // Start again while it runs: nothing changes.
    await call(db, users[0], "timer", r.id, "start");
    expect((await state(users[2])).room.timer.ends_at).toBe(ends_at);

    await call(db, users[0], "timer", r.id, "add");
    s = await state(users[2]);
    expect(s.room.timer.ends_at).toBe(ends_at! + 30_000);
    expect(s.room.timer.started_at).toBe(started_at);

    // Once time is up, +30 s counts from now.
    await db.query("update imposter.rooms set timer_ends_at = now() - interval '10 seconds' where id = $1", [r.id]);
    await call(db, users[0], "timer", r.id, "add");
    s = await state(users[1]);
    expect(s.room.timer.ends_at! - s.now).toBeGreaterThan(28_000);
    expect(s.room.timer.ends_at! - s.room.timer.started_at!).toBe(30_000);

    await call(db, users[0], "timer", r.id, "stop");
    expect((await state(users[1])).room.timer).toEqual({ minutes: 2, started_at: null, ends_at: null });
  });

  test("Off cannot be started", async () => {
    const r = await room(3);
    await call(db, users[0], "set_timer", r.id, 0);
    await call(db, users[0], "start_round", r.id);
    await expect(call(db, users[0], "timer", r.id, "start")).rejects.toThrow(/timer_off/);
  });

  test("Restart clears it (the length is kept); End removes it with the room", async () => {
    const r = await room(3);
    await call(db, users[0], "set_timer", r.id, 3);
    await call(db, users[0], "start_round", r.id);
    await call(db, users[0], "timer", r.id, "start");
    await call(db, users[0], "restart_round", r.id);
    expect((await state(users[1])).room.timer).toEqual({ minutes: 3, started_at: null, ends_at: null });
    await call(db, users[0], "start_round", r.id);
    expect((await state(users[1])).room.timer.ends_at).toBeNull();
    await call(db, users[0], "timer", r.id, "start");
    await call(db, users[0], "end_room", r.id);
    expect((await db.query("select * from imposter.rooms")).rows).toEqual([]);
  });

  test("players outside the room and anon cannot touch it", async () => {
    const r = await room(3);
    await call(db, users[0], "start_round", r.id);
    await expect(call(db, users[5], "timer", r.id, "start")).rejects.toThrow(/not_in_room/);
    await expect(call(db, users[5], "set_timer", r.id, 1)).rejects.toThrow(/not_in_room/);
    await expect(call(db, null, "timer", r.id, "start")).rejects.toThrow(/permission denied/);
    await expect(call(db, null, "set_timer", r.id, 1)).rejects.toThrow(/permission denied/);
  });
});

test("rooms are deleted after 6 hours without activity", async () => {
  const r = await room(3);
  await db.query("update imposter.rooms set active_at = now() - interval '6 hours 1 minute' where id = $1", [r.id]);
  await call(db, users[9], "create_room");
  expect(await state(users[1], r.id)).toEqual({ status: "ended" });
});
