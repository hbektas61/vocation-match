-- Çevremde: picking a place from the around-you list is not an "advanced find".
--
-- D-053 metered the *typed* search — somebody names a place we could not find,
-- Google is asked, and that costs money, so a free account gets three a month.
-- Then the owner made the around-you list Google-only (2026-08-03), and every
-- ordinary check-in started spending one of those three. On the fourth tap of
-- the month `checkin_here` raised PP002 and the screen simply did nothing: the
-- feature reads as broken, because for a free account it is.
--
-- So a selection now records where it came from. A `nearby` selection is
-- ordinary check-in machinery and costs nothing; a `search` selection is the
-- metered thing it always was. The ceiling that actually protects the bill —
-- the per-day cap on upstream Google requests — is untouched and still sits in
-- front of both.

alter table app.place_selections
  add column source text not null default 'search'
    constraint place_selections_source check (source in ('search', 'nearby'));

comment on column app.place_selections.source is
  'Which list minted this token: the metered typed search, or the free around-you list (2026-08-05).';

-- The old three-argument form is dropped rather than left beside the new one:
-- two resolvable signatures make PostgREST refuse to choose (the D-052 lesson).
drop function if exists public.record_place_selections(uuid, uuid, text[]);

create or replace function public.record_place_selections(
  p_user      uuid,
  p_session   uuid,
  p_place_ids text[],
  p_source    text default 'search'
)
returns table (token uuid, google_place_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source text := case when p_source = 'nearby' then 'nearby' else 'search' end;
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
    insert into app.place_selections as sel (user_id, session_id, google_place_id, expires_at, source)
    select p_user, p_session, place_id, now() + app.selection_freshness(), v_source
      from unnest(coalesce(p_place_ids, '{}'::text[])) as place_id
     where char_length(place_id) between 4 and 200
    returning sel.token, sel.google_place_id;
end;
$$;

revoke all on function public.record_place_selections(uuid, uuid, text[], text) from public, anon, authenticated;
grant execute on function public.record_place_selections(uuid, uuid, text[], text) to service_role;

-- ------------------------------------------------------------ checking in
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
  v_source  text;
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
    returning s.google_place_id, s.source into v_label, v_source;

    if v_label is null then
      raise exception 'That place selection is not usable.' using errcode = 'P0003';
    end if;

    -- Only the typed search is metered (2026-08-05). A pick from the
    -- around-you list is how the feature is used; charging it three times a
    -- month made Çevremde stop working for a free account.
    if v_source = 'search' then
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
  'D-048/D-053: checks in to the caller''s own cell. A Google label is accepted only as a single-use selection token the backend issued; only a typed-search token spends the monthly find allowance (2026-08-05).';

revoke all on function public.checkin_here(double precision, double precision, uuid) from public, anon;
grant execute on function public.checkin_here(double precision, double precision, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
