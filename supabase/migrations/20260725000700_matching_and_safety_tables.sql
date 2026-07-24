-- Vocation Match — N-007 / N-009 (storage)
-- Swipes, matches, blocks, reports, and the moderation trail.
--
-- Two shapes carry the correctness of matching:
--   swipes  — primary key (actor, target): one decision per pair, so a retried
--             request cannot create a second swipe.
--   matches — the pair is stored in a fixed order with a unique constraint, so
--             two simultaneous likes cannot produce two matches.

-- A suspended profile stays in the database (its reports and matches still
-- matter) but disappears from every room and cannot send a message.
alter table public.profiles
  add column suspended_at timestamptz;

comment on column public.profiles.suspended_at is
  'Set by moderation. A suspended profile is filtered out of discovery and cannot send messages.';

-- --------------------------------------------------------------- swipes
create table public.swipes (
  actor_id   uuid not null references public.profiles (id) on delete cascade,
  target_id  uuid not null references public.profiles (id) on delete cascade,
  hotel_id   uuid not null references public.hotels (id) on delete cascade,
  room       text not null,
  decision   text not null,
  created_at timestamptz not null default now(),

  primary key (actor_id, target_id),
  constraint swipes_not_self check (actor_id <> target_id),
  constraint swipes_room check (room in ('UPCOMING', 'HERE_NOW')),
  constraint swipes_decision check (decision in ('LIKE', 'PASS'))
);

comment on table public.swipes is
  'One decision per (actor, target). Re-swiping is a no-op rather than an error, '
  'which is what makes the endpoint safe to retry.';

create index swipes_target_idx on public.swipes (target_id, decision);

alter table public.swipes enable row level security;
alter table public.swipes force row level security;
revoke all on table public.swipes from anon, authenticated;
grant select on table public.swipes to authenticated;

create policy swipes_select_own on public.swipes
  for select to authenticated
  using (actor_id = app.current_user_id());

-- --------------------------------------------------------------- matches
create table public.matches (
  id           uuid primary key default gen_random_uuid(),
  user_a       uuid not null references public.profiles (id) on delete cascade,
  user_b       uuid not null references public.profiles (id) on delete cascade,
  hotel_id     uuid not null references public.hotels (id) on delete cascade,
  room         text not null,
  created_at   timestamptz not null default now(),
  unmatched_at timestamptz,
  unmatched_by uuid references public.profiles (id) on delete set null,

  constraint matches_pair_order check (user_a < user_b),
  constraint matches_pair_unique unique (user_a, user_b),
  constraint matches_room check (room in ('UPCOMING', 'HERE_NOW'))
);

comment on constraint matches_pair_order on public.matches is
  'The pair is normalised (user_a < user_b) so the unique constraint sees (x,y) and (y,x) as the same pair.';

create index matches_user_a_idx on public.matches (user_a) where unmatched_at is null;
create index matches_user_b_idx on public.matches (user_b) where unmatched_at is null;

alter table public.matches enable row level security;
alter table public.matches force row level security;
revoke all on table public.matches from anon, authenticated;
grant select on table public.matches to authenticated;

create policy matches_select_own on public.matches
  for select to authenticated
  using (user_a = app.current_user_id() or user_b = app.current_user_id());

-- ---------------------------------------------------------------- blocks
create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);

comment on table public.blocks is
  'Blocking is symmetric in effect and reversible: the blocker may delete the row (backlog R-002).';

create index blocks_blocked_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;
alter table public.blocks force row level security;
revoke all on table public.blocks from anon, authenticated;
grant select, delete on table public.blocks to authenticated;

-- A user sees the blocks they made. The blocked user is never told.
create policy blocks_select_own on public.blocks
  for select to authenticated
  using (blocker_id = app.current_user_id());

create policy blocks_delete_own on public.blocks
  for delete to authenticated
  using (blocker_id = app.current_user_id());

-- --------------------------------------------------------------- reports
create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid references public.profiles (id) on delete set null,
  reported_id  uuid references public.profiles (id) on delete set null,
  hotel_id     uuid references public.hotels (id) on delete set null,
  room         text,
  reason       text not null,
  details      text,
  status       text not null default 'OPEN',
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz,
  review_note  text,

  constraint reports_reason check (
    reason in ('HARASSMENT', 'SPAM', 'FAKE_PROFILE', 'UNDERAGE', 'SAFETY', 'OTHER')),
  constraint reports_status check (status in ('OPEN', 'REVIEWING', 'ACTIONED', 'DISMISSED')),
  constraint reports_details_length check (details is null or char_length(details) <= 1000),
  constraint reports_not_self check (reporter_id is null or reporter_id <> reported_id)
);

comment on table public.reports is
  'Reports outlive the accounts involved (on delete set null) so moderation history is not erasable by deleting an account.';

create index reports_open_idx on public.reports (reported_id) where status = 'OPEN';

alter table public.reports enable row level security;
alter table public.reports force row level security;
revoke all on table public.reports from anon, authenticated;
grant select on table public.reports to authenticated;

-- A reporter can see what they filed. Nobody can see reports filed about them.
create policy reports_select_own on public.reports
  for select to authenticated
  using (reporter_id = app.current_user_id());

-- ---------------------------------------------------- moderation decisions
create table public.moderation_actions (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid references public.profiles (id) on delete set null,
  action      text not null,
  reason      text,
  report_id   uuid references public.reports (id) on delete set null,
  created_at  timestamptz not null default now(),

  constraint moderation_action_kind check (
    action in ('FLAGGED', 'SUSPENDED', 'REINSTATED', 'DISMISSED'))
);

comment on table public.moderation_actions is
  'Append-only trail. FLAGGED rows are raised automatically once several distinct users report the same person.';

alter table public.moderation_actions enable row level security;
alter table public.moderation_actions force row level security;
revoke all on table public.moderation_actions from anon, authenticated;
-- No client role reads or writes this table; moderation runs as service_role.
