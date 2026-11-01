-- What a Supabase project already has before this game's migration: the API roles,
-- auth.uid(), a Realtime send() that records what it would broadcast, and the shared
-- PolyHydra profiles (only the columns this game reads).
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema public, auth to anon, authenticated, service_role;

create schema realtime;
create table realtime.sent (payload jsonb, event text, topic text, private boolean, at timestamptz default clock_timestamp());
create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void
language sql as $$ insert into realtime.sent (payload, event, topic, private) values (payload, event, topic, private) $$;
grant usage on schema realtime to anon, authenticated, service_role;
grant select on realtime.sent to anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  display_name text not null,
  status text not null default 'pending',
  banned_until timestamptz
);
