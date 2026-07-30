-- D-055a, one ordering correction to itself.
--
-- `20260730001600` required the venue coordinate before it looked at whether
-- the reading was usable at all. That forced the caller to resolve the venue
-- from Google *first* — a paid call — only to be told the fix was too vague to
-- measure with. Worse, it meant the edge function had to make the accuracy
-- decision itself to avoid that call, which put its own refusal ahead of the
-- entitlement gate: a free member with a bad fix was told about their GPS
-- instead of about Premium.
--
-- The venue coordinate is now required only when a measurement is actually
-- going to happen, so the order a caller sees is the order it has always
-- been — signed in, has a venue, is Premium, within the rate limit — and only
-- then "is this reading good enough". The edge function skips the paid call
-- and lets this function decide, which is where the rule belongs.
--
-- Everything else about the function is unchanged.

create or replace function public.record_presence_verified(
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
  v_problem := app.reading_problem(p_latitude, p_longitude, p_accuracy_meters);
  if v_problem = 'LOCATION_UNUSABLE' then
    raise exception 'That location reading is not usable.' using errcode = '23514';
  end if;

  -- The venue coordinate is only *needed* when a measurement is going to
  -- happen. Requiring it up front would have forced the caller to resolve the
  -- venue from Google before it could learn the reading was too vague to use
  -- — which is to say, to pay for an answer it already had.
  if v_problem is null and (
       p_venue_latitude is null or p_venue_longitude is null
       or p_venue_latitude < -90 or p_venue_latitude > 90
       or p_venue_longitude < -180 or p_venue_longitude > 180) then
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
  'D-054/V-010/D-055a: the Here Now check for a venue whose coordinate we may not store. Gates in the usual order, then refuses a reading vaguer than 100 m; the venue coordinate is needed only when a measurement will happen.';

revoke all on function public.record_presence_verified(
  uuid, double precision, double precision, double precision, double precision, double precision)
  from public, anon, authenticated;
grant execute on function public.record_presence_verified(
  uuid, double precision, double precision, double precision, double precision, double precision)
  to service_role;

notify pgrst, 'reload schema';
