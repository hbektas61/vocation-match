-- D-056 — Etkinlikler, part one: the subject, the lease, and the switches.
--
-- An event is the fourth thing a room can be about. The other three are places
-- we can point at; an event is a place *and a time*, supplied by somebody else,
-- which is what makes it a different subject rather than another venue row.
--
-- Three separations this file exists to make, and to keep:
--
--   1. **Identity is ours; content is a lease.** `public.events` holds the
--      canonical `(provider, provider_event_id)` and nothing else of
--      Ticketmaster's. Everything a screen draws — the name, the dates, the
--      venue, the image — lives in `app.event_content` with an expiry, is
--      never copied into a room, membership, match or message row, and can be
--      purged on a takedown without touching one app-owned record.
--
--   2. **Events do not touch the hotel.** There is no `user_active_event`
--      mirroring `user_active_hotel`, because that would import the
--      one-at-a-time rule the hotel needs and events must not have. A person
--      may declare for several future events; which deck they are *looking* at
--      is a separate, deletable choice.
--
--   3. **The provider is bounded before it is called.** A shared cache with no
--      user in its key, one in-flight request per key, a per-second limit, a
--      daily ceiling below Ticketmaster's own, a circuit breaker and a kill
--      switch — all server-side, all enforced before the upstream request.

-- ------------------------------------------------------------ the switches
create table app.feature_flags (
  flag       text primary key,
  enabled    boolean not null default false,
  updated_at timestamptz not null default now()
);

comment on table app.feature_flags is
  'D-056: server-controlled switches. The app must be whole with any of them off.';

alter table app.feature_flags enable row level security;
revoke all on table app.feature_flags from anon, authenticated;

insert into app.feature_flags (flag, enabled) values
  -- Off until the Events tab has been walked on staging. Turning it on is an
  -- operator action, not a deploy.
  ('EVENTS_FEATURE_ENABLED', false),
  -- The provider's own switch, separate on purpose: the feature can stay on
  -- while Ticketmaster is cut off, which is exactly the state §12 describes —
  -- existing rooms keep working, new discovery does not.
  ('TICKETMASTER_PROVIDER_ENABLED', true)
on conflict (flag) do nothing;

create or replace function app.flag(p_flag text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select f.enabled from app.feature_flags f where f.flag = p_flag), false);
$$;

