-- LOCAL DEVELOPMENT ONLY (supabase start / db reset). Never run this on the shared project:
-- it already has these PolyHydra tables. A minimal copy of the columns this game reads,
-- so the local stack behaves like the shared one (TheGildedDelve owns the real migrations).
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  display_name text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'blocked')),
  banned_until timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_username_key on public.profiles (lower(username));
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;

create table if not exists public.login_locks (
  username_key text not null,
  kind text not null check (kind in ('password', 'recovery', 'admin')),
  fails smallint not null default 0,
  updated_at timestamptz not null default now(),
  locked_until timestamptz,
  primary key (username_key, kind)
);
alter table public.login_locks enable row level security;
revoke all on public.login_locks from anon, authenticated;

create or replace function public.login_fail(p_key text, p_kind text) returns timestamptz
language plpgsql set search_path = public as $$
declare
  r public.login_locks;
  span interval := case when p_kind = 'admin' then interval '30 minutes' else interval '15 minutes' end;
begin
  insert into public.login_locks (username_key, kind) values (p_key, p_kind) on conflict do nothing;
  select * into r from public.login_locks where username_key = p_key and kind = p_kind for update;
  if r.locked_until > now() then return r.locked_until; end if;
  if r.updated_at < now() - span then r.fails := 0; end if;
  if r.fails + 1 >= 5 then
    update public.login_locks set fails = 0, updated_at = now(), locked_until = now() + span where username_key = p_key and kind = p_kind;
    return now() + span;
  end if;
  update public.login_locks set fails = r.fails + 1, updated_at = now(), locked_until = null where username_key = p_key and kind = p_kind;
  return null;
end $$;
revoke execute on function public.login_fail from public, anon, authenticated;
grant execute on function public.login_fail to service_role;
