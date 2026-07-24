-- Vocation Match — N-004 / N-005 / N-006 (storage)
-- The user's state relative to a hotel: which one is active, a self-declared
-- upcoming stay, and the latest proximity answer.
--
-- Owner decisions enforced by the shapes below:
--   D-003  exactly one active hotel  → primary key on user_id.
--   D-001  upcoming is self-declared → dates only, no proof column of any kind.
--   D-005  no location history       → one row per user, holding a boolean and
--          an expiry, never coordinates and never a distance.
-- Every table here is written through a function in the next migration;
-- `authenticated` gets SELECT on its own rows and nothing else.

-- ------------------------------------------------------------- active hotel
create table public.user_active_hotel (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  hotel_id     uuid not null references public.hotels (id) on delete restrict,
  activated_at timestamptz not null default now()
);

comment on table public.user_active_hotel is
  'At most one row per user — the primary key is the one-active-hotel rule (D-003).';

alter table public.user_active_hotel enable row level security;
alter table public.user_active_hotel force row level security;
revoke all on table public.user_active_hotel from anon, authenticated;
grant select on table public.user_active_hotel to authenticated;

create policy user_active_hotel_select_own on public.user_active_hotel
  for select to authenticated
  using (user_id = app.current_user_id());

-- Switch history. Kept so hotel-hopping abuse can be measured (accepted MVP
-- risk in .studio/decisions.md) without tracking anyone's location.
create table public.hotel_activation_events (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  hotel_id       uuid not null references public.hotels (id) on delete cascade,
  activated_at   timestamptz not null default now(),
  deactivated_at timestamptz
);

create index hotel_activation_events_user_idx
  on public.hotel_activation_events (user_id, activated_at desc);
create unique index hotel_activation_events_one_open_per_user
  on public.hotel_activation_events (user_id)
  where deactivated_at is null;

alter table public.hotel_activation_events enable row level security;
alter table public.hotel_activation_events force row level security;
revoke all on table public.hotel_activation_events from anon, authenticated;
grant select on table public.hotel_activation_events to authenticated;

create policy hotel_activation_events_select_own on public.hotel_activation_events
  for select to authenticated
  using (user_id = app.current_user_id());

-- ----------------------------------------------------------- upcoming stays
create table public.upcoming_stays (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  hotel_id    uuid not null references public.hotels (id) on delete cascade,
  start_date  date not null,
  end_date    date not null,
  declared_at timestamptz not null default now(),

  primary key (user_id, hotel_id),
  constraint upcoming_stays_date_order check (end_date > start_date),
  constraint upcoming_stays_length check (end_date - start_date <= 60)
);

comment on table public.upcoming_stays is
  'Self-declared future stay (D-001). There is deliberately no reservation, document, or confirmation column.';

alter table public.upcoming_stays enable row level security;
alter table public.upcoming_stays force row level security;
revoke all on table public.upcoming_stays from anon, authenticated;
grant select, delete on table public.upcoming_stays to authenticated;

create policy upcoming_stays_select_own on public.upcoming_stays
  for select to authenticated
  using (user_id = app.current_user_id());

create policy upcoming_stays_delete_own on public.upcoming_stays
  for delete to authenticated
  using (user_id = app.current_user_id());

-- --------------------------------------------------------- presence answers
create table public.presence_checks (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  hotel_id     uuid not null references public.hotels (id) on delete cascade,
  within_range boolean not null,
  checked_at   timestamptz not null default now(),
  expires_at   timestamptz not null
);

comment on table public.presence_checks is
  'The answer to one foreground proximity check, not the reading itself. One row '
  'per user means there is no location history; coordinates are function arguments '
  'that are never stored (D-005).';

-- The sweep in record_presence_check() deletes by expiry on every call.
create index presence_checks_expires_idx on public.presence_checks (expires_at);

alter table public.presence_checks enable row level security;
alter table public.presence_checks force row level security;
revoke all on table public.presence_checks from anon, authenticated;
grant select, delete on table public.presence_checks to authenticated;

create policy presence_checks_select_own on public.presence_checks
  for select to authenticated
  using (user_id = app.current_user_id());

-- Letting a user drop their own presence answer is the in-app "stop sharing".
create policy presence_checks_delete_own on public.presence_checks
  for delete to authenticated
  using (user_id = app.current_user_id());
