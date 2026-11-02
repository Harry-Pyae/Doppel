-- Doppel: the host's optional round timer. Adds to the first migration; nothing in it changes
-- except restart_round (clears the timer) and my_state (returns it, plus the server's clock).
--
-- The server keeps the end time; phones correct for their clock difference with the server
-- (my_state returns `now`) and count down to it. Only the host can set, start, extend or stop
-- it, through functions that lock the room row first. A timer is never started automatically.

alter table imposter.rooms
  -- 0 = Off. Chosen by the host in the game room; kept for the room.
  add column timer_minutes integer not null default 2 check (timer_minutes in (0, 1, 2, 3, 5)),
  add column timer_started_at timestamptz,
  add column timer_ends_at timestamptz;

create function imposter.set_timer(p_room uuid, p_minutes integer) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := imposter.player();
begin
  perform imposter.lock_room(p_room, uid, true);
  if p_minutes is null or p_minutes not in (0, 1, 2, 3, 5) then raise exception 'bad_timer'; end if;
  update imposter.rooms set timer_minutes = p_minutes, active_at = now() where id = p_room;
  perform imposter.ping(p_room);
end $$;

-- start: from the room's length (does nothing while one is running); add: +30 seconds (from now
-- once time is up); stop: clears it. Only during a round.
create function imposter.timer(p_room uuid, p_action text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := imposter.player();
  r imposter.rooms;
  t timestamptz := clock_timestamp();
begin
  r := imposter.lock_room(p_room, uid, true);
  if r.phase <> 'round' then raise exception 'no_round'; end if;
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

-- As before, and the timer is cleared.
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
  update imposter.rooms set phase = 'lobby', active_at = now(), timer_started_at = null, timer_ends_at = null where id = p_room;
  perform imposter.ping(p_room);
end $$;

-- As before, plus room.timer and `now` (the server's clock, in ms) for the countdown.
create or replace function imposter.my_state(p_room uuid default null) returns jsonb
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
      )
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

revoke execute on function imposter.set_timer(uuid, integer), imposter.timer(uuid, text) from public, anon, authenticated;
grant execute on function imposter.set_timer(uuid, integer), imposter.timer(uuid, text) to authenticated;
