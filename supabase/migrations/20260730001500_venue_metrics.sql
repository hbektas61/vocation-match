-- V-012 (owner, 2026-07-30) — measure it, and do not guess at it.
--
-- The owner's instruction is explicit: produce no cost estimate and raise no
-- quota. What this migration adds is the eight counts a decision could later
-- rest on, and nothing that interprets them.
--
-- Everything here obeys the D-053b rule the metrics were born under: an
-- operation, an outcome, a count, and — where it is needed to tell one
-- person's behaviour from a hundred people's — a user id. Never a query, never
-- a coordinate, never a place name, never a Place ID.

-- Three of the eight are *rates* over a deck's worth of labels, so a single
-- row has to be able to say "four of these happened", not just "one did".
alter table app.provider_events
  add column quantity integer not null default 1
    constraint provider_events_quantity check (quantity between 0 and 1000);

comment on column app.provider_events.quantity is
  'V-012: how many of this outcome the row stands for. A deck reports its label counts as three rows rather than as one row per card.';

/**
 * The internal recorder.
 *
 * `record_provider_event` is service_role only because the edge function is
 * its caller. These events happen *inside* SECURITY DEFINER functions that
 * ordinary members invoke, so they need a boundary of their own — and the
 * same guarantee: a failed measurement is never a failed request.
 */
