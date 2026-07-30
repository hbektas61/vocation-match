-- D-053 §3/§9 — measure the requests, and give a session a life story.
--
-- Four deferred items land together because they are the same object. What was
-- missing:
--
--   1. Real upstream counts per operation, with outcomes, so a scale estimate
--      can eventually rest on measurement instead of arithmetic.
--   2. Deduplication of an identical normalized query inside one session, so
--      typing the same thing twice cannot buy the same answer twice.
--   3. One active advanced-search session per user.
--   4. Sessions counted by how they *ended* — abandoned, empty, failed,
--      converted into a check-in — not merely how many started.
--
-- Nothing here records a coordinate, a query's text, or a display name. The
-- deduplication key is a hash, so the same typing is recognised without the
-- typing being stored, and the metrics are counts by outcome.

-- --------------------------------------------------------------- the metrics
create table app.provider_events (
  id         bigserial   primary key,
  /** 'google_autocomplete' | 'google_place_details' — the metered operation. */
  operation  text        not null,
  /**
   * What happened: 'ok', 'empty', 'error', 'refused_ceiling',
   * 'refused_rate', 'refused_session', 'deduplicated'. A refusal is as much a
   * measurement as a success — it is the shape of the ceiling working.
   */
  outcome    text        not null,
  /** Whose request it was, for per-user distributions. Never the query. */
  user_id    uuid        references public.profiles (id) on delete set null,
  session_id uuid,
  occurred_at timestamptz not null default now(),

  constraint provider_events_operation check (char_length(operation) between 3 and 60),
  constraint provider_events_outcome check (char_length(outcome) between 2 and 40)
);

comment on table app.provider_events is
  'D-053 §9: one row per upstream attempt or refusal. No query text, no coordinate, no display name.';

create index provider_events_month on app.provider_events (operation, outcome, occurred_at desc);

alter table app.provider_events enable row level security;
revoke all on table app.provider_events from anon, authenticated;

