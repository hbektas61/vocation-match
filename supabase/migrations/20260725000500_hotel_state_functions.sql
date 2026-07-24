-- Vocation Match — N-004 and N-005 (behaviour)
-- Every write to the hotel-state tables goes through one of these functions.
-- They are SECURITY DEFINER with a pinned search_path, they always derive the
-- acting user from the JWT (never from an argument), and they take a row lock
-- so two concurrent calls cannot leave a user with two active hotels.

create or replace function app.presence_radius_meters()
returns integer language sql immutable set search_path = '' as $$ select 500; $$;

create or replace function app.presence_freshness()
returns interval language sql immutable set search_path = '' as $$ select interval '30 minutes'; $$;

comment on function app.presence_radius_meters() is
  'Here Now radius (owner decision D-002). One definition, used by the check and by eligibility.';

grant execute on function app.presence_radius_meters() to authenticated, service_role;
grant execute on function app.presence_freshness() to authenticated, service_role;

-- Raises unless the caller is signed in and has an adult profile.
create or replace function app.require_user()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.current_user_id();
begin
  if v_user is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_user) then
    raise exception 'Finish your profile first.' using errcode = 'P0002';
  end if;
  return v_user;
end;
$$;

revoke all on function app.require_user() from public, anon;
grant execute on function app.require_user() to authenticated, service_role;

-- ------------------------------------------------------------ N-004 switch
create or replace function public.set_active_hotel(p_hotel_id uuid)
returns table (
  hotel_id            uuid,
  activated_at        timestamptz,
  previous_hotel_id   uuid,
  presence_cleared    boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := app.require_user();
  v_previous uuid;
  v_cleared  boolean := false;
  v_now      timestamptz := now();
begin
  if not exists (select 1 from public.hotels h where h.id = p_hotel_id and h.is_active) then
    raise exception 'That hotel is not available.' using errcode = 'P0002';
  end if;

  -- Serialise concurrent switches for this user. The row lock plus the
  -- primary key on user_id is what makes "exactly one active hotel" true
  -- even when two devices call this at the same moment.
  select uah.hotel_id into v_previous
    from public.user_active_hotel uah
   where uah.user_id = v_user
     for update;

  if v_previous = p_hotel_id then
    -- Idempotent: re-activating the current hotel changes nothing.
    return query
      select uah.hotel_id, uah.activated_at, v_previous, false
        from public.user_active_hotel uah
       where uah.user_id = v_user;
    return;
  end if;

  if v_previous is not null then
    -- Discovery in the previous hotel closes immediately (D-004).
    update public.hotel_activation_events e
       set deactivated_at = v_now
     where e.user_id = v_user
       and e.deactivated_at is null;

    delete from public.presence_checks pc where pc.user_id = v_user;
    v_cleared := true;
  end if;

  insert into public.user_active_hotel as uah (user_id, hotel_id, activated_at)
  values (v_user, p_hotel_id, v_now)
  on conflict (user_id) do update
     set hotel_id = excluded.hotel_id,
         activated_at = excluded.activated_at;

  insert into public.hotel_activation_events (user_id, hotel_id, activated_at)
  values (v_user, p_hotel_id, v_now);

  return query select p_hotel_id, v_now, v_previous, v_cleared;
end;
$$;

revoke all on function public.set_active_hotel(uuid) from public, anon;
grant execute on function public.set_active_hotel(uuid) to authenticated, service_role;

-- ------------------------------------------------------- self-declared stay
-- No hotel argument on purpose: a user may only declare a stay at the hotel
-- they currently have active, so there is no way to seed declarations across
-- the whole catalog.
create or replace function public.declare_upcoming_stay(p_start_date date, p_end_date date)
returns table (hotel_id uuid, start_date date, end_date date)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := app.require_user();
  v_hotel uuid;
begin
  select uah.hotel_id into v_hotel
    from public.user_active_hotel uah
   where uah.user_id = v_user;

  if v_hotel is null then
    raise exception 'Choose a hotel first.' using errcode = 'P0002';
  end if;
  if p_start_date is null or p_end_date is null then
    raise exception 'Enter both dates of your stay.' using errcode = '23514';
  end if;
  if p_end_date <= p_start_date then
    raise exception 'The check-out date must be after the check-in date.' using errcode = '23514';
  end if;
  if p_end_date < current_date then
    raise exception 'That stay has already ended.' using errcode = '23514';
  end if;
  if p_start_date > current_date + interval '2 years' then
    raise exception 'Declare a stay within the next two years.' using errcode = '23514';
  end if;

  insert into public.upcoming_stays as us (user_id, hotel_id, start_date, end_date, declared_at)
  values (v_user, v_hotel, p_start_date, p_end_date, now())
  -- Named constraint rather than a column list: `hotel_id` is also an OUT
  -- parameter here, and a bare column list would be ambiguous.
  on conflict on constraint upcoming_stays_pkey do update
     set start_date = excluded.start_date,
         end_date = excluded.end_date,
         declared_at = excluded.declared_at;

  return query select v_hotel, p_start_date, p_end_date;
end;
$$;

revoke all on function public.declare_upcoming_stay(date, date) from public, anon;
grant execute on function public.declare_upcoming_stay(date, date) to authenticated, service_role;

-- --------------------------------------------------------- N-005 proximity
-- The coordinates are arguments and nothing more: the distance is computed
-- here, collapsed to a boolean, and the reading is discarded. The return value
-- carries no meters and no coordinates, so no caller can turn this into a
-- distance oracle (D-005).
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

  select extensions.st_dwithin(
           h.location,
           extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography,
           app.presence_radius_meters()
         )
    into v_within
    from public.hotels h
   where h.id = v_hotel;

  v_expires := v_now + app.presence_freshness();

  -- Opportunistic cleanup keeps the table free of answers nobody can use.
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
