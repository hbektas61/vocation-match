-- D-053: two counters, because they are two different jobs.
--
-- The entitlement counts *finds* — three a month free, ten on Premium — and is
-- spent only when a Google-labelled check-in completes. That is the fair half:
-- a search that found nothing costs the user nothing.
--
-- The fair half does not bound spend, though. Somebody with three rights could
-- search fifty times and select nothing, and we would pay for fifty searches.
-- So attempts are limited separately, per user, per hour, through the same
-- `app.rate_limit` every other endpoint uses. The monthly service ceiling from
-- D-052 sits above both, and when any of the three is reached the catalogue,
-- the written search and the here-anchor all keep working.

create table app.google_finds (
  user_id uuid    not null references public.profiles (id) on delete cascade,
  -- The month this row governs, as its first day.
  period  date    not null,
  used    integer not null default 0 constraint google_finds_used check (used >= 0),

  constraint google_finds_pkey primary key (user_id, period)
);

comment on table app.google_finds is
  'D-053: completed Google-labelled check-ins per user per month. Spent on a find, never on a search.';

alter table app.google_finds enable row level security;
revoke all on table app.google_finds from anon, authenticated;

/** Three a month, ten on Premium (D-053). Owner-set numbers, in one place. */
create or replace function app.google_find_allowance(p_user uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select case when app.is_premium(p_user) then 10 else 3 end;
$$;

/**
 * How many advanced finds are left this month, for the screen that has to
 * explain itself before somebody spends one.
 */
create or replace function public.google_finds_remaining()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    app.google_find_allowance(app.require_user())
      - coalesce(
          (select gf.used
             from app.google_finds gf
            where gf.user_id = app.require_user()
              and gf.period = date_trunc('month', now())::date),
          0
        ),
    0
  );
$$;

revoke all on function public.google_finds_remaining() from public, anon;
grant execute on function public.google_finds_remaining() to authenticated, service_role;

/**
 * The attempt limiter, for the backend to call before it spends money.
 *
 * Takes the user id explicitly because the caller is the edge function acting
 * as service_role: it has read the id out of the caller's token, but
 * `app.require_user()` would not see it. service_role only, for that reason.
 */
create or replace function public.claim_google_search(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null or not exists (select 1 from public.profiles p where p.id = p_user) then
    return false;
  end if;
  -- Raises when the window is full; the caller turns that into "try later"
  -- rather than a paid request.
  perform app.rate_limit(p_user, 'google_search', 10, interval '1 hour');
  return true;
exception
  when others then
    return false;
end;
$$;

revoke all on function public.claim_google_search(uuid) from public, anon, authenticated;
grant execute on function public.claim_google_search(uuid) to service_role;

-- --------------------------------------------------------- spending a find
-- The entitlement is claimed inside the check-in, which is the only moment it
-- is fair to spend it: the place was found *and* chosen. A refusal raises, so
-- nothing is written and the caller can still check in without the label.
create or replace function public.checkin_here(
  p_latitude        double precision,
  p_longitude       double precision,
  p_google_place_id text default null
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
  v_label   text := nullif(btrim(coalesce(p_google_place_id, '')), '');
  v_period  date := date_trunc('month', now())::date;
  v_used    integer;
begin
  if p_latitude is null or p_longitude is null
     or p_latitude < -90 or p_latitude > 90
     or p_longitude < -180 or p_longitude > 180 then
    raise exception 'That location reading is not usable.' using errcode = '23514';
  end if;

  if v_label is not null and char_length(v_label) not between 4 and 200 then
    raise exception 'That place reference is not usable.' using errcode = '23514';
  end if;

  perform app.rate_limit(v_user, 'checkin', 30, interval '1 hour');

  -- D-053: a labelled check-in spends one of the month's finds, and the test
  -- is the UPDATE's own WHERE so two of them cannot both squeeze past the
  -- last one.
  if v_label is not null then
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
      -- Deliberately its own code: the screen says "your advanced finds are
      -- used up" and keeps offering the catalogue and the here-anchor.
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

revoke all on function public.checkin_here(double precision, double precision, text) from public, anon;
grant execute on function public.checkin_here(double precision, double precision, text) to authenticated, service_role;
