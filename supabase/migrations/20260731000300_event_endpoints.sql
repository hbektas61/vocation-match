-- D-056 — Etkinlikler, part three: what a person can actually do.
--
-- Joining, withdrawing, choosing which deck to look at, and the live check.
-- Every one of them is server-authoritative about the thing it is authoritative
-- about, and none of them touches the hotel.

-- ---------------------------------------------------------------- joining
/**
 * "Bu etkinliğe gitmeyi planlıyorum."
 *
 * A declaration, in the D-001 sense: no ticket, no booking, no document, no
 * QR code, no proof of anything. What it does require is that the event is
 * real — which is what the selection token proves, because the client never
 * learned a provider event id it could invent one from (§6.2).
 *
 * Deliberately absent: any statement about the caller's hotel. An event
 * declaration is not a venue and does not deactivate one (§5, §16.13).
 */
create or replace function public.join_event_upcoming(p_selection_token uuid)
returns table (event_id uuid, provider_event_id text, declared_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
-- The OUT parameters share their names with the columns this function writes,
-- and an `on conflict (user_id, event_id)` target would otherwise resolve to
-- the variables. Columns win here; every variable below is qualified or
-- prefixed, so nothing else changes meaning.
#variable_conflict use_column
declare
  v_user   uuid := app.require_user();
  v_place  record;
  v_event  uuid;
  v_now    timestamptz := now();
  v_window record;
begin
  if not app.flag('EVENTS_FEATURE_ENABLED') then
    raise exception 'Events are not open yet.' using errcode = 'P0002';
  end if;
  if not app.event_capability(v_user, 'can_join_event_upcoming') then
    raise exception 'Joining events is not available on your account.' using errcode = 'PP001';
  end if;

  select * into v_place from public.take_event_selection(v_user, p_selection_token);
  if v_place.provider_event_id is null then
    raise exception 'That event selection is not usable.' using errcode = 'P0003';
  end if;

  -- §8.1: a cancelled event takes no new members. The status is the one the
  -- backend recorded when it issued the token, so a client cannot present a
  -- stale "onsale" for an event that has since been called off — the token
  -- expires in thirty minutes and the search that minted it is revalidated.
  if lower(v_place.provider_status) in ('cancelled', 'canceled') then
    raise exception 'That event has been cancelled.' using errcode = 'P0005';
  end if;

  v_event := public.upsert_event(v_place.provider_event_id);

  -- A confirmed future date is required, and a date-only event is allowed
  -- (§8.1) — it simply cannot support the live room later.
  select * into v_window from app.event_live_window(v_event);
  if v_window.closes_at is not null and v_window.closes_at < v_now then
    raise exception 'That event has already finished.' using errcode = 'P0005';
  end if;

  insert into public.event_memberships as m (user_id, event_id)
  values (v_user, v_event)
  on conflict (user_id, event_id) do update
     set withdrawn_at = null,
         declared_at = case when m.withdrawn_at is not null then now() else m.declared_at end;

  -- Looking at what you just joined is the obvious next thing, and it costs
  -- nothing: focus is a viewing choice, not a membership.
  insert into public.user_event_focus (user_id, event_id, room)
  values (v_user, v_event, 'EVENT_UPCOMING')
  on conflict (user_id) do update
     set event_id = excluded.event_id, room = excluded.room, chosen_at = now();

  perform app.note('event_upcoming_joined', 'ok', v_user);

  return query
    select m.event_id, v_place.provider_event_id, m.declared_at
      from public.event_memberships m
     where m.user_id = v_user and m.event_id = v_event;
end;
$$;

revoke all on function public.join_event_upcoming(uuid) from public, anon;
grant execute on function public.join_event_upcoming(uuid) to authenticated, service_role;

/**
 * Withdrawing. Closes the room and deletes nothing — the matches and the
 * conversations that came out of it are as much theirs as anybody's (§8.1).
 */
create or replace function public.withdraw_from_event(p_event uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_user();
begin
  update public.event_memberships m
     set withdrawn_at = now()
   where m.user_id = v_user and m.event_id = p_event and m.withdrawn_at is null;

  delete from public.user_event_focus f
   where f.user_id = v_user and f.event_id = p_event;
end;
$$;

revoke all on function public.withdraw_from_event(uuid) from public, anon;
grant execute on function public.withdraw_from_event(uuid) to authenticated, service_role;

/**
 * Which deck to look at. Changing it deletes nothing, which is the whole
 * reason it is a row of its own rather than a column on the membership.
 */
create or replace function public.set_event_focus(p_event uuid, p_room text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_user();
begin
  if p_room not in ('EVENT_UPCOMING', 'EVENT_HERE_NOW') then
    raise exception 'Unknown room.' using errcode = '23514';
  end if;
  if not app.event_room_eligible(v_user, p_event, p_room) then
    raise exception 'You do not have access to this room yet.' using errcode = '42501';
  end if;

  insert into public.user_event_focus (user_id, event_id, room)
  values (v_user, p_event, p_room)
  on conflict (user_id) do update
     set event_id = excluded.event_id, room = excluded.room, chosen_at = now();
end;
$$;

revoke all on function public.set_event_focus(uuid, text) from public, anon;
grant execute on function public.set_event_focus(uuid, text) to authenticated, service_role;

-- --------------------------------------------------------- what I am in
/**
 * The caller's own event rooms: what they declared, whether the live room is
 * open, and when each answer lapses.
 *
 * Returns no provider content. The screen has that from the lease, or it has
 * nothing and says so.
 */
create or replace function public.my_events()
returns table (
  event_id          uuid,
  provider_event_id text,
  declared_at       timestamptz,
  focused           boolean,
  upcoming_open     boolean,
  here_now_open     boolean,
  here_now_until    timestamptz,
  live_opens_at     timestamptz,
  live_closes_at    timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id,
         e.provider_event_id,
         m.declared_at,
         (f.event_id = e.id),
         app.event_room_eligible(app.require_user(), e.id, 'EVENT_UPCOMING'),
         app.event_room_eligible(app.require_user(), e.id, 'EVENT_HERE_NOW'),
         (select pc.expires_at from public.event_presence_checks pc
           where pc.user_id = app.require_user() and pc.event_id = e.id
             and pc.within_range and pc.expires_at > now()),
         w.opens_at,
         w.closes_at
    from public.event_memberships m
    join public.events e on e.id = m.event_id
    left join public.user_event_focus f on f.user_id = m.user_id
    left join lateral app.event_live_window(e.id) w on true
   where m.user_id = app.require_user()
     and m.withdrawn_at is null
   order by w.opens_at nulls last, m.declared_at;
$$;

revoke all on function public.my_events() from public, anon;
grant execute on function public.my_events() to authenticated, service_role;

-- ------------------------------------------------- the live-event check
/**
 * "Şu An Etkinlikteyim", decided by the server on every axis that matters.
 *
 * The caller — the edge function, holding the service role — has just read the
 * event's venue coordinate from Ticketmaster. It is an argument here and is
 * never written down, exactly as a Google venue's is (D-054).
 *
 * The order is the order the refusals should reach a person in: is the feature
 * open, may you do this at all, is this event yours, is it live *now*, is your
 * reading usable, and only then how far away you are.
 *
 * Returns an outcome rather than a bare boolean, because this endpoint has
 * five distinct ways of saying no and collapsing them into "not here" would
 * misdescribe four of them.
 */
create or replace function public.record_event_presence(
  p_user            uuid,
  p_event           uuid,
  p_latitude        double precision,
  p_longitude       double precision,
  p_venue_latitude  double precision,
  p_venue_longitude double precision,
  p_accuracy_meters double precision default null,
  p_provider_status text default null
)
returns table (outcome text, within_range boolean, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now     timestamptz := now();
  v_window  record;
  v_problem text;
  v_within  boolean;
  v_expires timestamptz;
begin
  if p_user is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;
  if not app.flag('EVENTS_FEATURE_ENABLED') then
    raise exception 'Events are not open yet.' using errcode = 'P0002';
  end if;
  if not app.event_capability(p_user, 'can_join_event_here_now') then
    raise exception 'That is not available on your account.' using errcode = 'PP001';
  end if;

  if not exists (
    select 1 from public.event_memberships m
     where m.user_id = p_user and m.event_id = p_event and m.withdrawn_at is null
  ) then
    -- Being at an event you never said you were going to is fine; the room is
    -- still a room you join. Joining first is one tap, and it keeps the
    -- membership the single source of "who is in this event".
    raise exception 'Join this event first.' using errcode = 'P0002';
  end if;

  -- §8.3: a cancelled event takes no new verifications.
  if lower(coalesce(p_provider_status, '')) in ('cancelled', 'canceled') then
    return query select 'EVENT_CANCELLED', false, null::timestamptz;
    return;
  end if;

  -- §8.2: a date-only event has no window, and we do not invent one.
  select * into v_window from app.event_live_window(p_event);
  if v_window.opens_at is null then
    return query select 'EVENT_TIME_UNCONFIRMED', false, null::timestamptz;
    return;
  end if;
  if v_now < v_window.opens_at then
    return query select 'EVENT_NOT_STARTED', false, null::timestamptz;
    return;
  end if;
  if v_now > v_window.closes_at then
    return query select 'EVENT_FINISHED', false, null::timestamptz;
    return;
  end if;

  -- The shared reading rule (D-055a). The event room does not get its own.
  v_problem := app.reading_problem(p_latitude, p_longitude, p_accuracy_meters);
  if v_problem = 'LOCATION_UNUSABLE' then
    raise exception 'That location reading is not usable.' using errcode = '23514';
  end if;

  perform app.rate_limit(p_user, 'event_presence_check', 30, interval '1 hour');

  if v_problem is not null then
    perform app.note('event_here_now', 'inaccurate', p_user);
    return query select v_problem, false, null::timestamptz;
    return;
  end if;

  -- §9: absent provider coordinates fail safely and visibly. Guessing, or
  -- quietly using the city centre, would turn "I am at the concert" into "I am
  -- somewhere in this city", which is a different and much weaker claim.
  if p_venue_latitude is null or p_venue_longitude is null
     or p_venue_latitude < -90 or p_venue_latitude > 90
     or p_venue_longitude < -180 or p_venue_longitude > 180 then
    perform app.note('event_here_now', 'venue_location_missing', p_user);
    return query select 'EVENT_LOCATION_UNAVAILABLE', false, null::timestamptz;
    return;
  end if;

  v_within := extensions.st_dwithin(
    extensions.st_setsrid(extensions.st_makepoint(p_venue_longitude, p_venue_latitude), 4326)::extensions.geography,
    extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography,
    app.event_presence_radius_meters()
  );

  -- §8.2: the answer lapses at the earlier of its own TTL and the end of the
  -- window. An event that finishes in ten minutes does not leave somebody
  -- "at the event" for another three hours.
  v_expires := least(v_now + app.event_presence_ttl(), v_window.closes_at);

  delete from public.event_presence_checks pc where pc.expires_at < v_now;

  if v_within then
    -- One live event at a time (§5). The primary key does it: arriving at a
    -- second event expires the first, and neither the hotel's presence answer
    -- nor a Çevremde check-in is touched by this statement at all.
    insert into public.event_presence_checks as pc
      (user_id, event_id, within_range, checked_at, expires_at)
    values (p_user, p_event, true, v_now, v_expires)
    on conflict (user_id) do update
       set event_id = excluded.event_id,
           within_range = excluded.within_range,
           checked_at = excluded.checked_at,
           expires_at = excluded.expires_at;

    insert into public.user_event_focus (user_id, event_id, room)
    values (p_user, p_event, 'EVENT_HERE_NOW')
    on conflict (user_id) do update
       set event_id = excluded.event_id, room = excluded.room, chosen_at = now();
  end if;

  perform app.note('event_here_now', case when v_within then 'ok' else 'too_far' end, p_user);

  return query select case when v_within then 'IN_RANGE' else 'TOO_FAR' end,
                      v_within,
                      case when v_within then v_expires end;
end;
$$;

comment on function public.record_event_presence(uuid, uuid, double precision, double precision, double precision, double precision, double precision, text) is
  'D-056 §9: the live-event check. Server-authoritative about the window, the status, the reading and the distance; stores a decision and an expiry and nothing else.';

revoke all on function public.record_event_presence(
  uuid, uuid, double precision, double precision, double precision, double precision, double precision, text)
  from public, anon, authenticated;
grant execute on function public.record_event_presence(
  uuid, uuid, double precision, double precision, double precision, double precision, double precision, text)
  to service_role;

/** Withdraws a live-event answer, the counterpart of `clear_presence_check`. */
create or replace function public.clear_event_presence()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.event_presence_checks pc where pc.user_id = app.require_user();
$$;

revoke all on function public.clear_event_presence() from public, anon;
grant execute on function public.clear_event_presence() to authenticated, service_role;

-- ----------------------------------------------------- the lease, written
/**
 * Stores one event's provider content, for as long as the caller says.
 *
 * Called only by the edge function. The TTL is an argument because §7.1's
 * durations differ by what the content is — a live-window detail is worth ten
 * minutes and a far-future one six hours — and encoding that here would put a
 * caching policy in the database.
 */
create or replace function public.put_event_content(
  p_provider_event_id text,
  p_payload           jsonb,
  p_status            text,
  p_starts_at         timestamptz,
  p_ends_at           timestamptz,
  p_timezone          text,
  p_date_tbd          boolean,
  p_latitude          double precision,
  p_longitude         double precision,
  p_ttl               interval
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event uuid;
begin
  v_event := public.upsert_event(p_provider_event_id);

  insert into app.event_content as c
    (event_id, payload, provider_status, starts_at, ends_at, venue_timezone,
     date_tbd, venue_latitude, venue_longitude, fetched_at, expires_at,
     last_status_check_at)
  values
    (v_event, p_payload, p_status, p_starts_at, p_ends_at, p_timezone,
     coalesce(p_date_tbd, false), p_latitude, p_longitude, now(), now() + p_ttl, now())
  on conflict (event_id) do update
     set payload = excluded.payload,
         provider_status = excluded.provider_status,
         starts_at = excluded.starts_at,
         ends_at = excluded.ends_at,
         venue_timezone = excluded.venue_timezone,
         date_tbd = excluded.date_tbd,
         venue_latitude = excluded.venue_latitude,
         venue_longitude = excluded.venue_longitude,
         fetched_at = now(),
         expires_at = excluded.expires_at,
         last_status_check_at = now(),
         -- A takedown outlives a refresh: content asked to go does not come
         -- back because somebody searched again.
         purge_requested_at = c.purge_requested_at;

  return v_event;
end;
$$;

revoke all on function public.put_event_content(
  text, jsonb, text, timestamptz, timestamptz, text, boolean, double precision, double precision, interval)
  from public, anon, authenticated;
grant execute on function public.put_event_content(
  text, jsonb, text, timestamptz, timestamptz, text, boolean, double precision, double precision, interval)
  to service_role;

/**
 * The lease, read back for a screen.
 *
 * Returns nothing for content that has expired or been asked to go — §10.1's
 * "expired rows are not served as fresh". A row that answers nothing is what
 * makes the UI say "Geçmiş etkinlik" instead of drawing a name it no longer
 * has the right to.
 */
create or replace function public.event_content(p_event_ids uuid[])
returns table (
  event_id          uuid,
  provider_event_id text,
  payload           jsonb,
  provider_status   text,
  starts_at         timestamptz,
  ends_at           timestamptz,
  date_tbd          boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.event_id, e.provider_event_id, c.payload, c.provider_status,
         c.starts_at, c.ends_at, c.date_tbd
    from app.event_content c
    join public.events e on e.id = c.event_id
   where c.event_id = any (coalesce(p_event_ids, '{}'::uuid[]))
     and c.expires_at > now()
     and c.purge_requested_at is null;
$$;

revoke all on function public.event_content(uuid[]) from public, anon;
grant execute on function public.event_content(uuid[]) to authenticated, service_role;

notify pgrst, 'reload schema';
