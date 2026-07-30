-- D-053 §4/§10: a Google label must be earned, not asserted.
--
-- The first cut of this took `p_google_place_id` straight from the client, which
-- meant anybody could label their check-in with any Place ID — a stranger's
-- café, a landmark, anything. The label is shown to other people, so that is a
-- forgery surface, not a cosmetic bug.
--
-- So a selection now has provenance. The backend records what Autocomplete
-- actually returned, bound to the user who searched, short-lived and
-- single-use, and hands back an opaque token. `checkin_here` accepts the token
-- and nothing else. One UPDATE settles all four refusals at once: an unknown
-- token has no row, another user's fails the ownership test, an expired one
-- fails the clock, and a replayed one fails `used_at is null`.
--
-- Sessions are tracked beside it, because the approved controls are per
-- *session* (ten an hour, thirty a rolling day) while the cost ceiling is per
-- upstream request. The same row carries the Google session token — unique per
-- session, never reused across users — and the counters the brief asks for: a
-- three-minute inactivity expiry and at most twelve upstream requests.

create table app.search_sessions (
  session_id     uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references public.profiles (id) on delete cascade,
  /** Sent to Google so a session bills as one; never reused (D-053 §4). */
  google_token   uuid        not null default gen_random_uuid(),
  started_at     timestamptz not null default now(),
  last_at        timestamptz not null default now(),
  upstream_used  integer     not null default 0
    constraint search_sessions_upstream check (upstream_used >= 0),

  constraint search_sessions_user_idx unique (session_id, user_id)
);

comment on table app.search_sessions is
  'D-053: one advanced-search session. Carries the Google session token and the per-session upstream count.';

create index search_sessions_user_started on app.search_sessions (user_id, started_at desc);

alter table app.search_sessions enable row level security;
revoke all on table app.search_sessions from anon, authenticated;

create table app.place_selections (
  token           uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references public.profiles (id) on delete cascade,
  session_id      uuid        not null references app.search_sessions (session_id) on delete cascade,
  /** What Autocomplete returned. The name is deliberately not here (§5). */
  google_place_id text        not null
    constraint place_selections_place_id check (char_length(google_place_id) between 4 and 200),
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  used_at         timestamptz
);

comment on table app.place_selections is
  'D-053: a Place ID the backend actually saw, bound to the user who searched. Single-use, short-lived, and the only thing checkin_here will accept as a label.';

create index place_selections_user on app.place_selections (user_id, expires_at desc);

alter table app.place_selections enable row level security;
revoke all on table app.place_selections from anon, authenticated;

/** How long a prediction stays selectable. Long enough to read the list. */
create or replace function app.selection_freshness()
returns interval language sql immutable set search_path = '' as $$ select interval '10 minutes'; $$;

/** A session dies of inactivity, per the approved controls. */
create or replace function app.session_idle_timeout()
returns interval language sql immutable set search_path = '' as $$ select interval '3 minutes'; $$;

/** At most this many upstream Autocomplete requests per session. */
create or replace function app.session_upstream_cap()
returns integer language sql immutable set search_path = '' as $$ select 12; $$;

-- ------------------------------------------------------------- the session
/**
 * Opens a session, or continues one, and says whether an upstream request is
 * allowed.
 *
 * A *new* session is what the rolling limits count — ten an hour and thirty a
 * day — because that is the user-facing unit. Continuing one costs nothing
 * against those limits but is capped at twelve upstream requests, so a long
 * typing session cannot become an unbounded meter.
 *
 * Takes the user id explicitly: the caller is the edge function as
 * service_role, which has read the id from the caller's own token.
 */