/** Records an attempt. Never raises: metrics must not break the request. */
create or replace function public.record_provider_event(
  p_operation text,
  p_outcome   text,
  p_user      uuid default null,
  p_session   uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into app.provider_events (operation, outcome, user_id, session_id)
  values (p_operation, p_outcome, p_user, p_session);
exception when others then
  -- A failed measurement is not a failed request.
  return;
end;
$$;

revoke all on function public.record_provider_event(text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_provider_event(text, text, uuid, uuid) to service_role;

/** This calendar month's counts, for the operational view. */
create or replace function public.provider_event_counts(p_operation text default null)
returns table (operation text, outcome text, events bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select e.operation, e.outcome, count(*)
    from app.provider_events e
   where e.occurred_at >= date_trunc('month', now())
     and (p_operation is null or e.operation = p_operation)
   group by e.operation, e.outcome
   order by e.operation, e.outcome;
$$;

revoke all on function public.provider_event_counts(text) from public, anon, authenticated;
grant execute on function public.provider_event_counts(text) to service_role;

-- ------------------------------------------------------- the session's life
alter table app.search_sessions
  add column closed_at timestamptz,
  /**
   * How it ended. 'open' while it lives; then 'abandoned' (idle out, or
   * superseded by a newer one), 'empty' (Google had nothing), 'failed'
   * (upstream error), or 'converted' (a selection from it became a check-in).
   */
  add column outcome text not null default 'open'
    constraint search_sessions_outcome
      check (outcome in ('open', 'abandoned', 'empty', 'failed', 'converted')),
  /**
   * Hashes of the normalized queries this session has already asked. Hashes
   * rather than text, so a repeat is recognisable without the typing being
   * kept (D-053 §5).
   */
  add column asked_hashes text[] not null default '{}';

comment on column app.search_sessions.asked_hashes is
  'D-053 §3: md5 of each normalized query already asked, so an identical repeat never calls Google again.';

/** Normalized the same way every time: folded, collapsed, hashed. */
create or replace function app.query_fingerprint(p_query text)
returns text
language sql
immutable
set search_path = ''
as $$
  select md5(regexp_replace(lower(btrim(coalesce(p_query, ''))), '\s+', ' ', 'g'));
$$;

/**
 * Opens a session, continues one, or refuses — and now also answers
 * "have you already asked me this?".
 *
 * `duplicate` true means the caller must reuse the predictions it already has:
 * no upstream request happened and nothing was metered. That is the point.
 */
create or replace function public.open_search_session(
  p_user    uuid,
  p_session uuid default null,
  p_query   text default null
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
begin
  if p_user is null or not exists (select 1 from public.profiles p where p.id = p_user) then
    return query select false, null::uuid, null::uuid, false, 'unknown_user';
    return;
  end if;

  if p_session is not null then
    select * into v_row
      from app.search_sessions s
     where s.session_id = p_session
       and s.user_id = p_user
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
               -- Bounded, so a long session cannot grow this without limit.
               array(select unnest(s.asked_hashes || v_hash) offset greatest(
                 array_length(s.asked_hashes || v_hash, 1) - 24, 0))
             )
       where s.session_id = v_row.session_id;
      return query select true, v_row.session_id, v_row.google_token, false, null::text;
      return;
    end if;
  end if;

  -- A new session, and therefore what the rolling limits count.
  begin
    perform app.rate_limit(p_user, 'google_search_hour', 10, interval '1 hour');
  exception when others then
    return query select false, null::uuid, null::uuid, false, 'too_many_sessions_hour';
    return;
  end;
  begin
    perform app.rate_limit(p_user, 'google_search_day', 30, interval '24 hours');
  exception when others then
    return query select false, null::uuid, null::uuid, false, 'too_many_sessions_day';
    return;
  end;

  -- D-053 §3: one active session per user. An older one is closed as abandoned
  -- rather than left to linger, which is also what keeps the measurement of
  -- "abandoned" honest.
  update app.search_sessions s
     set closed_at = now(),
         outcome = case when s.outcome = 'open' then 'abandoned' else s.outcome end
   where s.user_id = p_user
     and s.closed_at is null;

  insert into app.search_sessions (user_id, upstream_used, asked_hashes)
  values (p_user, 1, case when p_query is null then '{}'::text[] else array[v_hash] end)
  returning search_sessions.session_id into v_new;

  return query
    select true, s.session_id, s.google_token, false, null::text
      from app.search_sessions s
     where s.session_id = v_new;
end;
$$;

-- The two-argument form would stay resolvable beside this one, and D-052 taught
-- us what that does to PostgREST.
drop function if exists public.open_search_session(uuid, uuid);

revoke all on function public.open_search_session(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.open_search_session(uuid, uuid, text) to service_role;

/** Marks how a session ended, for the outcome counts. Never raises. */
create or replace function public.close_search_session(
  p_user    uuid,
  p_session uuid,
  p_outcome text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_outcome not in ('abandoned', 'empty', 'failed', 'converted') then
    return;
  end if;
  update app.search_sessions s
     set closed_at = coalesce(s.closed_at, now()),
         outcome = p_outcome
   where s.session_id = p_session
     and s.user_id = p_user;
exception when others then
  return;
end;
$$;

revoke all on function public.close_search_session(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.close_search_session(uuid, uuid, text) to service_role;

/** Session outcomes this calendar month (D-053 §9). */
create or replace function public.search_session_counts()
returns table (outcome text, sessions bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select s.outcome, count(*)
    from app.search_sessions s
   where s.started_at >= date_trunc('month', now())
   group by s.outcome
   order by s.outcome;
$$;

revoke all on function public.search_session_counts() from public, anon, authenticated;
grant execute on function public.search_session_counts() to service_role;

-- ------------------------------------------------- conversion, at the source
-- A check-in that spends a selection is the session's conversion, and the only
-- place that can know it is the check-in itself.
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
  v_session uuid;
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
    -- One statement, four refusals: unknown, another user's, expired, spent.
    update app.place_selections s
       set used_at = now()
     where s.token = p_selection_token
       and s.user_id = v_user
       and s.used_at is null
       and s.expires_at > now()
    returning s.google_place_id, s.session_id into v_label, v_session;

    if v_label is null then
      raise exception 'That place selection is not usable.' using errcode = 'P0003';
    end if;

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

    -- The session converted. Recorded in the same transaction, so a later
    -- failure un-records it along with everything else.
    update app.search_sessions s
       set closed_at = coalesce(s.closed_at, now()),
           outcome = 'converted'
     where s.session_id = v_session
       and s.user_id = v_user;
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

revoke all on function public.checkin_here(double precision, double precision, uuid) from public, anon;
grant execute on function public.checkin_here(double precision, double precision, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
