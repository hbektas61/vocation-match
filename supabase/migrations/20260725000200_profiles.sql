-- Vocation Match — N-002
-- Profiles: the only user-owned identity record in the MVP.
--
-- Owner decisions enforced here:
--   D-008  18+ only, enforced server-side (backlog R-001).
--   D-005  a profile row is readable by its owner only; other users see a
--          narrow card through a discovery/match function, never this table.
-- Explicitly absent: reservation number, reservation document, passport/ID,
-- hotel confirmation, room number, or any identity-verification column.

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text        not null,
  bio           text,
  birthdate     date        not null,
  photo_url     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint profiles_display_name_length
    check (char_length(btrim(display_name)) between 2 and 40),
  constraint profiles_bio_length
    check (bio is null or char_length(bio) <= 300),
  constraint profiles_birthdate_plausible
    check (birthdate > date '1900-01-01'),
  constraint profiles_photo_url_is_https
    check (photo_url is null or photo_url ~ '^https://')
);

comment on table public.profiles is
  'One row per adult user. No reservation, document, or identity-proof columns exist by design.';
comment on column public.profiles.birthdate is
  'Used only to enforce 18+ and to derive a coarse age; never exposed to another user.';

-- 18+ is a trigger rather than a CHECK because the rule depends on the current
-- date, which a CHECK constraint may not depend on safely.
create or replace function app.enforce_adult_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not app.is_adult(new.birthdate) then
    raise exception 'Vocation Match is 18+ only.'
      using errcode = 'check_violation', constraint = 'profiles_must_be_adult';
  end if;
  return new;
end;
$$;

create trigger profiles_enforce_adult
  before insert or update of birthdate on public.profiles
  for each row execute function app.enforce_adult_profile();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function app.set_updated_at();

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

revoke all on table public.profiles from anon, authenticated;
grant select, insert, update, delete on table public.profiles to authenticated;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = app.current_user_id());

create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = app.current_user_id());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = app.current_user_id())
  with check (id = app.current_user_id());

create policy profiles_delete_own on public.profiles
  for delete to authenticated
  using (id = app.current_user_id());

-- Coarse age for cards. Exposing an integer age keeps the exact birthdate private.
create or replace function app.age_years(p_birthdate date)
returns integer
language sql
stable
set search_path = ''
as $$
  select extract(year from age(current_date, p_birthdate))::integer;
$$;

grant execute on function app.age_years(date) to authenticated, service_role;