create or replace function public.open_search_session(
  p_user    uuid,
  p_session uuid default null
)
returns table (allowed boolean, session_id uuid, google_token uuid, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row     app.search_sessions;
  v_new     uuid;
begin
  if p_user is null or not exists (select 1 from public.profiles p where p.id = p_user) then
    return query select false, null::uuid, null::uuid, 'unknown_user';
    return;
  end if;

  if p_session is not null then
    select * into v_row
      from app.search_sessions s
     where s.session_id = p_session
       and s.user_id = p_user
     for update;

    if found then
      if v_row.last_at < now() - app.session_idle_timeout() then
        return query select false, v_row.session_id, v_row.google_token, 'session_expired';
        return;
      end if;
      if v_row.upstream_used >= app.session_upstream_cap() then
        return query select false, v_row.session_id, v_row.google_token, 'session_request_cap';
        return;
      end if;
      update app.search_sessions s
         set upstream_used = s.upstream_used + 1,
             last_at = now()
       where s.session_id = v_row.session_id;
      return query select true, v_row.session_id, v_row.google_token, null::text;
      return;
    end if;
    -- An unknown id is treated as a request for a new session rather than an
    -- error: the client may simply have been restarted.
  end if;

  -- A new session, and therefore the thing the rolling limits count.
  begin
    perform app.rate_limit(p_user, 'google_search_hour', 10, interval '1 hour');
  exception when others then
    return query select false, null::uuid, null::uuid, 'too_many_sessions_hour';
    return;
  end;
  begin
    perform app.rate_limit(p_user, 'google_search_day', 30, interval '24 hours');
  exception when others then
    return query select false, null::uuid, null::uuid, 'too_many_sessions_day';
    return;
  end;

  insert into app.search_sessions (user_id, upstream_used)
  values (p_user, 1)
  returning search_sessions.session_id into v_new;

  return query
    select true, s.session_id, s.google_token, null::text
      from app.search_sessions s
     where s.session_id = v_new;
end;
$$;

revoke all on function public.open_search_session(uuid, uuid) from public, anon, authenticated;
grant execute on function public.open_search_session(uuid, uuid) to service_role;

-- ---------------------------------------------------------- the selections
/**
 * Records what Autocomplete returned and hands back one token per prediction.
 *
 * This is the provenance the check-in later demands. Nothing here is a name:
 * the prediction text travels to the screen in the same response and is never
 * written down (§5).
 */
create or replace function public.record_place_selections(
  p_user      uuid,
  p_session   uuid,
  p_place_ids text[]
)
returns table (token uuid, google_place_id text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null or p_session is null then
    return;
  end if;
  if not exists (
    select 1 from app.search_sessions s
     where s.session_id = p_session and s.user_id = p_user
  ) then
    return;
  end if;

  return query
    insert into app.place_selections as sel (user_id, session_id, google_place_id, expires_at)
    select p_user, p_session, place_id, now() + app.selection_freshness()
      from unnest(coalesce(p_place_ids, '{}'::text[])) as place_id
     where char_length(place_id) between 4 and 200
    returning sel.token, sel.google_place_id;
end;
$$;

revoke all on function public.record_place_selections(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.record_place_selections(uuid, uuid, text[]) to service_role;

-- ------------------------------------------------------- checking in, again
-- The label now arrives as a token. The old text form is dropped rather than
-- left beside this one: D-052 already taught us that two resolvable signatures
-- make PostgREST refuse to choose, and the casualty was the unlabelled call.
drop function if exists public.checkin_here(double precision, double precision, text);

create or replace function public.checkin_here(
  p_latitude         double precision,
  p_longitude        double precision,
  p_selection_token  uuid default null
)
returns table (within_range boolean, expires_at timestamptz, venue_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := app.require_user();
  v_cell    record;
  v_venue   uuid;
  v_now     timestamptz := now();
  v_expires timestamptz;
  v_label   text;
  v_period  date := date_trunc('month', now())::date;
  v_used    integer;
begin
  if p_latitude is null or p_longitude is null
     or p_latitude < -90 or p_latitude > 90
     or p_longitude < -180 or p_longitude > 180 then
    raise exception 'That location reading is not usable.' using errcode = '23514';
  end if;

  perform app.rate_limit(v_user, 'checkin', 30, interval '1 hour');

  if p_selection_token is not null then
    -- One statement, four refusals: unknown token, another user's, expired,
    -- already spent. The row lock makes it safe against a replay racing itself.
    update app.place_selections s
       set used_at = now()
     where s.token = p_selection_token
       and s.user_id = v_user
       and s.used_at is null
       and s.expires_at > now()
    returning s.google_place_id into v_label;

    if v_label is null then
      raise exception 'That place selection is not usable.' using errcode = 'P0003';
    end if;

    -- D-053 §2: the entitlement is spent here, in the same transaction as the
    -- check-in, so a refusal below consumes neither it nor the selection.
    insert into app.google_finds (user_id, period, used)
    values (v_user, v_period, 0)
    on conflict (user_id, period) do nothing;

    update app.google_finds gf
       set used = gf.used + 1
     where gf.user_id = v_user
       and gf.period = v_period
       and gf.used < app.google_find_allowance(v_user)
    returning gf.used into v_used;

    if v_used is null then
      raise exception 'No advanced place finds left this month.' using errcode = 'PP002';
    end if;
  end if;

  select * into v_cell from app.cell_of(p_latitude, p_longitude);

  v_venue := public.upsert_hotel_from_provider(
    p_provider          => 'cell',
    p_provider_hotel_id => v_cell.cell_key,
    p_name              => '(cell)',
    p_city              => '(cell)',
    p_country           => '(cell)',
    p_latitude          => v_cell.cell_latitude,
    p_longitude         => v_cell.cell_longitude,
    p_venue_kind        => 'cell'
  );

  v_expires := v_now + app.checkin_freshness();

  delete from public.checkins c where c.expires_at < v_now;

  insert into public.checkins as c (user_id, venue_id, google_place_id, checked_at, expires_at)
  values (v_user, v_venue, v_label, v_now, v_expires)
  on conflict (user_id) do update
     set venue_id = excluded.venue_id,
         google_place_id = excluded.google_place_id,
         checked_at = excluded.checked_at,
         expires_at = excluded.expires_at;

  return query select true, v_expires, v_venue;
end;
$$;

comment on function public.checkin_here(double precision, double precision, uuid) is
  'D-048/D-053: checks in to the caller''s own cell. A Google label is accepted only as a single-use selection token the backend itself issued.';

revoke all on function public.checkin_here(double precision, double precision, uuid) from public, anon;
grant execute on function public.checkin_here(double precision, double precision, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
