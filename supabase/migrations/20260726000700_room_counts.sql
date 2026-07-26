-- Vocation Match — how many people are in a hotel's rooms, behind a threshold.
--
-- Owner decision, 2026-07-26 (D-032). The strongest visual signal the hotel
-- card can carry is the truth: "12 people are here". It is also the easiest
-- way to deanonymise somebody at a quiet hotel — "1 person in Here Now" plus
-- a glance at the pool is identification. The rule that resolves both:
--
--   an exact count is returned only when it is at least 5; below that the
--   answer is null, and null means NOTHING is shown — not "a few", not
--   "somebody", because at one person even "somebody" is a presence leak.
--
-- Five, because it is the smallest crowd in which no one is anyone.
--
-- The owner's stated intent is for this signal to become a premium feature
-- when that phase opens; per the project's own rule, no entitlement or
-- billing exists until decisions.md advances the phase, so for the pilot the
-- count is visible to every account.

create function public.hotel_room_counts()
returns table (room text, headcount integer)
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

  perform app.rate_limit(v_user, 'room_counts', 120, interval '1 hour');

  return query
    with population as (
      select r.room as room_key,
             count(*) filter (
               where app.room_eligible(other.user_id, v_hotel, r.room)
             )::integer as n
        from public.user_active_hotel other
        join public.profiles p on p.id = other.user_id
        cross join (values ('UPCOMING'), ('HERE_NOW')) as r(room)
       where other.hotel_id = v_hotel
         and other.user_id <> v_user
         and p.suspended_at is null
         and p.onboarding_completed_at is not null
       group by r.room
    ),
    both_rooms as (
      select r.room as room_key, coalesce(pop.n, 0) as n
        from (values ('UPCOMING'), ('HERE_NOW')) as r(room)
        left join population pop on pop.room_key = r.room
    )
    select b.room_key,
           case when b.n >= 5 then b.n else null end
      from both_rooms b;
end;
$$;

comment on function public.hotel_room_counts() is
  'Eligible-person counts for the caller''s active hotel, exact only at 5 or '
  'more; null below, and null must render as nothing (D-032).';

revoke all on function public.hotel_room_counts() from public, anon;
grant execute on function public.hotel_room_counts() to authenticated, service_role;
