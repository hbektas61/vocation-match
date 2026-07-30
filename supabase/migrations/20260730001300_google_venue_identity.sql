-- D-054 — the vacation venue is a Google Place ID, and nothing else of Google's.
--
-- The trip tab stops searching our catalogue and starts asking Google, in two
-- steps: a *destination* (Alaçatı, Dubai Marina, Mykonos) and then a *venue*
-- inside that destination's own viewport (Biblos Resort, Before Sunset Beach,
-- Ilıca Plajı). What comes back is a Place ID, and the Place ID is the whole of
-- what we are allowed to keep.
--
-- Four things this migration has to arrange, without breaking anything that
-- already exists:
--
--   1. **Identity.** `hotels` already has `unique (provider, provider_hotel_id)`,
--      which is exactly the canonical key the brief asks for. A Google venue is
--      therefore an ordinary catalogue row with `provider = 'google'` — no
--      parallel table, no second notion of "venue". Two users picking the same
--      Place ID reach the same row because the unique index says so, and a
--      concurrent first pick cannot mint two, because the insert settles it in
--      one statement.
--
--   2. **Emptiness.** That row may hold no Google content: no name, no address,
--      no coordinate. `hotels.location` was `not null`, so it becomes nullable
--      *for this provider only*, guarded by a check that keeps every other
--      provider exactly as strict as it was. The name is the `(google)`
--      placeholder — the same shape as `(cell)` (D-048) — and is resolved live
--      from the Place ID by whichever screen is about to draw it.
--
--   3. **A destination is session state, not a catalogue.** The viewport that
--      scopes the venue search lives on the search session, is readable only by
--      the backend, and is deleted with the session. Sessions also gain a
--      `kind`, so a destination search and a venue search are two meters rather
--      than one fighting over the same row.
--
--   4. **`HERE_NOW` without a stored coordinate.** `record_presence_check`
--      measures against `hotels.location`, which a Google venue does not have.
--      The authority moves to the backend: the edge function resolves the
--      venue's current coordinate from Google at check time and hands it to
--      `record_presence_verified`, where the same PostGIS test and the same
--      500 m rule (D-002) run and the coordinate is thrown away. Nothing about
--      the radius, the expiry, the premium gate (D-036) or the privacy of the
--      answer changes.
--
-- Nothing is deleted and nothing is rewritten: every Overture/OSM/cell row,
-- every membership, match and chat is untouched, and an existing active hotel
-- keeps working through exactly the path it used yesterday.

-- ------------------------------------------------------------- 1. emptiness
alter table public.hotels alter column location drop not null;

-- Every provider that had to have a coordinate still has to have one. Only
-- Google is allowed the gap, because only Google's coordinate is forbidden to
-- us. `not valid` would be wrong here: the existing rows all satisfy this, and
-- validating says so.
alter table public.hotels
  add constraint hotels_location_present
  check (location is not null or provider = 'google');

comment on column public.hotels.location is
  'Server-only, never granted and never returned (D-005). Null only for provider=''google'', whose coordinate is resolved live and never stored (D-054).';

