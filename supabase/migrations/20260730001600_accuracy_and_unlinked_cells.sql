-- D-055a (owner, 2026-07-30) — two security corrections, before events.
--
-- 1. A 900 m fix must not pass a 500 m check.
--
--    V-010 used accuracy only to decide whether a reading could *teach* a
--    venue its coarse cell. The check itself still accepted anything, which
--    means a reading whose error is twice the radius could open Here Now.
--    That is the room's whole guarantee, so the rule moves into a shared
--    validator both the hotel path and the coming event path call: no stated
--    accuracy is a refusal, worse than 100 m is a refusal, and a refusal is
--    its own outcome rather than a quiet "not here".
--
--    Nothing is written on a refusal: no presence answer, no entitlement, no
--    contribution, no success. The refusal itself is counted, because a
--    refusal is a measurement.
--
-- 2. A contribution must not be readable as "this person was in that cell".
--
--    `venue_region_votes` held `(venue_id, user_id, cell_key)`. Its purpose
--    was only ever "has this person already contributed here", but its shape
--    was a location record: one row said where one named person had been, to
--    within 1.5 km. The shape now matches the purpose.
--
--      app.venue_region_contributors  (venue_id, contributor_key)
--      app.venue_region_tally         (venue_id, cell_key, contributions)
--
--    `contributor_key` is an HMAC over the venue and the user under a
--    server-side secret, so it is not reversible, and it is salted by venue,
--    so the same person at two venues produces two unrelated keys. The cell
--    counts live at venue level. **No row anywhere holds a user and a cell
--    together**, and neither table is readable by any client.
--
--    The contributors table deliberately has no timestamp: a lone
--    contribution plus a clock is a correlation, and the row does not need
--    one to do its job.

-- ------------------------------------------------- 1. the shared validator
create or replace function app.location_accuracy_ceiling()
returns double precision language sql immutable set search_path = '' as $$ select 100.0; $$;

comment on function app.location_accuracy_ceiling() is
  'D-055a: the worst horizontal accuracy any presence check will accept. A reading vaguer than this cannot show somebody is inside a 500 m radius.';

/**
 * The one place a foreground reading is judged usable.
 *
 * Returns null when the reading may be used, and otherwise the reason it may
 * not. Both presence paths call it, and the event room will call the same
 * function rather than a copy of the same idea — which is the point of it
 * being a function at all.
 */