/** What the client may know: whether to draw the tab at all. */
create or replace function public.feature_flags()
returns table (flag text, enabled boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select f.flag, f.enabled from app.feature_flags f
   where f.flag in ('EVENTS_FEATURE_ENABLED', 'TICKETMASTER_PROVIDER_ENABLED');
$$;

revoke all on function public.feature_flags() from public, anon;
grant execute on function public.feature_flags() to authenticated, service_role;

/** Operator-only. There is no client path that can flip a switch. */
create or replace function public.set_feature_flag(p_flag text, p_enabled boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into app.feature_flags (flag, enabled, updated_at)
  values (p_flag, p_enabled, now())
  on conflict (flag) do update set enabled = excluded.enabled, updated_at = now();
$$;

revoke all on function public.set_feature_flag(text, boolean) from public, anon, authenticated;
grant execute on function public.set_feature_flag(text, boolean) to service_role;

-- --------------------------------------------------------------- the subject
create table public.events (
  id                uuid primary key default gen_random_uuid(),
  provider          text not null default 'ticketmaster'
    constraint events_provider check (provider in ('ticketmaster')),
  /**
   * Opaque. Nothing in this schema parses meaning out of it — §6.2 — and the
   * unique constraint below is the whole of the identity rule: two people who
   * pick the same id share a room, two events with one name do not.
   */
  provider_event_id text not null
    constraint events_provider_event_id check (char_length(provider_event_id) between 3 and 200),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint events_provider_key unique (provider, provider_event_id)
);

comment on table public.events is
  'D-056: the app-owned identity of a real event. Holds the provider''s id and nothing else of the provider''s — every display field is a lease in app.event_content.';

create trigger events_set_updated_at
  before update on public.events
  for each row execute function app.set_updated_at();

alter table public.events enable row level security;
alter table public.events force row level security;
revoke all on table public.events from anon, authenticated;
-- The id and the provider id are what a client legitimately holds: it selected
-- the event. Nothing here is provider display content.
grant select (id, provider, provider_event_id) on table public.events to authenticated;

create policy events_select_all on public.events
  for select to authenticated using (true);

/**
 * The write boundary. Settles a concurrent first selection in one statement,
 * the way `upsert_google_venue` does — §2.1 and §14.
 */
create or replace function public.upsert_event(p_provider_event_id text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_provider_event_id is null
     or char_length(btrim(p_provider_event_id)) not between 3 and 200 then
    raise exception 'That event reference is not usable.' using errcode = '23514';
  end if;

  insert into public.events as e (provider, provider_event_id)
  values ('ticketmaster', btrim(p_provider_event_id))
  on conflict (provider, provider_event_id) do update set updated_at = now()
  returning e.id into v_id;

  return v_id;
end;
$$;

revoke all on function public.upsert_event(text) from public, anon, authenticated;
grant execute on function public.upsert_event(text) to service_role;

-- ------------------------------------------------------------- the lease
create table app.event_content (
  event_id            uuid primary key references public.events (id) on delete cascade,
  /**
   * The normalized provider payload — §6.4 and nothing beyond it. Kept as one
   * jsonb rather than twenty columns because it is a *lease*: its shape is the
   * provider's, it is never joined to, and a schema that mirrors it invites
   * somebody to treat it as ours.
   */
  payload             jsonb       not null,
  provider_status     text        not null,
  /** Denormalized out of the payload only because eligibility must index them. */
  starts_at           timestamptz,
  ends_at             timestamptz,
  venue_timezone      text,
  date_tbd            boolean     not null default false,
  venue_latitude      double precision,
  venue_longitude     double precision,
  fetched_at          timestamptz not null default now(),
  expires_at          timestamptz not null,
  last_status_check_at timestamptz not null default now(),
  /** Set by a takedown. A requested purge is served as absent immediately. */
  purge_requested_at  timestamptz,

  constraint event_content_expiry check (expires_at > fetched_at)
);

comment on table app.event_content is
  'D-056 §10: Ticketmaster Event Content, leased. Every row expires, nothing here is copied into an app-owned record, and a takedown empties it without touching a match or a message.';

create index event_content_expiry_idx on app.event_content (expires_at);

alter table app.event_content enable row level security;
revoke all on table app.event_content from anon, authenticated;

/** Fresh means unexpired and not under a takedown. Anything else is absent. */
create or replace function app.event_content_fresh(p_event uuid)
returns app.event_content
language sql
stable
security definer
set search_path = ''
as $$
  select c.* from app.event_content c
   where c.event_id = p_event
     and c.expires_at > now()
     and c.purge_requested_at is null;
$$;

/**
 * Removes provider display content and leaves everything of ours.
 *
 * This is the takedown path (§10.1). It is deliberately incapable of touching
 * a membership, a match, a message, a block or a report — it can only empty a
 * lease, which is the only thing that was ever the provider's.
 */
create or replace function public.purge_event_content(
  p_provider_event_id text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_removed integer;
begin
  delete from app.event_content c
   using public.events e
   where c.event_id = e.id
     and (p_provider_event_id is null or e.provider_event_id = p_provider_event_id)
     and (p_provider_event_id is not null
          or c.expires_at < now()
          or c.purge_requested_at is not null);
  get diagnostics v_removed = row_count;
  return v_removed;
end;
$$;

comment on function public.purge_event_content(text) is
  'D-056 §10.1: with an id, an immediate takedown of one event''s content; without one, the routine sweep of everything expired or flagged. Cannot reach an app-owned row.';

revoke all on function public.purge_event_content(text) from public, anon, authenticated;
grant execute on function public.purge_event_content(text) to service_role;

/** Flags one event's content for removal within the hour, ahead of the sweep. */
create or replace function public.request_event_takedown(p_provider_event_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  update app.event_content c
     set purge_requested_at = now()
    from public.events e
   where c.event_id = e.id and e.provider_event_id = p_provider_event_id;
$$;

revoke all on function public.request_event_takedown(text) from public, anon, authenticated;
grant execute on function public.request_event_takedown(text) to service_role;

-- -------------------------------------------------------- the search cache
create table app.event_search_cache (
  /**
   * provider · area · date bucket · classification · locale · page (§7.1).
   * Deliberately no user id and no coordinate: a cache keyed to a person is
   * not a shared cache, and one keyed to a coordinate is a location record.
   */
  cache_key   text primary key,
  payload     jsonb       not null,
  fetched_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  /** Set while one request is upstream, so the rest wait rather than pile on. */
  filling_at  timestamptz,

  constraint event_search_cache_expiry check (expires_at > fetched_at)
);

comment on table app.event_search_cache is
  'D-056 §7.1: the shared, user-agnostic search cache. Its key holds an area, a date bucket, a filter, a locale and a page — never a person and never a coordinate.';

create index event_search_cache_expiry_idx on app.event_search_cache (expires_at);

alter table app.event_search_cache enable row level security;
revoke all on table app.event_search_cache from anon, authenticated;

/**
 * Answers a search from the cache, or claims the right to go and fill it.
 *
 * Returns `hit` with a payload, or `fill` for exactly one caller while the
 * others are told to wait — which is what turns an advertising spike into one
 * Ticketmaster request instead of ten thousand (§7.1, §12).
 */
create or replace function public.take_event_search_cache(
  p_key text,
  p_fill_timeout interval default interval '10 seconds'
)
returns table (state text, payload jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row app.event_search_cache;
begin
  delete from app.event_search_cache c where c.expires_at < now() - interval '1 day';

  select * into v_row from app.event_search_cache c where c.cache_key = p_key for update;

  if found and v_row.expires_at > now() then
    return query select 'hit', v_row.payload;
    return;
  end if;

  -- Somebody else is already upstream for this exact key, and recently enough
  -- to still be believed.
  if found and v_row.filling_at is not null and v_row.filling_at > now() - p_fill_timeout then
    return query select 'wait', v_row.payload;
    return;
  end if;

  -- The placeholder must read as *already stale*, not as a one-second hit:
  -- inside a transaction `now()` does not move, so a second caller in the same
  -- statement batch would otherwise be served an empty payload as fresh.
  insert into app.event_search_cache (cache_key, payload, fetched_at, expires_at, filling_at)
  values (p_key, '{}'::jsonb, now() - interval '2 seconds', now() - interval '1 second', now())
  on conflict (cache_key) do update set filling_at = now();

  return query select 'fill', null::jsonb;
end;
$$;

revoke all on function public.take_event_search_cache(text, interval) from public, anon, authenticated;
grant execute on function public.take_event_search_cache(text, interval) to service_role;

create or replace function public.put_event_search_cache(
  p_key text,
  p_payload jsonb,
  p_ttl interval
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into app.event_search_cache (cache_key, payload, fetched_at, expires_at, filling_at)
  values (p_key, p_payload, now(), now() + p_ttl, null)
  on conflict (cache_key) do update
     set payload = excluded.payload,
         fetched_at = now(),
         expires_at = excluded.expires_at,
         filling_at = null;
$$;

revoke all on function public.put_event_search_cache(text, jsonb, interval) from public, anon, authenticated;
grant execute on function public.put_event_search_cache(text, jsonb, interval) to service_role;

-- ----------------------------------------------------- membership and focus
create table public.event_memberships (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  event_id     uuid not null references public.events (id) on delete cascade,
  declared_at  timestamptz not null default now(),
  /** Withdrawing closes the room without deleting a match or a message. */
  withdrawn_at timestamptz,

  primary key (user_id, event_id)
);

comment on table public.event_memberships is
  'D-056 §8.1: "I plan to go." A declaration, like an upcoming stay — no ticket, no proof, and several may be live at once.';

create index event_memberships_event_idx on public.event_memberships (event_id)
  where withdrawn_at is null;

alter table public.event_memberships enable row level security;
alter table public.event_memberships force row level security;
revoke all on table public.event_memberships from anon, authenticated;
grant select on table public.event_memberships to authenticated;

create policy event_memberships_select_own on public.event_memberships
  for select to authenticated
  using (user_id = app.current_user_id());

/**
 * Which event's deck the person is looking at.
 *
 * Deliberately *not* named "active event": it is a viewing choice, it deletes
 * nothing when it changes, and no eligibility rule anywhere depends on it
 * except "whose deck am I drawing".
 */
create table public.user_event_focus (
  user_id  uuid primary key references public.profiles (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  room     text not null
    constraint user_event_focus_room check (room in ('EVENT_UPCOMING', 'EVENT_HERE_NOW')),
  chosen_at timestamptz not null default now()
);

alter table public.user_event_focus enable row level security;
alter table public.user_event_focus force row level security;
revoke all on table public.user_event_focus from anon, authenticated;
grant select on table public.user_event_focus to authenticated;

create policy user_event_focus_select_own on public.user_event_focus
  for select to authenticated
  using (user_id = app.current_user_id());

/**
 * One live event verification per person, and only one.
 *
 * A separate table from `presence_checks` on purpose: the hotel's answer and
 * the event's answer must be able to be true at once, and expiring one must
 * not touch the other (§5).
 */
create table public.event_presence_checks (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  event_id     uuid not null references public.events (id) on delete cascade,
  within_range boolean not null,
  checked_at   timestamptz not null default now(),
  expires_at   timestamptz not null
);

comment on table public.event_presence_checks is
  'D-056 §9: the privacy-safe result of one live-event check. A decision and two clocks — no coordinate, no distance, no trail.';

alter table public.event_presence_checks enable row level security;
alter table public.event_presence_checks force row level security;
revoke all on table public.event_presence_checks from anon, authenticated;
grant select on table public.event_presence_checks to authenticated;

create policy event_presence_select_own on public.event_presence_checks
  for select to authenticated
  using (user_id = app.current_user_id());

-- ----------------------------------------------------------- the selections
create table app.event_selections (
  token             uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  provider_event_id text not null,
  /** Which search this came out of, so a token cannot outlive its context. */
  search_key        text not null,
  provider_status   text not null,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  used_at           timestamptz
);

comment on table app.event_selections is
  'D-056 §6.2: an event id the backend itself returned, bound to the user who searched. Single-use, short-lived, and the only thing a room may be created from.';

create index event_selections_user_idx on app.event_selections (user_id, expires_at desc);

alter table app.event_selections enable row level security;
revoke all on table app.event_selections from anon, authenticated;

create or replace function app.event_selection_freshness()
returns interval language sql immutable set search_path = '' as $$ select interval '30 minutes'; $$;

create or replace function public.record_event_selections(
  p_user      uuid,
  p_search_key text,
  p_events    jsonb
)
returns table (token uuid, provider_event_id text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null or p_events is null then
    return;
  end if;

  return query
    insert into app.event_selections as s
      (user_id, provider_event_id, search_key, provider_status, expires_at)
    select p_user,
           e ->> 'id',
           p_search_key,
           coalesce(e ->> 'status', 'unknown'),
           now() + app.event_selection_freshness()
      from jsonb_array_elements(p_events) e
     where char_length(coalesce(e ->> 'id', '')) between 3 and 200
    returning s.token, s.provider_event_id;
end;
$$;

revoke all on function public.record_event_selections(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_event_selections(uuid, text, jsonb) to service_role;

/**
 * Spends a selection. One UPDATE, four refusals: unknown token, another
 * user's, expired, already used — the D-053a shape, because it was right.
 */
create or replace function public.take_event_selection(p_user uuid, p_token uuid)
returns table (provider_event_id text, provider_status text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
    update app.event_selections s
       set used_at = now()
     where s.token = p_token
       and s.user_id = p_user
       and s.used_at is null
       and s.expires_at > now()
    returning s.provider_event_id, s.provider_status;
end;
$$;

revoke all on function public.take_event_selection(uuid, uuid) from public, anon, authenticated;
grant execute on function public.take_event_selection(uuid, uuid) to service_role;

-- ------------------------------------------------------------ capabilities
/**
 * What a person may do in the event rooms.
 *
 * Both answer true today. They exist so the free/premium mapping is one
 * server-side decision later rather than a plan check scattered through the
 * UI (§13) — and so that when it is made, nothing in the app has to move.
 */
create or replace function app.event_capability(p_user uuid, p_capability text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_capability
    when 'can_join_event_upcoming' then true
    when 'can_join_event_here_now' then true
    else false
  end
  and exists (select 1 from public.profiles p
               where p.id = p_user and p.suspended_at is null);
$$;

create or replace function public.my_event_capabilities()
returns table (capability text, allowed boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.capability, app.event_capability(app.require_user(), c.capability)
    from (values ('can_join_event_upcoming'), ('can_join_event_here_now')) as c(capability);
$$;

revoke all on function public.my_event_capabilities() from public, anon;
grant execute on function public.my_event_capabilities() to authenticated, service_role;

-- ------------------------------------------------------------- the ceilings
/**
 * The provider's own published quota is 2 requests/second and 5,000 a day
 * (§12). Ours sit below it, are configuration rather than product rules, and
 * are claimed *before* the upstream request — the D-052 shape, reused.
 */
create table app.provider_second (
  service    text not null,
  second     timestamptz not null,
  used       integer not null default 0,

  primary key (service, second)
);

alter table app.provider_second enable row level security;
revoke all on table app.provider_second from anon, authenticated;

create or replace function public.claim_provider_second(
  p_service   text,
  p_allowance integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_second timestamptz := date_trunc('second', now());
  v_used   integer;
begin
  delete from app.provider_second s where s.second < v_second - interval '1 minute';

  insert into app.provider_second (service, second, used)
  values (p_service, v_second, 1)
  on conflict (service, second) do update
     set used = app.provider_second.used + 1
   where app.provider_second.used < p_allowance
  returning used into v_used;

  return v_used is not null;
end;
$$;

revoke all on function public.claim_provider_second(text, integer) from public, anon, authenticated;
grant execute on function public.claim_provider_second(text, integer) to service_role;

/**
 * The circuit breaker. Opens after repeated provider failures and closes
 * itself after a cool-down, so a provider having a bad ten minutes does not
 * become ten minutes of our users watching a spinner.
 */
create table app.provider_health (
  service        text primary key,
  failures       integer not null default 0,
  opened_at      timestamptz,
  last_failure_at timestamptz
);

alter table app.provider_health enable row level security;
revoke all on table app.provider_health from anon, authenticated;

create or replace function app.breaker_threshold()
returns integer language sql immutable set search_path = '' as $$ select 5; $$;
create or replace function app.breaker_cooldown()
returns interval language sql immutable set search_path = '' as $$ select interval '2 minutes'; $$;

create or replace function public.provider_breaker(p_service text, p_outcome text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row app.provider_health;
begin
  insert into app.provider_health (service) values (p_service)
  on conflict (service) do nothing;

  if p_outcome = 'ok' then
    update app.provider_health h
       set failures = 0, opened_at = null
     where h.service = p_service;
    return false;
  end if;

  if p_outcome = 'fail' then
    update app.provider_health h
       set failures = h.failures + 1,
           last_failure_at = now(),
           opened_at = case
             when h.failures + 1 >= app.breaker_threshold() then now()
             else h.opened_at end
     where h.service = p_service;
    return false;
  end if;

  -- 'check': is the breaker open right now?
  select * into v_row from app.provider_health h where h.service = p_service;
  if v_row.opened_at is null then
    return false;
  end if;
  if v_row.opened_at < now() - app.breaker_cooldown() then
    update app.provider_health h set failures = 0, opened_at = null where h.service = p_service;
    return false;
  end if;
  return true;
end;
$$;

revoke all on function public.provider_breaker(text, text) from public, anon, authenticated;
grant execute on function public.provider_breaker(text, text) to service_role;

notify pgrst, 'reload schema';
