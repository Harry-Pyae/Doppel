-- Doppel: nobody knows who the doppel is, not even the doppel, until the host reveals it.
--
-- During a round each phone gets only its own character id (my_state's card). The role lives
-- in assignments.is_imposter and in the round's record on the room row; players can read
-- neither: the assignments table is now closed to the API roles too (its own row held the flag).
-- The host's reveal (host only, room row locked) ends the round and is stored on the room, so a
-- refresh shows it. It names the doppel even if they left or were removed before it.

-- The round's record, written by start_round: the group's character, the doppel's, and who.
alter table imposter.rooms
  add column round_group text,
  add column round_doppel text,
  add column round_doppel_id uuid,
  add column revealed_at timestamptz;

drop policy assignments_own on imposter.assignments;
revoke all on imposter.assignments from anon, authenticated;

-- As before, plus the round's record (and no reveal yet).
create or replace function imposter.start_round(p_room uuid) returns void
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

  update imposter.rooms
    set phase = 'round', round_no = r.round_no + 1, active_at = now(),
        round_group = majority, round_doppel = odd, round_doppel_id = imposter_id, revealed_at = null
    where id = p_room;
  perform imposter.ping(p_room);
end $$;

-- The host reveals the doppel: the round ends here (the timer stops); Restart or End follow.
create function imposter.reveal(p_room uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := imposter.player();
  r imposter.rooms;
begin
  r := imposter.lock_room(p_room, uid, true);
  if r.phase <> 'round' then raise exception 'no_round'; end if;
  if r.revealed_at is not null then return; end if;
  update imposter.rooms set revealed_at = now(), timer_started_at = null, timer_ends_at = null, active_at = now() where id = p_room;
  perform imposter.ping(p_room);
end $$;

-- As before, and the record and reveal are cleared.
create or replace function imposter.restart_round(p_room uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := imposter.player();
  r imposter.rooms;
begin
  r := imposter.lock_room(p_room, uid, true);
  if r.phase <> 'round' then return; end if;
  delete from imposter.assignments where room_id = p_room;
  update imposter.members set state = 'playing' where room_id = p_room and state = 'waiting';
  update imposter.rooms
    set phase = 'lobby', active_at = now(), timer_started_at = null, timer_ends_at = null,
        round_group = null, round_doppel = null, round_doppel_id = null, revealed_at = null
    where id = p_room;
  perform imposter.ping(p_room);
end $$;

-- As before; after the reveal the round is over, so no more timer.
create or replace function imposter.timer(p_room uuid, p_action text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := imposter.player();
  r imposter.rooms;
  t timestamptz := clock_timestamp();
begin
  r := imposter.lock_room(p_room, uid, true);
  if r.phase <> 'round' then raise exception 'no_round'; end if;
  if r.revealed_at is not null then raise exception 'revealed'; end if;
  if p_action = 'start' then
    if r.timer_minutes = 0 then raise exception 'timer_off'; end if;
    if r.timer_ends_at > t then return; end if;
    update imposter.rooms set timer_started_at = t, timer_ends_at = t + make_interval(mins => r.timer_minutes) where id = p_room;
  elsif p_action = 'add' then
    if r.timer_ends_at is null then raise exception 'timer_not_running'; end if;
    update imposter.rooms
      set timer_started_at = case when r.timer_ends_at > t then r.timer_started_at else t end,
          timer_ends_at = greatest(r.timer_ends_at, t) + interval '30 seconds'
      where id = p_room;
  elsif p_action = 'stop' then
    update imposter.rooms set timer_started_at = null, timer_ends_at = null where id = p_room;
  else
    raise exception 'bad_timer';
  end if;
  update imposter.rooms set active_at = now() where id = p_room;
  perform imposter.ping(p_room);
end $$;

-- As before, except: the card is only the caller's character (no role), and room.reveal is
-- there once the host has revealed (who the doppel was, and both characters).
create or replace function imposter.my_state(p_room uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := imposter.player();
  m imposter.members;
  r imposter.rooms;
  host_seen timestamptz;
  card jsonb;
  revealed jsonb;
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
    select jsonb_build_object('character', a.character_id) into card
      from imposter.assignments a where a.room_id = r.id and a.user_id = uid;
    if r.revealed_at is not null then
      revealed := jsonb_build_object(
        'name', coalesce((select coalesce(p.display_name, p.username) from public.profiles p where p.id = r.round_doppel_id), ''),
        'group', r.round_group,
        'doppel', r.round_doppel
      );
    end if;
  end if;

  return jsonb_build_object(
    'status', 'in_room',
    'now', floor(extract(epoch from clock_timestamp()) * 1000),
    'room', jsonb_build_object(
      'id', r.id,
      'code', r.code,
      'phase', r.phase,
      'round', r.round_no,
      'host', r.host_id = uid,
      'host_changed_at', case when r.host_changed_at > now() - interval '30 seconds' then r.host_changed_at end,
      'timer', jsonb_build_object(
        'minutes', r.timer_minutes,
        'started_at', floor(extract(epoch from r.timer_started_at) * 1000),
        'ends_at', floor(extract(epoch from r.timer_ends_at) * 1000)
      ),
      'reveal', revealed
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

revoke execute on function imposter.reveal(uuid) from public, anon, authenticated;
grant execute on function imposter.reveal(uuid) to authenticated;
