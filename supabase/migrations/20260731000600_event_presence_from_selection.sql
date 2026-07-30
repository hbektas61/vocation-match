-- E-21 — "Şu An Etkinlikteyim" no longer requires "Etkinliğe Gideceğim".
--
-- `record_event_presence` refused anybody without a membership, so the only way
-- into a live event room was to first declare you were going to it. That is the
-- same mistake the hotel room was explicitly protected from: CLAUDE.md says a
-- declaration must never be a precondition for a proximity check, because
-- proximity is the stronger claim of the two and standing somewhere is not a
-- plan. The event room had it the other way round.
--
-- What this file adds is one server-authoritative entry point that takes a
-- selection token and produces, at most, an `EVENT_HERE_NOW` answer:
--
--   * ownership, expiry and provider status are checked here, not trusted;
--   * the canonical subject `(ticketmaster, provider_event_id)` is resolved or
--     created idempotently — the same token twice yields the same event row;
--   * **no membership is created.** Going and being there stay independent, in
--     both directions;
--   * the live window, the venue coordinate, the D-055a reading rule, the 100 m
--     accuracy ceiling and the 500 m radius all apply exactly as before,
--     because they are the *same code* — the shared body moved into
--     `app.event_presence_core` rather than being copied;
--   * a refusal writes no membership, no entitlement and no success note;
--   * no raw reading, accuracy or provider coordinate is persisted by any path.
--
-- **Replay.** The token is validated but not consumed here. Every write it can
-- reach is an upsert keyed on the user, so calling it twice with one token
-- produces one event row, one presence answer and one focus row — the second
-- call simply re-derives the same result. Consuming the token instead would
-- make a retry after a dropped response fail, which is the one moment somebody
-- is most likely to retry.

-- ------------------------------------------------------------- the shared body
/**
 * Everything the live-event check does once the caller's right to ask has been
 * settled. Lifted verbatim out of `record_event_presence` so the two entry
 * points cannot drift: a rule fixed here is fixed for both.
 */
create or replace function app.event_presence_core(
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

revoke all on function app.event_presence_core(
  uuid, uuid, double precision, double precision, double precision, double precision, double precision, text)
  from public, anon, authenticated;

-- ------------------------------------------- the membership path, now delegating
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

  -- This path is "I am at an event I already joined", and it keeps its
  -- membership requirement. The selection path below is the one that does not
  -- need it; nothing about this entry point changed.
  if not exists (
    select 1 from public.event_memberships m
     where m.user_id = p_user and m.event_id = p_event and m.withdrawn_at is null
  ) then
    raise exception 'Join this event first.' using errcode = 'P0002';
  end if;

  return query select * from app.event_presence_core(
    p_user, p_event, p_latitude, p_longitude,
    p_venue_latitude, p_venue_longitude, p_accuracy_meters, p_provider_status);
end;
$$;

revoke all on function public.record_event_presence(
  uuid, uuid, double precision, double precision, double precision, double precision, double precision, text)
  from public, anon, authenticated;
grant execute on function public.record_event_presence(
  uuid, uuid, double precision, double precision, double precision, double precision, double precision, text)
  to service_role;

-- ------------------------------------------------------- reading a live token
/**
 * A selection this user owns that has not expired — whether or not it has been
 * used before.
 *
 * `take_event_selection` marks a token spent and is right for joining, where
 * the second use is a different act. A presence check is idempotent by
 * construction, so refusing a replay would only punish a retry after a dropped
 * response.
 */
create or replace function app.read_event_selection(p_user uuid, p_token uuid)
returns table (provider_event_id text, provider_status text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.provider_event_id, s.provider_status
    from app.event_selections s
   where s.token = p_token
     and s.user_id = p_user
     and s.expires_at > now();
$$;

revoke all on function app.read_event_selection(uuid, uuid) from public, anon, authenticated;

-- ------------------------------------------ the selection path (E-21's answer)
/**
 * Be at an event without having said you were going.
 *
 * Returns the same `(outcome, within_range, expires_at)` shape as the
 * membership path, plus the event it resolved, so the caller can draw the room
 * without a second round trip.
 */
create or replace function public.record_event_presence_from_selection(
  p_user            uuid,
  p_token           uuid,
  p_latitude        double precision,
  p_longitude       double precision,
  p_venue_latitude  double precision,
  p_venue_longitude double precision,
  p_accuracy_meters double precision default null
)
returns table (outcome text, within_range boolean, expires_at timestamptz, event_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_selection record;
  v_event     uuid;
  v_answer    record;
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

  select * into v_selection from app.read_event_selection(p_user, p_token);
  if v_selection.provider_event_id is null then
    -- Not theirs, or lapsed. Deliberately one answer for both: telling an
    -- attacker which of the two it was is telling them somebody else's token
    -- exists.
    raise exception 'That event selection is no longer valid.' using errcode = 'P0002';
  end if;

  -- Idempotent by the unique key on (provider, provider_event_id): the same
  -- token twice resolves to the same row, and two callers racing produce one.
  v_event := public.upsert_event(v_selection.provider_event_id);

  -- No membership is created here, in either direction. Being at an event and
  -- saying you will go to one are two separate claims.
  select * into v_answer from app.event_presence_core(
    p_user, v_event, p_latitude, p_longitude,
    p_venue_latitude, p_venue_longitude, p_accuracy_meters, v_selection.provider_status);

  -- Spent only on the way out, and only when it worked: a refused check leaves
  -- the token usable, which is what makes "try again outside" possible.
  if v_answer.within_range then
    update app.event_selections s
       set used_at = coalesce(s.used_at, now())
     where s.token = p_token and s.user_id = p_user;
  end if;

  return query select v_answer.outcome, v_answer.within_range, v_answer.expires_at, v_event;
end;
$$;

comment on function public.record_event_presence_from_selection(
  uuid, uuid, double precision, double precision, double precision, double precision, double precision) is
  'E-21: the live-event check from a selection token, with no membership required and none created. Idempotent under replay.';

revoke all on function public.record_event_presence_from_selection(
  uuid, uuid, double precision, double precision, double precision, double precision, double precision)
  from public, anon, authenticated;
grant execute on function public.record_event_presence_from_selection(
  uuid, uuid, double precision, double precision, double precision, double precision, double precision)
  to service_role;

notify pgrst, 'reload schema';
