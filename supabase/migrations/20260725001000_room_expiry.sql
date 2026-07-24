-- Vocation Match — backlog R-003
-- `my_rooms()` now also says when the answer stops being true.
--
-- Here Now eligibility expires 30 minutes after the check. Without an expiry
-- in the response the client can only guess when to re-ask, so an open Rooms
-- screen keeps showing a room the server would already refuse. Returning the
-- moment it lapses lets the app schedule one refresh at exactly that instant
-- instead of polling.
--
-- Only the caller's own expiry is returned, so this reveals nothing new.

drop function if exists public.my_rooms();

create or replace function public.my_rooms()
returns table (room text, eligible boolean, reason text, valid_until timestamptz)
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
    return query
      select r.room, false, 'NO_ACTIVE_HOTEL'::text, null::timestamptz
        from (values ('UPCOMING'), ('HERE_NOW')) as r(room);
    return;
  end if;

  return query
  select 'UPCOMING'::text,
         app.room_eligible(v_user, v_hotel, 'UPCOMING'),
         case
           when app.room_eligible(v_user, v_hotel, 'UPCOMING') then 'ELIGIBLE'
           when exists (select 1 from public.upcoming_stays us
                         where us.user_id = v_user and us.hotel_id = v_hotel)
             then 'STAY_ENDED'
           else 'NO_DECLARATION'
         end::text,
         -- A stay lapses on a calendar date, not at a clock instant. A timer
         -- to the second would be false precision, so this stays null.
         null::timestamptz
  union all
  select 'HERE_NOW'::text,
         app.room_eligible(v_user, v_hotel, 'HERE_NOW'),
         case
           when app.room_eligible(v_user, v_hotel, 'HERE_NOW') then 'ELIGIBLE'
           when exists (select 1 from public.presence_checks pc
                         where pc.user_id = v_user
                           and pc.hotel_id = v_hotel
                           and pc.expires_at > now()
                           and not pc.within_range)
             then 'TOO_FAR'
           else 'NO_RECENT_CHECK'
         end::text,
         (select pc.expires_at
            from public.presence_checks pc
           where pc.user_id = v_user
             and pc.hotel_id = v_hotel
             and pc.within_range
             and pc.expires_at > now());
end;
$$;

revoke all on function public.my_rooms() from public, anon;
grant execute on function public.my_rooms() to authenticated, service_role;
