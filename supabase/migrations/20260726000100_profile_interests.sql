-- Vocation Match — interests on a profile.
--
-- `interests` has existed in the mobile domain model since the first milestone
-- and has always been `[]`, because no column ever backed it. The onboarding
-- flow asks for it, and a step that collects something and throws it away is
-- worse than no step — so this is the column.
--
-- Additive only: nothing that already exists changes shape. The one thing that
-- does change is `discovery_feed`, which now returns the field, because an
-- interest nobody else can see is the same as no interest at all.

alter table public.profiles
  add column interests text[] not null default '{}';

comment on column public.profiles.interests is
  'A short, self-chosen list. Deliberately not a taxonomy and deliberately not '
  'searchable: it is something to read on a card, not a filter to be targeted with.';

-- Five, because the point is a handful of things worth reading rather than a
-- list nobody finishes. Bounded per element too — the column is free text and
-- an unbounded array of unbounded strings is a place to put a payload.
alter table public.profiles
  add constraint profiles_interests_count
  check (array_length(interests, 1) is null or array_length(interests, 1) <= 5);

-- Bounded per element too: the column is free text, and an unbounded array of
-- unbounded strings is a place to put a payload. A check constraint cannot
-- contain a subquery, so the per-element rule lives in an immutable function
-- and the constraint calls it.
create function app.interests_are_sane(p_interests text[])
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select p_interests is null
      or not exists (
           select 1
             from unnest(p_interests) as i
            where i is null
               or char_length(btrim(i)) < 1
               or char_length(i) > 24
         );
$$;

comment on function app.interests_are_sane(text[]) is
  'Every interest is between 1 and 24 characters once trimmed. Immutable so a '
  'check constraint can call it.';

alter table public.profiles
  add constraint profiles_interests_shape
  check (app.interests_are_sane(interests));

-- Adding a column re-opens the grant surface. This has bitten the project twice
-- — `suspended_at`, and then the swipe counter — so the writable column list is
-- restated in full rather than extended.
revoke insert, update on table public.profiles from anon, authenticated;
grant insert (id, display_name, bio, birthdate, interests) on table public.profiles to authenticated;
grant update (display_name, bio, birthdate, interests)     on table public.profiles to authenticated;

-- ------------------------------------------------------- the card carries it
drop function if exists public.discovery_feed(text, integer);

create function public.discovery_feed(p_room text, p_limit integer default 20)
returns table (
  user_id      uuid,
  display_name text,
  age          integer,
  bio          text,
  photo_path   text,
  interests    text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := app.require_user();
  v_hotel uuid;
begin
  if p_room not in ('UPCOMING', 'HERE_NOW') then
    raise exception 'Unknown room.' using errcode = '23514';
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
           p.interests
      from public.user_active_hotel other
      join public.profiles p on p.id = other.user_id
     where other.hotel_id = v_hotel
       and other.user_id <> v_user
       and p.suspended_at is null
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
