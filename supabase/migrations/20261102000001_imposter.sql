-- Vote Out the Imposter. Everything this game owns lives in the `imposter` schema.
-- Shared PolyHydra tables (public.profiles) are only read here, never written.
--
-- Privacy (README "Privacy"): clients read nothing directly except their own
-- assignment row (RLS). Every state change and every read goes through the
-- security-definer functions below, which lock the room row first, so two taps
-- at once cannot break a room. Realtime only ever carries an empty "changed" ping.

create schema if not exists imposter;
grant usage on schema imposter to anon, authenticated, service_role;

-- ---------- Tables ----------

-- Related character pairs, by id from data/characters.json (npm run data:sync fills it).
create table imposter.pairs (
  id text primary key,
  a text not null,
  b text not null,
  check (a <> b)
);

create table imposter.rooms (
  id uuid primary key default gen_random_uuid(),
  -- 6 characters without 0, O, 1 and I.
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  host_id uuid not null references auth.users (id) on delete cascade,
  phase text not null default 'lobby' check (phase in ('lobby', 'round')),
  round_no integer not null default 0,
  -- When the host role last passed to someone else ("<name> is now the host").
  host_changed_at timestamptz,
  created_at timestamptz not null default now(),
  active_at timestamptz not null default now()
);
create index rooms_active_at on imposter.rooms (active_at);

-- playing: in the room (and in the round, if one is on); waiting: joined during a
-- round, plays from the next one; removed: kept so the account cannot rejoin.
create table imposter.members (
  room_id uuid not null references imposter.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  state text not null default 'playing' check (state in ('playing', 'waiting', 'removed')),
  joined_at timestamptz not null default clock_timestamp(),
  seen_at timestamptz not null default now(),
  connected_since timestamptz not null default now(),
  primary key (room_id, user_id)
);
-- One room at a time per account.
create unique index members_one_room on imposter.members (user_id) where state <> 'removed';

-- One card per player for the current round. Each player reads only their own row.
create table imposter.assignments (
  room_id uuid not null references imposter.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  round_no integer not null,
  character_id text not null,
  is_imposter boolean not null,
  primary key (room_id, user_id)
);

-- The room's last 5 pairs, so they are not dealt again too soon.
create table imposter.recent_pairs (
  room_id uuid not null references imposter.rooms (id) on delete cascade,
  pair_id text not null,
  used_at timestamptz not null default clock_timestamp(),
  primary key (room_id, pair_id)
);

-- ---------- RLS: on everywhere; only the own assignment row is readable ----------

alter table imposter.pairs enable row level security;
alter table imposter.rooms enable row level security;
alter table imposter.members enable row level security;
alter table imposter.assignments enable row level security;
alter table imposter.recent_pairs enable row level security;

revoke all on all tables in schema imposter from public, anon, authenticated;
grant select on imposter.assignments to authenticated;
create policy assignments_own on imposter.assignments for select to authenticated using (user_id = auth.uid());
-- npm run data:sync writes the pairs with the service role (server/owner only).
grant select, insert, update, delete on imposter.pairs to service_role;

-- ---------- Internal helpers (not callable through the API) ----------

-- The caller, if signed in with an approved, not-banned PolyHydra account. Read from
-- the shared profiles table on every call. A timed ban that has ended counts as
-- approved (the shared sign-in lifts it the same way), but it is never written here.
create function imposter.player() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  ok boolean;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select p.status = 'approved' or (p.status = 'blocked' and p.banned_until is not null and p.banned_until < now())
    into ok from public.profiles p where p.id = uid;
  if ok is not true then raise exception 'not_allowed'; end if;
  return uid;
end $$;