-- A Google row's name is a placeholder, so it must never be an answer to a name
-- search — the same rule a cell lives under (D-048), for the same reason.
create or replace function app.search_places(
  p_query        text,
  p_limit        integer,
  p_lodging_only boolean
)
returns table (
  id                uuid,
  name              text,
  city              text,
  country           text,
  address           text,
  photo_url         text,
  photo_attribution text,
  venue_kind        text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select replace(replace(replace(coalesce(btrim(p_query), ''), '\', '\\'), '%', '\%'), '_', '\_')
             as term,
           regexp_replace(lower(coalesce(p_query, '')), '[^[:alnum:]]+', '', 'g')
             as squashed
  ),
  toks as (
    select t.tok, t.ord
      from q, unnest(regexp_split_to_array(q.term, '\s+')) with ordinality as t(tok, ord)
     where t.tok <> ''
  ),
  minus_last as (
    select coalesce(
             (select regexp_replace(lower(string_agg(t.tok, '' order by t.ord)),
                                    '[^[:alnum:]]+', '', 'g')
                from toks t
               where t.ord < (select max(t2.ord) from toks t2)),
             '') as squashed
  ),
  need as (
    select greatest(count(*) - 1, least(count(*), 2))::int as hits from toks
  )
  select h.id, h.name, h.city, h.country, h.address, h.photo_url, h.photo_attribution, h.venue_kind
    from public.hotels h, q
   where h.is_active
     -- A cell is a place to stand in, never one to be found by name (D-048).
     and coalesce(h.venue_kind, '') <> 'cell'
     -- D-054: a Google venue's name is the placeholder `(google)`. It is found
     -- through Google or not at all; it is never a row in our own name search.
     and h.provider <> 'google'
     -- D-051: the two questions are not the same question. Choosing where to
     -- stay wants lodging; finding where you are standing wants anywhere a
     -- person can be.
     and (not p_lodging_only or h.venue_kind = 'hotel')
     and (
       q.term = ''
       or h.name ilike '%' || q.term || '%'
       or h.city ilike '%' || q.term || '%'
       or (
         q.squashed <> ''
         and regexp_replace(lower(h.name || ' ' || h.city || ' ' || coalesce(h.address, '')),
                            '[^[:alnum:]]+', '', 'g')
             like '%' || q.squashed || '%'
       )
       or (
         (select ml.squashed from minus_last ml) <> ''
         and regexp_replace(lower(h.name || ' ' || h.city || ' ' || coalesce(h.address, '')),
                            '[^[:alnum:]]+', '', 'g')
             like '%' || (select ml.squashed from minus_last ml) || '%'
       )
       or (
         select count(*)
           from toks t
          where h.name ilike '%' || t.tok || '%'
             or h.city ilike '%' || t.tok || '%'
             or coalesce(h.address, '') ilike '%' || t.tok || '%'
             or (
               regexp_replace(lower(t.tok), '[^[:alnum:]]+', '', 'g') <> ''
               and regexp_replace(lower(h.name || ' ' || h.city || ' ' || coalesce(h.address, '')),
                                  '[^[:alnum:]]+', '', 'g')
                   like '%' || regexp_replace(lower(t.tok), '[^[:alnum:]]+', '', 'g') || '%'
             )
       ) >= (select n.hits from need n)
     )
   order by
     case when h.name ilike q.term || '%' then 0 else 1 end,
     h.name,
     h.id
   limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

revoke all on function app.search_places(text, integer, boolean) from public, anon, authenticated;

-- ------------------------------------------------------------- 2. identity
/**
 * The write boundary for a Google venue.
 *
 * Deliberately *not* `upsert_hotel_from_provider`: that function's contract is
 * "a provider told us a name and a coordinate, store them", and its first act
 * is to reject a null coordinate. Google tells us an id and we are permitted
 * nothing else, so the two are different operations and are kept apart rather
 * than made to share a signature full of arguments one of them may never pass.
 *
 * `on conflict … do update` rather than `do nothing`, so the statement always
 * returns the row: two concurrent first selections of the same Place ID both
 * come back with the same id, and neither has to re-read to find out (§8.14).
 *
 * `venue_kind` is ours. It is read off the chip the user searched under, never
 * off Google's `types`, and `coalesce` means a later `Tümü` pick cannot erase
 * what an earlier `Konaklama` pick knew.
 */
create or replace function public.upsert_google_venue(
  p_google_place_id text,
  p_venue_kind      text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_google_place_id is null or char_length(btrim(p_google_place_id)) not between 4 and 200 then
    raise exception 'That place reference is not usable.' using errcode = '23514';
  end if;

  insert into public.hotels as h
    (provider, provider_hotel_id, name, city, country, location, is_active, venue_kind, cached_at)
  values
    ('google', btrim(p_google_place_id), '(google)', '(google)', '(google)',
     null, true, p_venue_kind, now())
  on conflict (provider, provider_hotel_id) do update
     set is_active  = true,
         venue_kind = coalesce(h.venue_kind, excluded.venue_kind),
         cached_at  = now()
  returning h.id into v_id;

  return v_id;
end;
$$;

comment on function public.upsert_google_venue(text, text) is
  'D-054: the internal identity of a Google-selected vacation venue. Stores the Place ID and our own kind; never a name, an address or a coordinate.';

revoke all on function public.upsert_google_venue(text, text) from public, anon, authenticated;
grant execute on function public.upsert_google_venue(text, text) to service_role;

/**
 * Choosing a vacation venue: a selection token in, an activation out.
 *
 * The token is the same provenance mechanism D-053a built — the backend
 * records what Autocomplete actually returned, bound to the user who searched,
 * single-use and short-lived — so a client cannot assert a Place ID it was
 * never shown. One UPDATE settles all four refusals: unknown token, another
 * user's, expired, already spent.
 *
 * What this does *not* do is spend a `google_finds` entitlement. That counter
 * belongs to D-053's advanced check-in find; choosing where you are going on
 * holiday is the core product flow and is not rationed (§6).
 */
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

  -- The session converted. Same transaction as the activation, so a failure
  -- below un-records it along with everything else.
  update app.search_sessions s
     set closed_at = coalesce(s.closed_at, now()),
         outcome = 'converted'
   where s.session_id = v_session
     and s.user_id = v_user;

  -- One active venue per person, the previous room closed immediately (D-003,
  -- D-004). Reused rather than reimplemented, so there is exactly one place
  -- where switching happens.
  return query select * from public.set_active_hotel(v_venue);
end;
$$;

comment on function public.activate_google_venue(uuid, text) is
  'D-054: activates the vacation venue behind a single-use selection token. Not entitlement-gated — this is the core flow, not D-053''s advanced find.';

revoke all on function public.activate_google_venue(uuid, text) from public, anon;
grant execute on function public.activate_google_venue(uuid, text) to authenticated, service_role;

/**
 * Spends a selection token on the backend's behalf.
 *
 * The destination step needs the same provenance guarantee the venue step gets
 * from `activate_google_venue` — a Place ID the backend itself issued a token
 * for — but its result is a search area rather than a room, so it cannot go
 * through the activation. One UPDATE, the same four refusals, and the Place ID
 * never travels to the client in either direction.
 */
create or replace function public.take_place_selection(p_user uuid, p_token uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_place text;
begin
  if p_user is null or p_token is null then
    return null;
  end if;

  update app.place_selections s
     set used_at = now()
   where s.token = p_token
     and s.user_id = p_user
     and s.used_at is null
     and s.expires_at > now()
  returning s.google_place_id into v_place;

  return v_place;
end;
$$;

revoke all on function public.take_place_selection(uuid, uuid) from public, anon, authenticated;
grant execute on function public.take_place_selection(uuid, uuid) to service_role;

-- -------------------------------------------------- 3. destination sessions
alter table app.search_sessions
  /**
   * Which meter this is. 'checkin' is D-053's advanced find; the two new kinds
   * are D-054's steps. Separating them means a destination search and a venue
   * search can be open at once without either closing the other, while the
   * "one open session per user *per kind*" rule still holds.
   */
  add column kind text not null default 'checkin'
    constraint search_sessions_kind check (kind in ('checkin', 'destination', 'venue')),
  /** The chosen destination, for the venue step's restriction. Session-scoped. */
  add column destination_place_id text,
  add column dest_low_latitude   double precision,
  add column dest_low_longitude  double precision,
  add column dest_high_latitude  double precision,
  add column dest_high_longitude double precision;

comment on column app.search_sessions.dest_low_latitude is
  'D-054: the selected destination''s Google viewport, held for the life of this search session only and purged with it. Never a destination catalogue.';

/**
 * Records the destination a venue session is scoped to.
 *
 * The viewport is stored server-side rather than passed by the client on each
 * request, because a client-supplied bounding box is a client-supplied search
 * area — the caller could widen it to the whole planet and defeat the "results
 * stay inside the destination" rule (§3, §10).
 */
create or replace function public.set_session_destination(
  p_user      uuid,
  p_session   uuid,
  p_place_id  text,
  p_low_lat   double precision,
  p_low_lng   double precision,
  p_high_lat  double precision,
  p_high_lng  double precision
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean := false;
begin
  if p_low_lat is null or p_low_lng is null or p_high_lat is null or p_high_lng is null
     or p_low_lat < -90 or p_high_lat > 90 or p_low_lng < -180 or p_high_lng > 180
     or p_high_lat < p_low_lat then
    return false;
  end if;

  update app.search_sessions s
     set destination_place_id = p_place_id,
         dest_low_latitude    = p_low_lat,
         dest_low_longitude   = p_low_lng,
         dest_high_latitude   = p_high_lat,
         dest_high_longitude  = p_high_lng,
         last_at              = now()
   where s.session_id = p_session
     and s.user_id = p_user
     and s.closed_at is null;

  get diagnostics v_ok = row_count;
  return v_ok;
end;
$$;

revoke all on function public.set_session_destination(uuid, uuid, text, double precision, double precision, double precision, double precision)
  from public, anon, authenticated;
grant execute on function public.set_session_destination(uuid, uuid, text, double precision, double precision, double precision, double precision)
  to service_role;

/**
 * Opens a session, continues one, or refuses — now per kind, and now purging.
 *
 * The purge is what keeps a destination's viewport from quietly becoming a
 * catalogue: a session older than a day is deleted outright, and its
 * selections go with it through the cascade. Selections expire in ten minutes
 * anyway, so nothing useful is lost.
 */
create or replace function public.open_search_session(
  p_user    uuid,
  p_session uuid default null,
  p_query   text default null,
  p_kind    text default 'checkin'
)
returns table (
  allowed      boolean,
  session_id   uuid,
  google_token uuid,
  duplicate    boolean,
  reason       text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row  app.search_sessions;
  v_new  uuid;
  v_hash text := app.query_fingerprint(p_query);
  v_kind text := coalesce(p_kind, 'checkin');
begin
  if v_kind not in ('checkin', 'destination', 'venue') then
    return query select false, null::uuid, null::uuid, false, 'unknown_kind';
    return;
  end if;
  if p_user is null or not exists (select 1 from public.profiles p where p.id = p_user) then
    return query select false, null::uuid, null::uuid, false, 'unknown_user';
    return;
  end if;

  -- Session state has a life measured in minutes; a day is generous.
  delete from app.search_sessions s where s.started_at < now() - interval '24 hours';

  if p_session is not null then
    select * into v_row
      from app.search_sessions s
     where s.session_id = p_session
       and s.user_id = p_user
       and s.kind = v_kind
     for update;

    if found then
      if v_row.closed_at is not null then
        return query select false, v_row.session_id, v_row.google_token, false, 'session_closed';
        return;
      end if;
      if v_row.last_at < now() - app.session_idle_timeout() then
        update app.search_sessions s
           set closed_at = now(), outcome = 'abandoned'
         where s.session_id = v_row.session_id;
        return query select false, v_row.session_id, v_row.google_token, false, 'session_expired';
        return;
      end if;

      -- D-053 §3: the same normalized input in the same session must not buy a
      -- second upstream request. Answered before the request cap, because a
      -- repeat is not a request.
      if p_query is not null and v_hash = any (v_row.asked_hashes) then
        update app.search_sessions s set last_at = now() where s.session_id = v_row.session_id;
        return query select true, v_row.session_id, v_row.google_token, true, null::text;
        return;
      end if;

      if v_row.upstream_used >= app.session_upstream_cap() then
        return query select false, v_row.session_id, v_row.google_token, false, 'session_request_cap';
        return;
      end if;

      update app.search_sessions s
         set upstream_used = s.upstream_used + 1,
             last_at = now(),
             asked_hashes = (
               array(select unnest(s.asked_hashes || v_hash) offset greatest(
                 array_length(s.asked_hashes || v_hash, 1) - 24, 0))
             )
       where s.session_id = v_row.session_id;
      return query select true, v_row.session_id, v_row.google_token, false, null::text;
      return;
    end if;
  end if;

  -- A new session, and therefore what the rolling limits count.
  --
  -- Two budgets, because these are two different products. D-053's advanced
  -- check-in find keeps its deliberately tight 10/hour: it is an occasional
  -- escape hatch on a free feature. Choosing where you are going on holiday is
  -- the core flow (§6), and it costs two sessions per attempt — a destination
  -- and then a venue — so ten an hour would be five attempts. It gets its own,
  -- looser pair, which still bounds one person's call on the provider.
  begin
    if v_kind = 'checkin' then
      perform app.rate_limit(p_user, 'google_search_hour', 10, interval '1 hour');
    else
      perform app.rate_limit(p_user, 'google_venue_search_hour', 40, interval '1 hour');
    end if;
  exception when others then
    return query select false, null::uuid, null::uuid, false, 'too_many_sessions_hour';
    return;
  end;
  begin
    if v_kind = 'checkin' then
      perform app.rate_limit(p_user, 'google_search_day', 30, interval '24 hours');
    else
      perform app.rate_limit(p_user, 'google_venue_search_day', 150, interval '24 hours');
    end if;
  exception when others then
    return query select false, null::uuid, null::uuid, false, 'too_many_sessions_day';
    return;
  end;

  -- One open session per user per kind. Choosing a new destination is what
  -- closes the venue session that was scoped to the old one (§8.4).
  update app.search_sessions s
     set closed_at = now(),
         outcome = case when s.outcome = 'open' then 'abandoned' else s.outcome end
   where s.user_id = p_user
     and s.closed_at is null
     and (s.kind = v_kind or (v_kind = 'destination' and s.kind = 'venue'));

  insert into app.search_sessions (user_id, kind, upstream_used, asked_hashes)
  values (p_user, v_kind, 1, case when p_query is null then '{}'::text[] else array[v_hash] end)
  returning search_sessions.session_id into v_new;

  return query
    select true, s.session_id, s.google_token, false, null::text
      from app.search_sessions s
     where s.session_id = v_new;
end;
$$;

-- The three-argument form would stay resolvable beside this one, and D-052
-- taught us what that does to PostgREST.
drop function if exists public.open_search_session(uuid, uuid, text);

revoke all on function public.open_search_session(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.open_search_session(uuid, uuid, text, text) to service_role;

/**
 * The destination a venue session is restricted to. Backend-only: the client
 * is told a destination was accepted, never the box it produced.
 */
create or replace function public.session_destination(p_user uuid, p_session uuid)
returns table (
  destination_place_id text,
  low_latitude   double precision,
  low_longitude  double precision,
  high_latitude  double precision,
  high_longitude double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.destination_place_id, s.dest_low_latitude, s.dest_low_longitude,
         s.dest_high_latitude, s.dest_high_longitude
    from app.search_sessions s
   where s.session_id = p_session
     and s.user_id = p_user
     and s.destination_place_id is not null;
$$;

revoke all on function public.session_destination(uuid, uuid) from public, anon, authenticated;
grant execute on function public.session_destination(uuid, uuid) to service_role;

-- ------------------------------------------------------- 4. HERE_NOW, verified
/**
 * The 500 m test against a coordinate the backend resolved a moment ago and is
 * about to forget.
 *
 * Everything that made `record_presence_check` safe is kept and kept in the
 * same order: the premium gate (D-036) before the location is used at all, the
 * rate limit that blunts binary-searching the venue's position, the single
 * radius definition (D-002), the 30-minute freshness, and an answer that is a
 * boolean and an expiry — never a coordinate and never a distance (D-005).
 *
 * The venue coordinate arrives as an argument because only the backend can
 * have it: it comes from Place Details, inside the edge function, over the
 * server-side key. A client-supplied coordinate is refused by construction —
 * this function is service_role only, and the edge function reads the user
 * from the caller's own JWT rather than from the body.
 */
create or replace function public.record_presence_verified(
  p_user           uuid,
  p_latitude       double precision,
  p_longitude      double precision,
  p_venue_latitude  double precision,
  p_venue_longitude double precision
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

  return query select v_within, v_expires;
end;
$$;

comment on function public.record_presence_verified(uuid, double precision, double precision, double precision, double precision) is
  'D-054: the Here Now check for a venue whose coordinate we may not store. Same radius, same expiry, same privacy as record_presence_check; the coordinate is an argument and is never written down.';

revoke all on function public.record_presence_verified(uuid, double precision, double precision, double precision, double precision)
  from public, anon, authenticated;
grant execute on function public.record_presence_verified(uuid, double precision, double precision, double precision, double precision)
  to service_role;

/**
 * The catalogue path refuses a Google venue rather than measuring against a
 * null coordinate — `st_dwithin` would answer null, and a null `within_range`
 * would be written as "not here" with no way to tell it from a real refusal.
 * A distinct code, so the client can route to the verified path instead of
 * showing the user an error about something they did not do.
 */
create or replace function public.record_presence_check(
  p_latitude  double precision,
  p_longitude double precision
)
returns table (within_range boolean, expires_at timestamptz)
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
begin
  if p_latitude is null or p_longitude is null
     or p_latitude < -90 or p_latitude > 90
     or p_longitude < -180 or p_longitude > 180 then
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
    -- D-054: this venue's coordinate is not ours to hold, so the check runs
    -- through the provider boundary instead. Raised before the rate limit, so
    -- a mis-routed client never spends the user's allowance.
    raise exception 'That place needs the verified check.' using errcode = 'P0004';
  end if;

  perform app.rate_limit(v_user, 'presence_check', 30, interval '1 hour');

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

  return query select v_within, v_expires;
end;
$$;

revoke all on function public.record_presence_check(double precision, double precision) from public, anon;
grant execute on function public.record_presence_check(double precision, double precision) to authenticated, service_role;

/**
 * Which provider is behind the caller's active venue, so the app knows whether
 * a name has to be resolved and which check-in path to take. Says nothing about
 * where the venue is, and answers only about the caller's own.
 */
create or replace function public.my_active_venue()
returns table (
  hotel_id        uuid,
  provider        text,
  google_place_id text,
  venue_kind      text,
  activated_at    timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select h.id,
         h.provider,
         case when h.provider = 'google' then h.provider_hotel_id end,
         h.venue_kind,
         uah.activated_at
    from public.user_active_hotel uah
    join public.hotels h on h.id = uah.hotel_id
   where uah.user_id = app.require_user();
$$;

/**
 * The same answer, for the backend, about a named user. The edge function has
 * read that id out of the caller's own JWT — it is never taken from the body,
 * which is what stops one user asking about another's venue.
 */
create or replace function public.active_venue_of(p_user uuid)
returns table (hotel_id uuid, provider text, google_place_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select h.id, h.provider,
         case when h.provider = 'google' then h.provider_hotel_id end
    from public.user_active_hotel uah
    join public.hotels h on h.id = uah.hotel_id
   where uah.user_id = p_user;
$$;

revoke all on function public.active_venue_of(uuid) from public, anon, authenticated;
grant execute on function public.active_venue_of(uuid) to service_role;

comment on function public.my_active_venue() is
  'D-054: the caller''s own active venue and its provider. The Place ID is returned only for a Google venue, and only to its owner, so the name can be resolved live.';

revoke all on function public.my_active_venue() from public, anon;
grant execute on function public.my_active_venue() to authenticated, service_role;

notify pgrst, 'reload schema';
