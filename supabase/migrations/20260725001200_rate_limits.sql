-- Vocation Match — backlog S-002, raised by the security audit.
--
-- Nothing throttled anything: a client could hammer `report_user`,
-- `record_presence_check`, `swipe`, or message inserts as fast as it could
-- open connections. On a safety-sensitive app the reporting endpoint is the
-- worst of these — unlimited reports are a way to bury a moderation queue and
-- a way to mass-block, and the automatic flag at three distinct reporters
-- makes a coordinated pile-on cheap.
--
-- This is a per-user fixed-window counter, deliberately simple: one row per
-- (user, bucket), reset when the window rolls over. It is not a token bucket
-- and does not try to be. A gateway-level limit would be better and is not in
-- our hands; this closes the gap that is.

create table public.rate_limits (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  bucket       text not null,
  window_start timestamptz not null default now(),
  attempts     integer not null default 0,

  primary key (user_id, bucket)
);

comment on table public.rate_limits is
  'Per-user fixed-window counters. Written only by app.rate_limit(); no client role can read or write it.';

alter table public.rate_limits enable row level security;
alter table public.rate_limits force row level security;
revoke all on table public.rate_limits from anon, authenticated;
-- Deliberately no policy and no grant: this is server bookkeeping. Telling a
-- caller how close they are to a limit is itself useful to someone probing it.

-- Counts one attempt and raises when the window's allowance is spent.
-- `54000` (program_limit_exceeded) is distinct from every other code the API
-- raises, so the client can say "slow down" rather than "something went wrong".
create or replace function app.rate_limit(
  p_user   uuid,
  p_bucket text,
  p_limit  integer,
  p_window interval
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
begin
  insert into public.rate_limits as rl (user_id, bucket, window_start, attempts)
  values (p_user, p_bucket, now(), 1)
  on conflict (user_id, bucket) do update
     set window_start = case
           when rl.window_start < now() - p_window then now()
           else rl.window_start
         end,
         attempts = case
           when rl.window_start < now() - p_window then 1
           else rl.attempts + 1
         end
  returning rl.attempts into v_attempts;

  if v_attempts > p_limit then
    raise exception 'You are doing that too often. Try again later.'
      using errcode = '54000';
  end if;
end;
$$;

revoke all on function app.rate_limit(uuid, text, integer, interval) from public, anon, authenticated;
grant execute on function app.rate_limit(uuid, text, integer, interval) to service_role;

-- ------------------------------------------------------------ the endpoints
-- Limits are generous enough that no real person meets them, and low enough
-- that a script stops being free. Reporting is the tightest because it is the
-- one that costs someone else something.
create or replace function public.report_user(
  p_target_id uuid,
  p_reason    text,
  p_details   text default null,
  p_also_block boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   uuid := app.require_any_user();
  v_target uuid := p_target_id;
  v_hotel  uuid;
  v_id     uuid;
begin
  if v_target = v_user then
    raise exception 'You cannot report yourself.' using errcode = '23514';
  end if;
  if p_reason not in ('HARASSMENT', 'SPAM', 'FAKE_PROFILE', 'UNDERAGE', 'SAFETY', 'OTHER') then
    raise exception 'Choose a reason for the report.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_target) then
    raise exception 'That person no longer exists.' using errcode = 'P0002';
  end if;

  perform app.rate_limit(v_user, 'report_user', 10, interval '1 hour');

  select uah.hotel_id into v_hotel
    from public.user_active_hotel uah
   where uah.user_id = v_user;

  insert into public.reports (reporter_id, reported_id, hotel_id, reason, details)
  values (v_user, v_target, v_hotel, p_reason, nullif(btrim(coalesce(p_details, '')), ''))
  returning id into v_id;

  if p_also_block then
    perform public.block_user(v_target);
  end if;

  return v_id;
end;
$$;

revoke all on function public.report_user(uuid, text, text, boolean) from public, anon;
grant execute on function public.report_user(uuid, text, text, boolean) to authenticated, service_role;

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

  -- An answer lasts 30 minutes, so a real user needs a handful of these an
  -- hour at most. The cap also blunts using repeated calls to binary-search
  -- the hotel's own position.
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

-- Messages are written straight to the table, so the limit is a trigger.
create or replace function app.limit_message_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.rate_limit(new.sender_id, 'send_message', 60, interval '1 minute');
  return new;
end;
$$;

create trigger messages_rate_limit
  before insert on public.messages
  for each row execute function app.limit_message_rate();
