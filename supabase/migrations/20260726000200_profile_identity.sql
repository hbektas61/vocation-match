-- Vocation Match — gender, orientation, and who a person wants to be shown.
--
-- Three new answers, and one piece of bookkeeping that turns out to matter more
-- than any of them: `onboarding_completed_at`.
--
-- Until now "has a profile row" meant "finished onboarding". That was true when
-- the row was written in one shot at the end. It stops being true the moment
-- the profile is built across several screens — a row exists from the birthdate
-- step onward, and a person who closes the app on the gender question would
-- otherwise be a complete, discoverable profile with no gender, no photo and no
-- say in who sees them. So completion becomes a fact the server records, and
-- discovery asks for it explicitly.
--
-- Additive. Nothing that already exists changes shape, and every existing row
-- is backfilled as complete, because those accounts *did* finish the onboarding
-- that existed when they signed up.

-- ------------------------------------------------------------------ columns

alter table public.profiles
  -- Self-described. Deliberately not "sex assigned at birth", which is a
  -- different fact, is nobody's business here, and would be collected only to
  -- be shown to strangers.
  add column gender_identity text,
  add column show_gender     boolean not null default false,
  add column orientations    text[]  not null default '{}',
  add column show_orientation boolean not null default false,
  -- Who this person wants shown to them. Never leaves the owner's own row.
  add column show_me         text,
  add column onboarding_completed_at timestamptz;

comment on column public.profiles.gender_identity is
  'Self-described gender. WOMAN and MAN are the two that discovery can filter '
  'on; every other value is visible only to people who ask to see everyone.';
comment on column public.profiles.show_gender is
  'Off by default. Answering the question is required; publishing the answer is not.';
comment on column public.profiles.orientations is
  'Up to three, optional, and never used as a filter — only ever shown, and '
  'only when its own toggle is on.';
comment on column public.profiles.show_me is
  'A private preference. It shapes the owner''s own feed and is never returned '
  'to anybody else, because who someone wants to meet is not a profile field.';
comment on column public.profiles.onboarding_completed_at is
  'Set once, by the server, when every required answer is present. A profile '
  'row without it is a draft and is invisible to everyone but its owner.';

-- Free text, so bounded — the same reasoning as `interests`.
alter table public.profiles
  add constraint profiles_gender_shape
  check (gender_identity is null
         or (char_length(btrim(gender_identity)) between 1 and 32));

alter table public.profiles
  add constraint profiles_show_me_known
  check (show_me is null or show_me in ('WOMEN', 'MEN', 'EVERYONE'));

alter table public.profiles
  add constraint profiles_orientations_count
  check (array_length(orientations, 1) is null or array_length(orientations, 1) <= 3);

create function app.orientations_are_sane(p_values text[])
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select p_values is null
      or not exists (
           select 1
             from unnest(p_values) as v
            where char_length(btrim(v)) < 1
               or char_length(v) > 24
         );
$$;

comment on function app.orientations_are_sane(text[]) is
  'Every orientation is between 1 and 24 characters once trimmed. Immutable so '
  'a check constraint can call it.';

alter table public.profiles
  add constraint profiles_orientations_shape
  check (app.orientations_are_sane(orientations));

-- Everyone who already has a profile finished the onboarding that existed when
-- they made it. Forcing them back through a flow they never saw would be a
-- migration that punishes people for having signed up early.
update public.profiles
   set onboarding_completed_at = created_at
 where onboarding_completed_at is null;

-- ------------------------------------------------------------------- grants
--
-- Adding a column re-opens the write surface. This has bitten the project
-- three times now, so the writable list is restated in full rather than
-- extended. `onboarding_completed_at` is absent on purpose: it is set by the
-- server, and a client that could stamp it could publish a draft.
revoke insert, update on table public.profiles from anon, authenticated;
grant insert (id, display_name, bio, birthdate, interests,
              gender_identity, show_gender, orientations, show_orientation, show_me)
  on table public.profiles to authenticated;
grant update (display_name, bio, birthdate, interests,
              gender_identity, show_gender, orientations, show_orientation, show_me)
  on table public.profiles to authenticated;

-- --------------------------------------------------------------- completion

create function public.complete_onboarding()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_user();
  v_row  public.profiles;
begin
  select * into v_row from public.profiles where id = v_user;

  if v_row.id is null then
    raise exception 'Finish your profile first.' using errcode = 'P0002';
  end if;

  -- Idempotent: a retried call after a dropped response must not look like a
  -- failure, and must not move the timestamp.
  if v_row.onboarding_completed_at is not null then
    return v_row.onboarding_completed_at;
  end if;

  if v_row.gender_identity is null or v_row.show_me is null then
    raise exception 'Some answers are still missing.' using errcode = '23514';
  end if;

  update public.profiles
     set onboarding_completed_at = now()
   where id = v_user
  returning onboarding_completed_at into v_row.onboarding_completed_at;

  return v_row.onboarding_completed_at;
end;
$$;

comment on function public.complete_onboarding() is
  'Marks a profile finished, once every required answer is present. Idempotent, '
  'owner-scoped, and the only way the flag is ever set.';

revoke all on function public.complete_onboarding() from public, anon;
grant execute on function public.complete_onboarding() to authenticated, service_role;

-- ---------------------------------------------------------------- discovery

/**
 * Whether a viewer asking for `p_show_me` should be shown someone whose gender
 * is `p_gender`.
 *
 * WOMEN and MEN are the only two values discovery can filter on, so a person
 * whose gender is neither is reachable only by someone asking to see everyone.
 * That is a real limit and it is written down here rather than left to be
 * discovered: the alternative — quietly folding every other gender into one of
 * two buckets — would be worse, and guessing is not available.
 */
create function app.show_me_matches(p_show_me text, p_gender text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select case
           when p_show_me is null or p_show_me = 'EVERYONE' then true
           when p_show_me = 'WOMEN' then p_gender = 'WOMAN'
           when p_show_me = 'MEN'   then p_gender = 'MAN'
           else false
         end;
$$;

drop function if exists public.discovery_feed(text, integer);

create function public.discovery_feed(p_room text, p_limit integer default 20)
returns table (
  user_id      uuid,
  display_name text,
  age          integer,
  bio          text,
  photo_path   text,
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

  select p.show_me, p.gender_identity into v_show_me, v_gender
    from public.profiles p where p.id = v_user;

  perform app.rate_limit(v_user, 'discovery_feed', 300, interval '1 hour');

  return query
    select p.id,
           p.display_name,
           app.age_years(p.birthdate),
           p.bio,
           p.photo_path,
           p.interests,
           -- The answer is required; publishing it is not. A card carries
           -- either of these only when its owner turned it on.
           case when p.show_gender      then p.gender_identity else null end,
           case when p.show_orientation then p.orientations    else '{}'::text[] end
      from public.user_active_hotel other
      join public.profiles p on p.id = other.user_id
     where other.hotel_id = v_hotel
       and other.user_id <> v_user
       and p.suspended_at is null
       -- A draft profile is nobody's business yet.
       and p.onboarding_completed_at is not null
       -- Both directions, so neither person's preference is overridden by the
       -- other's. Orientation is deliberately not part of this: it is
       -- something to read, not a filter to be targeted with.
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