-- Realtime: an empty "changed" ping on the room's topic. Phones then fetch their own state.
create function imposter.ping(p_room uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send('{}'::jsonb, 'changed', 'room:' || p_room::text, false);
end $$;

-- Rooms die after 6 hours or more without activity (on create/join, and hourly by pg_cron below).
create function imposter.cleanup() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from imposter.rooms where active_at <= now() - interval '6 hours';
end $$;

-- The room row, locked, with the caller checked as host when asked.
create function imposter.lock_room(p_room uuid, p_uid uuid, p_host boolean) returns imposter.rooms
language plpgsql security definer set search_path = '' as $$
declare r imposter.rooms;
begin
  select * into r from imposter.rooms where id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;
  if not exists (select 1 from imposter.members where room_id = p_room and user_id = p_uid and state <> 'removed') then
    raise exception 'not_in_room';
  end if;
  if p_host and r.host_id <> p_uid then raise exception 'not_host'; end if;
  return r;
end $$;

-- Hands the host role to the longest-connected other player (connected = seen in the
-- last 25 seconds), else to whoever joined first; deletes the room when nobody is left.
-- The room row must already be locked.
create function imposter.pass_host(p_room uuid, p_from uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare next_host uuid;
begin
  select user_id into next_host from imposter.members
    where room_id = p_room and user_id <> p_from and state <> 'removed'
    order by (seen_at >= now() - interval '25 seconds') desc, (state = 'playing') desc, connected_since, joined_at
    limit 1;
  if next_host is null then
    delete from imposter.rooms where id = p_room;
  else
    update imposter.rooms set host_id = next_host, host_changed_at = now(), active_at = now() where id = p_room;
  end if;
end $$;

-- Leaves the room the caller is in, if any (one room at a time).
create function imposter.leave_current(p_uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  rid uuid;
  r imposter.rooms;
begin
  select room_id into rid from imposter.members where user_id = p_uid and state <> 'removed';
  if rid is null then return; end if;
  select * into r from imposter.rooms where id = rid for update;
  delete from imposter.members where room_id = rid and user_id = p_uid;
  delete from imposter.assignments where room_id = rid and user_id = p_uid;
  if r.host_id = p_uid then perform imposter.pass_host(rid, p_uid); end if;
  perform imposter.ping(rid);
end $$;

-- ---------- The API ----------

create function imposter.create_room() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := imposter.player();
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  new_code text;
  rid uuid;
begin
  perform imposter.cleanup();
  perform imposter.leave_current(uid);
  loop
    select string_agg(substr(alphabet, 1 + floor(random() * 32)::int, 1), '') into new_code from generate_series(1, 6);
    begin
      insert into imposter.rooms (code, host_id) values (new_code, uid) returning id into rid;
      exit;
    exception when unique_violation then
      -- The code is taken: draw another.
    end;
  end loop;
  insert into imposter.members (room_id, user_id) values (rid, uid);
  return jsonb_build_object('room_id', rid, 'code', new_code);
end $$;

create function imposter.join_room(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := imposter.player();
  clean text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  r imposter.rooms;
  mine text;
begin
  perform imposter.cleanup();
  if clean !~ '^[A-HJ-NP-Z2-9]{6}$' then raise exception 'room_not_found'; end if;
  select * into r from imposter.rooms where code = clean;
  if not found then raise exception 'room_not_found'; end if;
  select state into mine from imposter.members where room_id = r.id and user_id = uid;
  if mine = 'removed' then raise exception 'removed'; end if;
  -- A second tap: already in.
  if mine is not null then return jsonb_build_object('room_id', r.id, 'waiting', mine = 'waiting'); end if;
  perform imposter.leave_current(uid);
  select * into r from imposter.rooms where id = r.id for update;
  if not found then raise exception 'room_not_found'; end if;
  -- Re-checked under the lock: two taps at once join once.
  select state into mine from imposter.members where room_id = r.id and user_id = uid;
  if mine = 'removed' then raise exception 'removed'; end if;
  if mine is not null then return jsonb_build_object('room_id', r.id, 'waiting', mine = 'waiting'); end if;
  if (select count(*) from imposter.members where room_id = r.id and state <> 'removed') >= 12 then raise exception 'room_full'; end if;
  insert into imposter.members (room_id, user_id, state) values (r.id, uid, case when r.phase = 'lobby' then 'playing' else 'waiting' end);
  update imposter.rooms set active_at = now() where id = r.id;
  perform imposter.ping(r.id);
  return jsonb_build_object('room_id', r.id, 'waiting', r.phase <> 'lobby');
end $$;

create function imposter.leave_room() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform imposter.leave_current(imposter.player());
end $$;

create function imposter.remove_player(p_room uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := imposter.player();
begin
  perform imposter.lock_room(p_room, uid, true);
  if p_user = uid then raise exception 'not_allowed'; end if;
  update imposter.members set state = 'removed' where room_id = p_room and user_id = p_user and state <> 'removed';
  if not found then raise exception 'not_in_room'; end if;
  delete from imposter.assignments where room_id = p_room and user_id = p_user;
  update imposter.rooms set active_at = now() where id = p_room;
  perform imposter.ping(p_room);
end $$;

create function imposter.start_round(p_room uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := imposter.player();
  r imposter.rooms;
  players integer;
  total integer;
  pr imposter.pairs;
  majority text;
  odd text;
  imposter_id uuid;
begin
  r := imposter.lock_room(p_room, uid, true);
  if r.phase <> 'lobby' then raise exception 'round_in_progress'; end if;
  select count(*) into players from imposter.members where room_id = p_room and state = 'playing';
  if players < 3 then raise exception 'not_enough_players'; end if;
  if players > 12 then raise exception 'room_full'; end if;

  -- A pair, avoiding the room's last 5 (or as many as possible while one is left).
  select count(*) into total from imposter.pairs;
  if total = 0 then raise exception 'no_pairs'; end if;
  select p.* into pr from imposter.pairs p
    where p.id not in (
      select rp.pair_id from imposter.recent_pairs rp where rp.room_id = p_room order by rp.used_at desc limit least(5, total - 1)
    )
    order by random() limit 1;
  -- Which side the majority gets is random too.
  if random() < 0.5 then majority := pr.a; odd := pr.b; else majority := pr.b; odd := pr.a; end if;
  select user_id into imposter_id from imposter.members where room_id = p_room and state = 'playing' order by random() limit 1;

  delete from imposter.assignments where room_id = p_room;
  insert into imposter.assignments (room_id, user_id, round_no, character_id, is_imposter)
    select p_room, m.user_id, r.round_no + 1, case when m.user_id = imposter_id then odd else majority end, m.user_id = imposter_id
    from imposter.members m where m.room_id = p_room and m.state = 'playing';

  insert into imposter.recent_pairs (room_id, pair_id) values (p_room, pr.id)
    on conflict (room_id, pair_id) do update set used_at = clock_timestamp();
  delete from imposter.recent_pairs where room_id = p_room and pair_id not in (
    select rp.pair_id from imposter.recent_pairs rp where rp.room_id = p_room order by rp.used_at desc limit 5
  );

  update imposter.rooms set phase = 'round', round_no = r.round_no + 1, active_at = now() where id = p_room;
  perform imposter.ping(p_room);
end $$;

-- Back to the game room: cards cleared, the list kept, late joiners added.
create function imposter.restart_round(p_room uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := imposter.player();
  r imposter.rooms;
begin
  r := imposter.lock_room(p_room, uid, true);
  if r.phase <> 'round' then return; end if;
  delete from imposter.assignments where room_id = p_room;
  update imposter.members set state = 'playing' where room_id = p_room and state = 'waiting';
  update imposter.rooms set phase = 'lobby', active_at = now() where id = p_room;
  perform imposter.ping(p_room);
end $$;

create function imposter.end_room(p_room uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := imposter.player();
begin
  perform imposter.lock_room(p_room, uid, true);
  perform imposter.ping(p_room);
  delete from imposter.rooms where id = p_room;
end $$;

-- The caller's own view: their room, the player list (names, host, connection only)
-- and their own card. Also the heartbeat: it marks the caller seen and passes the
-- host role on once the host has been away for 3 minutes (in the game room or a round).
-- p_room is the room this phone was last in, to tell "removed" and "ended" apart.
create function imposter.my_state(p_room uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := imposter.player();
  m imposter.members;
  r imposter.rooms;
  host_seen timestamptz;
  card jsonb;
begin
  select * into m from imposter.members where user_id = uid and state <> 'removed';
  if not found then
    if p_room is not null and exists (select 1 from imposter.members where room_id = p_room and user_id = uid and state = 'removed') then
      return jsonb_build_object('status', 'removed');
    end if;
    if p_room is not null and not exists (select 1 from imposter.rooms where id = p_room) then
      return jsonb_build_object('status', 'ended');
    end if;
    return jsonb_build_object('status', 'none');
  end if;

  update imposter.members
    set seen_at = now(), connected_since = case when seen_at < now() - interval '25 seconds' then now() else connected_since end
    where room_id = m.room_id and user_id = uid;
  update imposter.rooms set active_at = now() where id = m.room_id and active_at < now() - interval '1 minute';

  select * into r from imposter.rooms where id = m.room_id;
  if r.host_id <> uid then
    select seen_at into host_seen from imposter.members where room_id = r.id and user_id = r.host_id and state <> 'removed';
    if host_seen is null or host_seen < now() - interval '3 minutes' then
      select * into r from imposter.rooms where id = m.room_id for update;
      select seen_at into host_seen from imposter.members where room_id = r.id and user_id = r.host_id and state <> 'removed';
      if host_seen is null or host_seen < now() - interval '3 minutes' then
        perform imposter.pass_host(r.id, r.host_id);
        perform imposter.ping(r.id);
        select * into r from imposter.rooms where id = m.room_id;
      end if;
    end if;
  end if;

  if r.phase = 'round' then
    select jsonb_build_object('character', a.character_id, 'imposter', a.is_imposter) into card
      from imposter.assignments a where a.room_id = r.id and a.user_id = uid;
  end if;

  return jsonb_build_object(
    'status', 'in_room',
    'room', jsonb_build_object(
      'id', r.id,
      'code', r.code,
      'phase', r.phase,
      'round', r.round_no,
      'host', r.host_id = uid,
      'host_changed_at', case when r.host_changed_at > now() - interval '30 seconds' then r.host_changed_at end
    ),
    'me', jsonb_build_object('id', uid, 'waiting', m.state = 'waiting'),
    'players', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', mm.user_id,
        'name', coalesce(p.display_name, p.username),
        'host', mm.user_id = r.host_id,
        'connected', mm.seen_at >= now() - interval '25 seconds',
        'waiting', mm.state = 'waiting'
      ) order by mm.joined_at), '[]'::jsonb)
      from imposter.members mm left join public.profiles p on p.id = mm.user_id
      where mm.room_id = r.id and mm.state <> 'removed'
    ),
    'card', card
  );
end $$;

-- Only the API functions are callable, and only by signed-in users (each checks the profile).
revoke execute on all functions in schema imposter from public, anon, authenticated;
grant execute on function
  imposter.create_room(), imposter.join_room(text), imposter.leave_room(), imposter.remove_player(uuid, uuid),
  imposter.start_round(uuid), imposter.restart_round(uuid), imposter.end_room(uuid), imposter.my_state(uuid)
  to authenticated;

-- Hourly sweep of idle rooms with pg_cron (available on the Supabase Free plan). Skipped where
-- the extension does not exist (the PGlite tests); cleanup() still runs on every create and join.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    -- Scheduling the same name again replaces the job.
    perform cron.schedule('imposter-cleanup', '0 * * * *', 'select imposter.cleanup()');
  end if;
end $$;
