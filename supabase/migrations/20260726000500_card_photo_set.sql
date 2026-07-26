-- Vocation Match — the card carries the whole photo set.
--
-- Owner decision, 2026-07-26, amending D-026: one photo on a card is not
-- believable, so a card now carries every photo its owner uploaded, in the
-- owner's order. What this deliberately reveals to the room is the *count*
-- and the *paths* — which D-026 previously kept owner-only. The storage read
-- policy needs no change: `app.may_view_photo` has always authorised a viewer
-- per OWNER, not per path, so anyone who could see the first photo could
-- already have read the rest had they known the names. The unguessable name
-- was the only thing between an eligible viewer and slots 2–9, and sharing
-- names with exactly the people the policy already admits is the policy
-- working, not a hole in it.

drop function if exists public.discovery_feed(text, integer);

create function public.discovery_feed(p_room text, p_limit integer default 20)
returns table (
  user_id      uuid,
  display_name text,
  age          integer,
  bio          text,
  photo_path   text,
  photo_paths  text[],
  interests    text[],
  gender       text,
  orientations text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := app.require_user();
  v_hotel   uuid;
  v_show_me text;
  v_gender  text;
  v_done    timestamptz;
begin
  if p_room not in ('UPCOMING', 'HERE_NOW') then
    raise exception 'Unknown room.' using errcode = '23514';
  end if;

  select p.show_me, p.gender_identity, p.onboarding_completed_at
    into v_show_me, v_gender, v_done
    from public.profiles p where p.id = v_user;

  if v_done is null then
    raise exception 'Finish your profile first.' using errcode = 'P0002';
  end if;

  select uah.hotel_id into v_hotel
    from public.user_active_hotel uah
   where uah.user_id = v_user;

  if v_hotel is null then
    raise exception 'Choose a hotel first.' using errcode = 'P0002';
  end if;

  if not app.room_eligible(v_user, v_hotel, p_room) then
    raise exception 'You do not have access to this room yet.' using errcode = '42501';
  end if;

  perform app.rate_limit(v_user, 'discovery_feed', 300, interval '1 hour');

  return query
    select p.id,
           p.display_name,
           app.age_years(p.birthdate),
           p.bio,
           p.photo_path,
           -- The set, in the owner's order. Coalesced for the impossible case
           -- of a primary with no set row, so the card never loses a photo it
           -- would have had before this change.
           coalesce(
             (select array_agg(pp.path order by pp.slot)
                from public.profile_photos pp
               where pp.user_id = p.id),
             case when p.photo_path is not null then array[p.photo_path]
                  else '{}'::text[] end
           ),
           p.interests,
           case when p.show_gender      then p.gender_identity else null end,
           case when p.show_orientation then p.orientations    else '{}'::text[] end
      from public.user_active_hotel other
      join public.profiles p on p.id = other.user_id
     where other.hotel_id = v_hotel
       and other.user_id <> v_user
       and p.suspended_at is null
       and p.onboarding_completed_at is not null
       and app.show_me_matches(v_show_me, p.gender_identity)
       and app.show_me_matches(p.show_me, v_gender)
       and app.room_eligible(other.user_id, v_hotel, p_room)
       and not exists (
         select 1 from public.swipes s
          where s.actor_id = v_user and s.target_id = other.user_id)
       and not app.blocked_between(v_user, other.user_id)
     order by p.created_at, p.id
     limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

revoke all on function public.discovery_feed(text, integer) from public, anon;
grant execute on function public.discovery_feed(text, integer) to authenticated, service_role;