create or replace function app.note(
  p_operation text,
  p_outcome   text,
  p_user      uuid default null,
  p_quantity  integer default 1
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(p_quantity, 0) <= 0 then
    return;
  end if;
  insert into app.provider_events (operation, outcome, user_id, quantity)
  values (p_operation, p_outcome, p_user, least(p_quantity, 1000));
exception when others then
  return;
end;
$$;

revoke all on function app.note(text, text, uuid, integer) from public, anon, authenticated;

-- ------------------------------------------------- 1. venue selections
create or replace function public.activate_google_venue(
  p_selection_token uuid,
  p_venue_kind      text default null
)
returns table (
  hotel_id          uuid,
  activated_at      timestamptz,
  previous_hotel_id uuid,
  presence_cleared  boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := app.require_user();
  v_place   text;
  v_session uuid;
  v_venue   uuid;
begin
  if p_selection_token is null then
    raise exception 'That place selection is not usable.' using errcode = 'P0003';
  end if;

  update app.place_selections s
     set used_at = now()
   where s.token = p_selection_token
     and s.user_id = v_user
     and s.used_at is null
     and s.expires_at > now()
  returning s.google_place_id, s.session_id into v_place, v_session;

  if v_place is null then
    raise exception 'That place selection is not usable.' using errcode = 'P0003';
  end if;

  v_venue := public.upsert_google_venue(v_place, p_venue_kind);

  update app.search_sessions s
     set closed_at = coalesce(s.closed_at, now()),
         outcome = 'converted'
   where s.session_id = v_session
     and s.user_id = v_user;

  -- V-012 metric 1. The count of *selections*, which is the denominator every
  -- other venue rate is read against.
  perform app.note('google_venue_selection', 'ok', v_user);

  return query select * from public.set_active_hotel(v_venue);
end;
$$;

revoke all on function public.activate_google_venue(uuid, text) from public, anon;
grant execute on function public.activate_google_venue(uuid, text) to authenticated, service_role;

-- ------------------------- 2, 3. verifications, and what they taught a venue
create or replace function public.record_presence_verified(
  p_user            uuid,
  p_latitude        double precision,
  p_longitude       double precision,
  p_venue_latitude  double precision,
  p_venue_longitude double precision,
  p_accuracy_meters double precision default null
)
returns table (within_range boolean, expires_at timestamptz)
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
begin
  if p_user is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;
  if p_latitude is null or p_longitude is null
     or p_latitude < -90 or p_latitude > 90
     or p_longitude < -180 or p_longitude > 180
     or p_venue_latitude is null or p_venue_longitude is null
     or p_venue_latitude < -90 or p_venue_latitude > 90
     or p_venue_longitude < -180 or p_venue_longitude > 180 then
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

  -- V-012 metric 2.
  perform app.note(
    'here_now_verification',
    case when v_within then 'ok' else 'out_of_range' end,
    p_user);

  -- V-010, unchanged: only on a success, only at a Google venue, only from a
  -- reading accurate enough to be evidence, and only once per person.
  if v_within
     and p_accuracy_meters is not null
     and p_accuracy_meters <= app.region_accuracy_ceiling()
     and v_google
  then
    select * into v_cell from app.region_cell_of(p_latitude, p_longitude);
    if v_cell.cell_key is not null then
      insert into app.venue_region_votes (venue_id, user_id, cell_key)
      values (v_hotel, p_user, v_cell.cell_key)
      on conflict (venue_id, user_id) do nothing;
      get diagnostics v_added = row_count;
      if v_added then
        perform app.consolidate_region_cell(v_hotel);
        select h.coarse_region_cell into v_after
          from public.hotels h where h.id = v_hotel;
        -- V-012 metric 3, in the three shapes that matter: a venue that had no
        -- cell now has one; a contribution that agreed with the incumbent; a
        -- contribution the consolidation rule refused to let move it.
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
  elsif v_within and v_google then
    -- A good check at a Google venue that taught us nothing, because the fix
    -- was too vague or absent. Worth its own count: it is the difference
    -- between "nobody has been there" and "nobody's phone was sure enough".
    perform app.note('region_cell', 'accuracy_refused', p_user);
  end if;

  return query select v_within, v_expires;
end;
$$;

revoke all on function public.record_presence_verified(
  uuid, double precision, double precision, double precision, double precision, double precision)
  from public, anon, authenticated;
grant execute on function public.record_presence_verified(
  uuid, double precision, double precision, double precision, double precision, double precision)
  to service_role;

-- --------------------------------------- 5, 6, 7. what a deck's labels cost
/**
 * A deck reports what its labels cost it: how many distinct Google venues it
 * held, how many it resolved, and how many fell back to the generic word.
 *
 * Three counts, no Place IDs and no names — the client already has those and
 * they are exactly what must not be written down. Callable by the member whose
 * deck it was, because only the client knows these; the numbers are bounded so
 * a client cannot inflate the measurement into a story.
 */
create or replace function public.record_deck_labels(
  p_unique   integer,
  p_resolved integer,
  p_generic  integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_user();
begin
  -- A deck is at most 50 cards, so anything larger is not a deck.
  if coalesce(p_unique, 0) < 0 or p_unique > 50
     or coalesce(p_resolved, 0) < 0 or p_resolved > 50
     or coalesce(p_generic, 0) < 0 or p_generic > 50 then
    return;
  end if;

  perform app.rate_limit(v_user, 'deck_labels', 300, interval '1 hour');

  perform app.note('deck_labels', 'session', v_user, 1);
  perform app.note('deck_labels', 'unique_place_ids', v_user, p_unique);
  perform app.note('deck_labels', 'details_resolved', v_user, p_resolved);
  perform app.note('deck_labels', 'generic_fallback', v_user, p_generic);
end;
$$;

revoke all on function public.record_deck_labels(integer, integer, integer) from public, anon;
grant execute on function public.record_deck_labels(integer, integer, integer) to authenticated, service_role;

-- --------------------------------------------- the operational view, updated
/** This calendar month's counts, now summed by quantity. */
create or replace function public.provider_event_counts(p_operation text default null)
returns table (operation text, outcome text, events bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select e.operation, e.outcome, sum(e.quantity)::bigint
    from app.provider_events e
   where e.occurred_at >= date_trunc('month', now())
     and (p_operation is null or e.operation = p_operation)
   group by e.operation, e.outcome
   order by e.operation, e.outcome;
$$;

revoke all on function public.provider_event_counts(text) from public, anon, authenticated;
grant execute on function public.provider_event_counts(text) to service_role;

/**
 * The eight numbers the owner asked for, in one place, for this calendar
 * month. Facts only: no estimate is derived here and no ceiling is changed.
 */
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
    select coalesce((select n from events where operation = o and outcome = c), 0) as v,
           o, c
      from (values
        ('google_venue_selection', 'ok'),
        ('here_now_verification', 'ok'),
        ('here_now_verification', 'out_of_range'),
        ('region_cell', 'formed'),
        ('region_cell', 'confirmed'),
        ('region_cell', 'moved'),
        ('region_cell', 'outlier_refused'),
        ('region_cell', 'accuracy_refused'),
        ('deck_labels', 'session'),
        ('deck_labels', 'unique_place_ids'),
        ('deck_labels', 'details_resolved'),
        ('deck_labels', 'generic_fallback')
      ) as t(o, c)
  ),
  pick as (
    select o || '.' || c as key, v from n
  )
  -- 1. how many venues were chosen through Google
  select 'google_venue_selections', (select v from pick where key = 'google_venue_selection.ok')
  -- 2. how many Here Now checks ran on one, and how they came out
  union all select 'here_now_verifications',
    (select v from pick where key = 'here_now_verification.ok')
    + (select v from pick where key = 'here_now_verification.out_of_range')
  union all select 'here_now_in_range',
    (select v from pick where key = 'here_now_verification.ok')
  -- 3. how often a verification taught a venue where it is
  union all select 'region_cells_formed', (select v from pick where key = 'region_cell.formed')
  union all select 'region_cells_confirmed', (select v from pick where key = 'region_cell.confirmed')
  union all select 'region_cells_moved', (select v from pick where key = 'region_cell.moved')
  union all select 'region_cell_outliers_refused',
    (select v from pick where key = 'region_cell.outlier_refused')
  union all select 'region_cell_accuracy_refused',
    (select v from pick where key = 'region_cell.accuracy_refused')
  -- 4. and what share of Google venues that leaves in the region pool
  union all select 'google_venues_active', (select total from venues)
  union all select 'google_venues_with_region_cell', (select with_cell from venues)
  union all select 'google_venues_region_eligible_pct',
    case when (select total from venues) = 0 then 0
         else round(100 * (select with_cell from venues) / (select total from venues), 1) end
  -- 5, 6, 7. what a deck's labels cost
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
  -- 8. how much of each hard ceiling this month has actually used
  union all select 'ceiling_autocomplete_used',
    coalesce((select m.used::numeric from app.metered_calls m
               where m.service = 'google_autocomplete'
                 and m.period = date_trunc('month', now())::date), 0)
  union all select 'ceiling_place_details_used',
    coalesce((select m.used::numeric from app.metered_calls m
               where m.service = 'google_place_details'
                 and m.period = date_trunc('month', now())::date), 0);
$$;

comment on function public.venue_operations_view() is
  'V-012: the eight measurements, for this calendar month. Facts only — no cost estimate is derived and no ceiling is changed by anything here.';

revoke all on function public.venue_operations_view() from public, anon, authenticated;
grant execute on function public.venue_operations_view() to service_role;

notify pgrst, 'reload schema';
