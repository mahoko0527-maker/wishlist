-- The Hundred cloud foundation
-- Run this file in the Supabase SQL editor, then enable Anonymous Sign-Ins.

create extension if not exists pgcrypto;
create schema if not exists private;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Guest' check (char_length(display_name) between 1 and 40),
  share_code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.privacy_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  friends_can_view boolean not null default true,
  show_achieved_date boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_states (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now()
);

create table if not exists public.wants (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  title text not null check (char_length(title) between 1 and 80),
  memo text not null default '',
  parent_id text,
  created_at timestamptz not null,
  places jsonb not null default '[]'::jsonb check (jsonb_typeof(places) = 'array'),
  people jsonb not null default '[]'::jsonb check (jsonb_typeof(people) = 'array'),
  afterword text not null default '',
  primary key (owner_id, id)
);

create table if not exists public.selections (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  want_id text not null,
  year integer not null check (year between 2000 and 2200),
  selected_at timestamptz not null,
  primary key (owner_id, id),
  foreign key (owner_id, want_id) references public.wants(owner_id, id) on delete cascade
);

create table if not exists public.selection_events (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  selection_id text not null,
  type text not null check (type in ('selected', 'reselected', 'still_want', 'achieved', 'let_go')),
  at timestamptz not null,
  note text not null default '',
  primary key (owner_id, id),
  foreign key (owner_id, selection_id) references public.selections(owner_id, id) on delete cascade
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> receiver_id)
);

create unique index if not exists friendships_unique_pair
  on public.friendships (least(requester_id, receiver_id), greatest(requester_id, receiver_id));
create index if not exists friendships_requester_idx on public.friendships(requester_id, status);
create index if not exists friendships_receiver_idx on public.friendships(receiver_id, status);
create index if not exists selections_owner_year_idx on public.selections(owner_id, year);
create index if not exists events_owner_selection_idx on public.selection_events(owner_id, selection_id, at desc);

create or replace function private.new_share_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate text;
begin
  loop
    candidate := 'HUNDRED-' || upper(substr(encode(gen_random_bytes(5), 'hex'), 1, 5));
    exit when not exists (select 1 from public.profiles where share_code = candidate);
  end loop;
  return candidate;
end;
$$;

create or replace function private.set_profile_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.share_code is null or btrim(new.share_code) = '' then
    new.share_code := private.new_share_code();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_defaults on public.profiles;
create trigger profiles_defaults
before insert or update on public.profiles
for each row execute function private.set_profile_defaults();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, share_code)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), 'Guest'), private.new_share_code())
  on conflict (id) do nothing;
  insert into public.privacy_settings (owner_id) values (new.id)
  on conflict (owner_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

-- Backfill profiles if this migration is installed after anonymous users exist.
insert into public.profiles (id, display_name, share_code)
select u.id, coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''), 'Guest'), private.new_share_code()
from auth.users u
on conflict (id) do nothing;
insert into public.privacy_settings (owner_id)
select id from auth.users
on conflict (owner_id) do nothing;

alter table public.profiles enable row level security;
alter table public.privacy_settings enable row level security;
alter table public.user_states enable row level security;
alter table public.wants enable row level security;
alter table public.selections enable row level security;
alter table public.selection_events enable row level security;
alter table public.friendships enable row level security;

drop policy if exists "owner reads profile" on public.profiles;
create policy "owner reads profile" on public.profiles for select to authenticated
using ((select auth.uid()) = id);
drop policy if exists "owner updates profile" on public.profiles;
create policy "owner updates profile" on public.profiles for update to authenticated
using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "owner reads privacy" on public.privacy_settings;
create policy "owner reads privacy" on public.privacy_settings for select to authenticated
using ((select auth.uid()) = owner_id);
drop policy if exists "owner updates privacy" on public.privacy_settings;
create policy "owner updates privacy" on public.privacy_settings for update to authenticated
using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

drop policy if exists "owner reads state" on public.user_states;
create policy "owner reads state" on public.user_states for select to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "owner reads wants" on public.wants;
create policy "owner reads wants" on public.wants for select to authenticated
using ((select auth.uid()) = owner_id);
drop policy if exists "owner reads selections" on public.selections;
create policy "owner reads selections" on public.selections for select to authenticated
using ((select auth.uid()) = owner_id);
drop policy if exists "owner reads events" on public.selection_events;
create policy "owner reads events" on public.selection_events for select to authenticated
using ((select auth.uid()) = owner_id);
drop policy if exists "participants read friendship" on public.friendships;
create policy "participants read friendship" on public.friendships for select to authenticated
using ((select auth.uid()) in (requester_id, receiver_id));

revoke all on public.profiles, public.privacy_settings, public.user_states,
  public.wants, public.selections, public.selection_events, public.friendships from anon, authenticated;
grant select, update (display_name) on public.profiles to authenticated;
grant select, update (friends_can_view, show_achieved_date) on public.privacy_settings to authenticated;
grant select on public.user_states to authenticated;
grant select on public.friendships to authenticated;