create or replace function app.reading_problem(
  p_latitude        double precision,
  p_longitude       double precision,
  p_accuracy_meters double precision
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_latitude is null or p_longitude is null
      or p_latitude < -90 or p_latitude > 90
      or p_longitude < -180 or p_longitude > 180
      then 'LOCATION_UNUSABLE'
    -- A device that will not say how good its fix is has not told us it is
    -- good. "Unknown" is refused for the same reason "bad" is.
    when p_accuracy_meters is null or p_accuracy_meters <= 0
      then 'LOCATION_INACCURATE'
    when p_accuracy_meters > app.location_accuracy_ceiling()
      then 'LOCATION_INACCURATE'
  end;
$$;

comment on function app.reading_problem(double precision, double precision, double precision) is
  'D-055a: the shared usability rule for a foreground reading. Null means usable. Hotel Here Now and the coming event room both call this rather than repeating it.';

grant execute on function app.reading_problem(double precision, double precision, double precision)
  to authenticated, service_role;

-- The old name was about the region cell alone; the ceiling is now the
-- check's, and the cell merely inherits it.
drop function if exists app.region_accuracy_ceiling();

-- ------------------------------------- 2. the contribution, without a person
-- `hmac` and `gen_random_bytes` live in pgcrypto. Supabase ships it enabled;
-- declared here the same way postgis and pg_trgm are, so a fresh database
-- built from these migrations alone has it too.
create extension if not exists pgcrypto with schema extensions;

create table app.instance_secret (
  id      boolean primary key default true constraint instance_secret_one check (id),
  /** Never exported, never logged, never returned. Rotating it simply makes
      every existing contributor key unrecognisable, which costs a venue only
      its "one per person" memory. */
  secret  bytea not null default extensions.gen_random_bytes(32)
);
insert into app.instance_secret default values on conflict do nothing;

alter table app.instance_secret enable row level security;
revoke all on table app.instance_secret from anon, authenticated;

/**
 * A stable, irreversible name for "this person, at this venue".
 *
 * Salted by venue on purpose: without that, one key would follow a person
 * across every venue they ever verified at, which is a movement history in
 * all but name.
 */
create or replace function app.contributor_key(p_venue uuid, p_user uuid)
returns bytea
language sql
stable
security definer
set search_path = ''
as $$
  -- `hmac` has a (bytea, bytea, text) form and a (text, text, text) form, and
  -- no mixed one — the message is converted rather than the key weakened.
  select extensions.hmac(
           convert_to(p_venue::text || ':' || p_user::text, 'UTF8'), s.secret, 'sha256')
    from app.instance_secret s;
$$;

revoke all on function app.contributor_key(uuid, uuid) from public, anon, authenticated;

create table app.venue_region_contributors (
  venue_id        uuid  not null references public.hotels (id) on delete cascade,
  /** HMAC(venue, user). Not a user id, and not reversible into one. */
  contributor_key bytea not null,

  primary key (venue_id, contributor_key)
);

comment on table app.venue_region_contributors is
  'D-055a: who has already contributed to a venue, as an irreversible per-venue key. Holds no user id, no cell and no timestamp — only the fact that somebody did.';

alter table app.venue_region_contributors enable row level security;
revoke all on table app.venue_region_contributors from anon, authenticated;

create table app.venue_region_tally (
  venue_id      uuid    not null references public.hotels (id) on delete cascade,
  cell_key      text    not null constraint venue_region_tally_key check (cell_key like 'rcell:%'),
  contributions integer not null default 0
    constraint venue_region_tally_count check (contributions >= 0),

  primary key (venue_id, cell_key)
);

comment on table app.venue_region_tally is
  'D-055a: how many people put a venue in each coarse cell. Aggregated at venue level, so no row pairs a person with a place.';

alter table app.venue_region_tally enable row level security;
revoke all on table app.venue_region_tally from anon, authenticated;

-- --------------------------------------------------------- the conversion
-- Existing contributions are carried across in the new shape rather than
-- thrown away: the counts a venue has earned are real, and only the linkage
-- was wrong. The old table is dropped in the same migration, so there is no
-- window in which both shapes exist.
insert into app.venue_region_contributors (venue_id, contributor_key)
select v.venue_id, app.contributor_key(v.venue_id, v.user_id)
  from app.venue_region_votes v
on conflict do nothing;

insert into app.venue_region_tally (venue_id, cell_key, contributions)
select v.venue_id, v.cell_key, count(*)
  from app.venue_region_votes v
 group by v.venue_id, v.cell_key
on conflict (venue_id, cell_key) do update
  set contributions = excluded.contributions;

drop table app.venue_region_votes;

-- ----------------------------------------------------------- consolidation
/**
 * Establishes or consolidates a venue's cell from the tally.
 *
 * Unchanged in rule: the incumbent stands unless a rival is confirmed by at
 * least two distinct contributors *and* by strictly more of them. What
 * changed is where the count comes from — a per-venue tally rather than a
 * table of who said what.
 */
create or replace function app.consolidate_region_cell(p_venue uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current   text;
  v_current_n integer;
  v_rival     text;
  v_rival_n   integer;
begin
  select h.coarse_region_cell into v_current
    from public.hotels h where h.id = p_venue for update;

  select t.cell_key, t.contributions into v_rival, v_rival_n
    from app.venue_region_tally t
   where t.venue_id = p_venue
   order by t.contributions desc, t.cell_key
   limit 1;

  if v_rival is null then
    return;
  end if;

  if v_current is null then
    update public.hotels h set coarse_region_cell = v_rival where h.id = p_venue;
    return;
  end if;

  if v_rival = v_current then
    return;
  end if;

  select coalesce(t.contributions, 0) into v_current_n
    from app.venue_region_tally t
   where t.venue_id = p_venue and t.cell_key = v_current;

  if v_rival_n >= 2 and v_rival_n > coalesce(v_current_n, 0) then
    update public.hotels h set coarse_region_cell = v_rival where h.id = p_venue;
  end if;
end;
$$;

revoke all on function app.consolidate_region_cell(uuid) from public, anon, authenticated;

-- ------------------------------------------------ the two presence checks
-- Both now answer with an outcome, because "not here" and "we could not tell"
-- are different things and a room that conflates them is lying about one of
-- them. Return types change: drop and create.
drop function if exists public.record_presence_verified(
  uuid, double precision, double precision, double precision, double precision, double precision);

create function public.record_presence_verified(
  p_user            uuid,
  p_latitude        double precision,
  p_longitude       double precision,
  p_venue_latitude  double precision,
  p_venue_longitude double precision,
  p_accuracy_meters double precision default null
)
returns table (outcome text, within_range boolean, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hotel   uuid;
  v_within  boolean;
  v_now     timestamptz := now();
  v_expires timestamptz;
  v_cell    record;
  v_added   boolean := false;
  v_google  boolean;
  v_before  text;
  v_after   text;
  v_problem text;
  v_key     bytea;
begin
  if p_user is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;
  if p_venue_latitude is null or p_venue_longitude is null
     or p_venue_latitude < -90 or p_venue_latitude > 90
     or p_venue_longitude < -180 or p_venue_longitude > 180 then
    raise exception 'That location reading is not usable.' using errcode = '23514';
  end if;

  v_problem := app.reading_problem(p_latitude, p_longitude, p_accuracy_meters);
  if v_problem = 'LOCATION_UNUSABLE' then
    raise exception 'That location reading is not usable.' using errcode = '23514';
  end if;

  select uah.hotel_id into v_hotel
    from public.user_active_hotel uah
   where uah.user_id = p_user;

  if v_hotel is null then
    raise exception 'Choose a hotel first.' using errcode = 'P0002';
  end if;

  if not app.is_premium(p_user) then
    raise exception 'Here Now is for Premium members.' using errcode = 'PP001';
  end if;

  perform app.rate_limit(p_user, 'presence_check', 30, interval '1 hour');

  -- D-055a: a fix vaguer than 100 m cannot show anybody is inside 500 m.
  -- Nothing is written — no presence answer, no contribution, no success —
  -- and the previous answer, whatever it was, is left exactly as it was.
  if v_problem is not null then
    perform app.note('here_now_verification', 'inaccurate', p_user);
    return query select v_problem, false, null::timestamptz;
    return;
  end if;

  select (h.provider = 'google'), h.coarse_region_cell into v_google, v_before
    from public.hotels h where h.id = v_hotel;

  v_within := extensions.st_dwithin(
    extensions.st_setsrid(extensions.st_makepoint(p_venue_longitude, p_venue_latitude), 4326)::extensions.geography,
    extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography,
    app.presence_radius_meters()
  );

  v_expires := v_now + app.presence_freshness();

  delete from public.presence_checks pc where pc.expires_at < v_now;

  insert into public.presence_checks as pc (user_id, hotel_id, within_range, checked_at, expires_at)
  values (p_user, v_hotel, v_within, v_now, v_expires)
  on conflict (user_id) do update
     set hotel_id = excluded.hotel_id,
         within_range = excluded.within_range,
         checked_at = excluded.checked_at,
         expires_at = excluded.expires_at;

  perform app.note(
    'here_now_verification',
    case when v_within then 'ok' else 'out_of_range' end,
    p_user);

  -- V-010, in its new shape: the accuracy was already proven above, so the
  -- only remaining conditions are "it worked" and "it is a Google venue".
  if v_within and v_google then
    select * into v_cell from app.region_cell_of(p_latitude, p_longitude);
    if v_cell.cell_key is not null then
      v_key := app.contributor_key(v_hotel, p_user);
      -- One contribution per person per venue, and the row that remembers it
      -- holds neither the person nor the cell.
      insert into app.venue_region_contributors (venue_id, contributor_key)
      values (v_hotel, v_key)
      on conflict do nothing;
      get diagnostics v_added = row_count;

      if v_added then
        insert into app.venue_region_tally (venue_id, cell_key, contributions)
        values (v_hotel, v_cell.cell_key, 1)
        on conflict (venue_id, cell_key)
          do update set contributions = app.venue_region_tally.contributions + 1;

        perform app.consolidate_region_cell(v_hotel);
        select h.coarse_region_cell into v_after
          from public.hotels h where h.id = v_hotel;
        perform app.note(
          'region_cell',
          case
            when v_before is null and v_after is not null then 'formed'
            when v_after is distinct from v_before        then 'moved'
            when v_cell.cell_key = v_after                then 'confirmed'
            else 'outlier_refused'
          end,
          p_user);
      end if;
    end if;
  end if;

  return query select case when v_within then 'IN_RANGE' else 'TOO_FAR' end, v_within, v_expires;
end;
$$;

comment on function public.record_presence_verified(uuid, double precision, double precision, double precision, double precision, double precision) is
  'D-054/V-010/D-055a: the Here Now check for a venue whose coordinate we may not store. Refuses a reading vaguer than 100 m, and is the one place a venue''s coarse cell can be learned.';

revoke all on function public.record_presence_verified(
  uuid, double precision, double precision, double precision, double precision, double precision)
  from public, anon, authenticated;
grant execute on function public.record_presence_verified(
  uuid, double precision, double precision, double precision, double precision, double precision)
  to service_role;

-- The catalogue path takes the same rule, from the same function. The event
-- room will be the third caller and will not get to invent its own.
drop function if exists public.record_presence_check(double precision, double precision);

create function public.record_presence_check(
  p_latitude        double precision,
  p_longitude       double precision,
  p_accuracy_meters double precision default null
)
returns table (outcome text, within_range boolean, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := app.require_user();
  v_hotel   uuid;
  v_within  boolean;
  v_now     timestamptz := now();
  v_expires timestamptz;
  v_problem text;
begin
  v_problem := app.reading_problem(p_latitude, p_longitude, p_accuracy_meters);
  if v_problem = 'LOCATION_UNUSABLE' then
    raise exception 'That location reading is not usable.' using errcode = '23514';
  end if;

  select uah.hotel_id into v_hotel
    from public.user_active_hotel uah
   where uah.user_id = v_user;

  if v_hotel is null then
    raise exception 'Choose a hotel first.' using errcode = 'P0002';
  end if;

  if not app.is_premium(v_user) then
    raise exception 'Here Now is for Premium members.' using errcode = 'PP001';
  end if;

  if exists (select 1 from public.hotels h where h.id = v_hotel and h.provider = 'google') then
    raise exception 'That place needs the verified check.' using errcode = 'P0004';
  end if;

  perform app.rate_limit(v_user, 'presence_check', 30, interval '1 hour');

  if v_problem is not null then
    perform app.note('here_now_verification', 'inaccurate', v_user);
    return query select v_problem, false, null::timestamptz;
    return;
  end if;

  select extensions.st_dwithin(
           h.location,
           extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography,
           app.presence_radius_meters()
         )
    into v_within
    from public.hotels h
   where h.id = v_hotel;

  v_expires := v_now + app.presence_freshness();

  delete from public.presence_checks pc where pc.expires_at < v_now;

  insert into public.presence_checks as pc (user_id, hotel_id, within_range, checked_at, expires_at)
  values (v_user, v_hotel, v_within, v_now, v_expires)
  on conflict (user_id) do update
     set hotel_id = excluded.hotel_id,
         within_range = excluded.within_range,
         checked_at = excluded.checked_at,
         expires_at = excluded.expires_at;

  perform app.note(
    'here_now_verification',
    case when v_within then 'ok' else 'out_of_range' end,
    v_user);

  return query select case when v_within then 'IN_RANGE' else 'TOO_FAR' end, v_within, v_expires;
end;
$$;

comment on function public.record_presence_check(double precision, double precision, double precision) is
  'D-002/D-055a: the Here Now check for a catalogue venue. Same shared accuracy rule as the provider path; a reading vaguer than 100 m is refused rather than answered.';

revoke all on function public.record_presence_check(double precision, double precision, double precision)
  from public, anon;
grant execute on function public.record_presence_check(double precision, double precision, double precision)
  to authenticated, service_role;

-- ------------------------------------------------------ the counts, updated
create or replace function public.venue_operations_view()
returns table (metric text, value numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with events as (
    select operation, outcome, sum(quantity)::numeric as n
      from app.provider_events
     where occurred_at >= date_trunc('month', now())
     group by operation, outcome
  ),
  venues as (
    select count(*)::numeric as total,
           count(*) filter (where coarse_region_cell is not null)::numeric as with_cell
      from public.hotels
     where provider = 'google' and is_active
  ),
  n as (
    select coalesce((select n from events where operation = o and outcome = c), 0) as v, o, c
      from (values
        ('google_venue_selection', 'ok'),
        ('here_now_verification', 'ok'),
        ('here_now_verification', 'out_of_range'),
        ('here_now_verification', 'inaccurate'),
        ('region_cell', 'formed'),
        ('region_cell', 'confirmed'),
        ('region_cell', 'moved'),
        ('region_cell', 'outlier_refused'),
        ('deck_labels', 'session'),
        ('deck_labels', 'unique_place_ids'),
        ('deck_labels', 'details_resolved'),
        ('deck_labels', 'generic_fallback')
      ) as t(o, c)
  ),
  pick as (select o || '.' || c as key, v from n)
  select 'google_venue_selections', (select v from pick where key = 'google_venue_selection.ok')
  union all select 'here_now_verifications',
    (select v from pick where key = 'here_now_verification.ok')
    + (select v from pick where key = 'here_now_verification.out_of_range')
  union all select 'here_now_in_range',
    (select v from pick where key = 'here_now_verification.ok')
  -- D-055a: refusals for a vague fix are their own number. A room that was
  -- silently opening on 900 m readings would show up here as a step change.
  union all select 'here_now_refused_inaccurate',
    (select v from pick where key = 'here_now_verification.inaccurate')
  union all select 'region_cells_formed', (select v from pick where key = 'region_cell.formed')
  union all select 'region_cells_confirmed', (select v from pick where key = 'region_cell.confirmed')
  union all select 'region_cells_moved', (select v from pick where key = 'region_cell.moved')
  union all select 'region_cell_outliers_refused',
    (select v from pick where key = 'region_cell.outlier_refused')
  union all select 'google_venues_active', (select total from venues)
  union all select 'google_venues_with_region_cell', (select with_cell from venues)
  union all select 'google_venues_region_eligible_pct',
    case when (select total from venues) = 0 then 0
         else round(100 * (select with_cell from venues) / (select total from venues), 1) end
  union all select 'deck_sessions', (select v from pick where key = 'deck_labels.session')
  union all select 'deck_unique_place_ids_per_session',
    case when (select v from pick where key = 'deck_labels.session') = 0 then 0
         else round((select v from pick where key = 'deck_labels.unique_place_ids')
                    / (select v from pick where key = 'deck_labels.session'), 2) end
  union all select 'deck_details_calls_per_session',
    case when (select v from pick where key = 'deck_labels.session') = 0 then 0
         else round((select v from pick where key = 'deck_labels.details_resolved')
                    / (select v from pick where key = 'deck_labels.session'), 2) end
  union all select 'deck_generic_fallback_pct',
    case when (select v from pick where key = 'deck_labels.unique_place_ids') = 0 then 0
         else round(100 * (select v from pick where key = 'deck_labels.generic_fallback')
                    / (select v from pick where key = 'deck_labels.unique_place_ids'), 1) end
  union all select 'ceiling_autocomplete_used',
    coalesce((select m.used::numeric from app.metered_calls m
               where m.service = 'google_autocomplete'
                 and m.period = date_trunc('month', now())::date), 0)
  union all select 'ceiling_place_details_used',
    coalesce((select m.used::numeric from app.metered_calls m
               where m.service = 'google_place_details'
                 and m.period = date_trunc('month', now())::date), 0);
$$;

revoke all on function public.venue_operations_view() from public, anon, authenticated;
grant execute on function public.venue_operations_view() to service_role;

notify pgrst, 'reload schema';