create or replace function public.replace_my_state(p_state jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid := auth.uid();
begin
  if owner is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_state) <> 'object'
    or jsonb_typeof(p_state -> 'wants') <> 'array'
    or jsonb_typeof(p_state -> 'selections') <> 'array'
    or jsonb_typeof(p_state -> 'events') <> 'array'
    or octet_length(p_state::text) > 2097152 then
    raise exception 'Invalid or oversized state';
  end if;

  insert into public.user_states (owner_id, payload, updated_at)
  values (owner, p_state, now())
  on conflict (owner_id) do update set payload = excluded.payload, updated_at = excluded.updated_at;

  delete from public.selection_events where owner_id = owner;
  delete from public.selections where owner_id = owner;
  delete from public.wants where owner_id = owner;

  insert into public.wants (owner_id, id, title, memo, parent_id, created_at, places, people, afterword)
  select owner,
    item ->> 'id',
    left(item ->> 'title', 80),
    coalesce(item ->> 'memo', ''),
    nullif(item ->> 'parentId', ''),
    coalesce(nullif(item ->> 'createdAt', '')::timestamptz, now()),
    case when jsonb_typeof(item -> 'places') = 'array' then item -> 'places' else '[]'::jsonb end,
    case when jsonb_typeof(item -> 'people') = 'array' then item -> 'people' else '[]'::jsonb end,
    coalesce(item ->> 'afterword', '')
  from jsonb_array_elements(p_state -> 'wants') item
  where nullif(item ->> 'id', '') is not null and nullif(item ->> 'title', '') is not null;

  insert into public.selections (owner_id, id, want_id, year, selected_at)
  select owner,
    item ->> 'id',
    item ->> 'wantId',
    (item ->> 'year')::integer,
    coalesce(nullif(item ->> 'selectedAt', '')::timestamptz, now())
  from jsonb_array_elements(p_state -> 'selections') item
  where nullif(item ->> 'id', '') is not null and nullif(item ->> 'wantId', '') is not null;

  insert into public.selection_events (owner_id, id, selection_id, type, at, note)
  select owner,
    item ->> 'id',
    item ->> 'selectionId',
    item ->> 'type',
    coalesce(nullif(item ->> 'at', '')::timestamptz, now()),
    coalesce(item ->> 'note', '')
  from jsonb_array_elements(p_state -> 'events') item
  where nullif(item ->> 'id', '') is not null
    and nullif(item ->> 'selectionId', '') is not null
    and item ->> 'type' in ('selected', 'reselected', 'still_want', 'achieved', 'let_go');
end;
$$;

create or replace function public.request_friend_by_code(p_share_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  target uuid;
  friendship_id uuid;
begin
  if me is null then raise exception 'Authentication required'; end if;
  select id into target from public.profiles where upper(share_code) = upper(btrim(p_share_code));
  if target is null then raise exception 'Share Codeが見つかりません'; end if;
  if target = me then raise exception '自分自身には申請できません'; end if;
  select id into friendship_id from public.friendships
  where least(requester_id, receiver_id) = least(me, target)
    and greatest(requester_id, receiver_id) = greatest(me, target);
  if friendship_id is not null then return friendship_id; end if;
  insert into public.friendships (requester_id, receiver_id)
  values (me, target) returning id into friendship_id;
  return friendship_id;
end;
$$;

create or replace function public.respond_friend_request(p_friendship_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.friendships
  set status = case when p_approve then 'approved' else 'rejected' end, updated_at = now()
  where id = p_friendship_id and receiver_id = auth.uid() and status = 'pending';
  if not found then raise exception '処理できる申請が見つかりません'; end if;
end;
$$;

create or replace function public.list_my_connections()
returns table (
  friendship_id uuid,
  other_user_id uuid,
  display_name text,
  share_code text,
  status text,
  direction text,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select f.id,
    case when f.requester_id = auth.uid() then f.receiver_id else f.requester_id end,
    p.display_name,
    p.share_code,
    f.status,
    case when f.requester_id = auth.uid() then 'sent' else 'received' end,
    f.created_at
  from public.friendships f
  join public.profiles p on p.id = case when f.requester_id = auth.uid() then f.receiver_id else f.requester_id end
  where auth.uid() in (f.requester_id, f.receiver_id)
  order by f.created_at desc;
$$;

create or replace function public.get_friend_wishes(p_friend_id uuid)
returns table (
  wish_id text,
  title text,
  achieved boolean,
  achieved_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  with allowed as (
    select ps.show_achieved_date
    from public.privacy_settings ps
    where ps.owner_id = p_friend_id
      and ps.friends_can_view
      and exists (
        select 1 from public.friendships f
        where f.status = 'approved'
          and least(f.requester_id, f.receiver_id) = least(auth.uid(), p_friend_id)
          and greatest(f.requester_id, f.receiver_id) = greatest(auth.uid(), p_friend_id)
      )
  ), latest as (
    select s.id, s.want_id,
      (select e.type from public.selection_events e
       where e.owner_id = s.owner_id and e.selection_id = s.id
       order by e.at desc limit 1) as latest_type,
      (select min(e.at) from public.selection_events e
       where e.owner_id = s.owner_id and e.selection_id = s.id and e.type = 'achieved') as achieved_date
    from public.selections s
    where s.owner_id = p_friend_id
      and s.year = extract(year from now())::integer
  )
  select w.id, w.title,
    (latest.achieved_date is not null),
    case when allowed.show_achieved_date then latest.achieved_date else null end
  from allowed
  join latest on latest.latest_type in ('selected', 'reselected', 'still_want', 'achieved')
  join public.wants w on w.owner_id = p_friend_id and w.id = latest.want_id
  order by w.created_at;
$$;

revoke execute on function public.replace_my_state(jsonb) from public, anon;
revoke execute on function public.request_friend_by_code(text) from public, anon;
revoke execute on function public.respond_friend_request(uuid, boolean) from public, anon;
revoke execute on function public.list_my_connections() from public, anon;
revoke execute on function public.get_friend_wishes(uuid) from public, anon;
grant execute on function public.replace_my_state(jsonb) to authenticated;
grant execute on function public.request_friend_by_code(text) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.list_my_connections() to authenticated;
grant execute on function public.get_friend_wishes(uuid) to authenticated;

revoke all on schema private from public, anon, authenticated;
