-- Vacation Match — investor-demo seeding (owner, 2026-08-04).
--
-- The owner demos the MVP to investors on staging, and a deck with nobody in
-- it demos nothing. This gives staging a pool of twelve demo profiles and one
-- flag-gated RPC the app calls as it opens a deck: whatever room the caller
-- is standing in, the pool is placed into it — same venue, overlapping
-- dates, fresh presence, same event — and half the pool has already liked
-- the caller, so a swipe right becomes a visible match and a working chat.
--
-- Boundaries, stated plainly:
--   * Everything is behind DEMO_SEED_ENABLED. The flag ships ON because this
--     database IS the investor-demo environment; the production launch
--     checklist must flip it off (recorded in .studio/decisions.md as a
--     launch gate beside D-056's).
--   * Demo accounts are shadow rows in auth.users with no phone, no password
--     and an unroutable @demo.invalid address: nothing can sign in as one.
--   * A demo account never seeds for itself, and seeding is idempotent —
--     upserts on natural keys, so opening a deck twice writes nothing new.

-- ------------------------------------------------------------ the register
create table app.demo_users (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table app.demo_users is
  'Accounts that exist only to fill investor-demo decks (2026-08-04). Nothing can sign in as one.';

insert into app.feature_flags (flag, enabled) values ('DEMO_SEED_ENABLED', true)
on conflict (flag) do update set enabled = excluded.enabled, updated_at = now();

create or replace function app.demo_seed_enabled()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select f.enabled from app.feature_flags f where f.flag = 'DEMO_SEED_ENABLED'),
    false
  );
$$;

-- ------------------------------------------------------------ the pool
create or replace function app.ensure_demo_pool()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_id  uuid;
begin
  if (select count(*) from app.demo_users) >= 12 then
    return;
  end if;

  for v_row in
    select * from (values
      ('Elif',   date '1999-04-12', 'Gün batımı, kahve ve iyi müzik.',            'WOMAN', array['Deniz', 'Kahve', 'Canlı müzik']),
      ('Zeynep', date '2001-08-03', 'Plaj voleybolu ve açık hava sinemaları.',    'WOMAN', array['Spor', 'Sinema']),
      ('Selin',  date '1997-01-25', 'Yeni şehirler, eski plak dükkânları.',       'WOMAN', array['Gezi', 'Müzik']),
      ('Derin',  date '2002-06-17', 'Dalış sertifikam var, kullanmaya geldim.',   'WOMAN', array['Dalış', 'Deniz']),
      ('Melis',  date '2000-11-09', 'Kahvaltı uzun sürsün, gerisi kolay.',        'WOMAN', array['Yemek', 'Yoga']),
      ('İrem',   date '1998-03-30', 'Fotoğraf çekerim, çektiririm.',              'WOMAN', array['Fotoğraf', 'Gezi']),
      ('Kerem',  date '1998-09-21', 'Sahilde koşu, akşam raket.',                 'MAN',   array['Koşu', 'Tenis']),
      ('Arda',   date '2000-02-14', 'Playlist konuşabiliriz.',                    'MAN',   array['Müzik', 'Festival']),
      ('Emir',   date '1996-07-07', 'Tekne turu planlayan aranıyor.',             'MAN',   array['Deniz', 'Yüzme']),
      ('Deniz',  date '1999-12-02', 'İsmim gibi: denizsiz olmuyor.',              'MAN',   array['Deniz', 'Kamp']),
      ('Baran',  date '2001-05-19', 'Kahve makinemle seyahat ederim.',            'MAN',   array['Kahve', 'Gezi']),
      ('Mert',   date '1997-10-28', 'Gitar getirdim, istek alıyorum.',            'MAN',   array['Gitar', 'Canlı müzik'])
    ) as fixture(display_name, birthdate, bio, gender_identity, interests)
  loop
    v_id := gen_random_uuid();

    -- A shadow account: no phone, no password, an unroutable address.
    insert into auth.users (
      id, instance_id, aud, role, email, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'demo-' || substr(v_id::text, 1, 8) || '@demo.invalid', now(),
      '{"provider":"demo","providers":["demo"]}'::jsonb, '{}'::jsonb, now(), now()
    );

    insert into public.profiles (
      id, display_name, bio, birthdate,
      gender_identity, show_gender, show_me,
      orientations, show_orientation,
      interests, onboarding_completed_at,
      -- Premium, so the pool is visible in Here Now — visibility there is
      -- part of eligibility itself (D-036).
      premium_until
    ) values (
      v_id, v_row.display_name, v_row.bio, v_row.birthdate,
      v_row.gender_identity, true, 'EVERYONE',
      '{}'::text[], false,
      v_row.interests, now(),
      now() + interval '10 years'
    );

    insert into app.demo_users (user_id) values (v_id);
  end loop;
end;
$$;

revoke all on function app.ensure_demo_pool() from public, anon, authenticated;
grant execute on function app.ensure_demo_pool() to service_role;

-- ------------------------------------------------------------ the placement
create or replace function public.seed_demo_room(p_room text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   uuid := app.require_user();
  v_anchor uuid;
  v_event  uuid;
  v_start  date;
  v_end    date;
  v_until  timestamptz;
  v_demo   uuid;
  v_liker  integer := 0;
begin
  if not app.demo_seed_enabled() then
    return;
  end if;
  if p_room not in ('UPCOMING', 'HERE_NOW', 'NEARBY', 'EVENT_UPCOMING', 'EVENT_HERE_NOW') then
    return;
  end if;
  -- A demo account never seeds for itself.
  if exists (select 1 from app.demo_users du where du.user_id = v_user) then
    return;
  end if;

  perform app.ensure_demo_pool();

  -- The caller's anchor, mirrored from discovery_feed exactly: seeding a
  -- room the caller cannot open would be writing rows nobody can see.
  if p_room in ('UPCOMING', 'HERE_NOW') then
    select uah.hotel_id into v_anchor
      from public.user_active_hotel uah where uah.user_id = v_user;
    if v_anchor is null then return; end if;
  elsif p_room = 'NEARBY' then
    select c.venue_id, c.expires_at into v_anchor, v_until
      from public.checkins c
     where c.user_id = v_user and c.expires_at > now();
    if v_anchor is null then return; end if;
  else
    select f.event_id into v_event
      from public.user_event_focus f
     where f.user_id = v_user and f.room = p_room;
    if v_event is null then return; end if;
  end if;

  if p_room = 'UPCOMING' then
    select us.start_date, us.end_date into v_start, v_end
      from public.upcoming_stays us
     where us.user_id = v_user and us.hotel_id = v_anchor and us.end_date >= current_date;
    if v_start is null then return; end if;
  end if;

  for v_demo in select du.user_id from app.demo_users du order by du.user_id
  loop
    v_liker := v_liker + 1;

    if p_room in ('UPCOMING', 'HERE_NOW') then
      insert into public.user_active_hotel (user_id, hotel_id, activated_at)
      values (v_demo, v_anchor, now())
      on conflict (user_id) do update
        set hotel_id = excluded.hotel_id, activated_at = excluded.activated_at;
    end if;

    if p_room = 'UPCOMING' then
      insert into public.upcoming_stays (user_id, hotel_id, start_date, end_date)
      values (v_demo, v_anchor, v_start, v_end)
      on conflict (user_id, hotel_id) do update
        set start_date = excluded.start_date, end_date = excluded.end_date,
            declared_at = now();
    elsif p_room = 'HERE_NOW' then
      insert into public.presence_checks (user_id, hotel_id, within_range, checked_at, expires_at)
      values (v_demo, v_anchor, true, now(), now() + app.presence_freshness())
      on conflict (user_id) do update
        set hotel_id = excluded.hotel_id, within_range = true,
            checked_at = excluded.checked_at, expires_at = excluded.expires_at;
    elsif p_room = 'NEARBY' then
      insert into public.checkins (user_id, venue_id, checked_at, expires_at)
      values (v_demo, v_anchor, now(), coalesce(v_until, now() + interval '3 hours'))
      on conflict (user_id) do update
        set venue_id = excluded.venue_id, checked_at = excluded.checked_at,
            expires_at = excluded.expires_at;
    elsif p_room = 'EVENT_UPCOMING' then
      insert into public.event_memberships (user_id, event_id)
      values (v_demo, v_event)
      on conflict (user_id, event_id) do update set withdrawn_at = null;
    else
      insert into public.event_memberships (user_id, event_id)
      values (v_demo, v_event)
      on conflict (user_id, event_id) do update set withdrawn_at = null;
      insert into public.event_presence_checks (user_id, event_id, within_range, checked_at, expires_at)
      values (v_demo, v_event, true, now(), now() + app.presence_freshness())
      on conflict (user_id) do update
        set event_id = excluded.event_id, within_range = true,
            checked_at = excluded.checked_at, expires_at = excluded.expires_at;
    end if;

    -- Every second pool member has already liked the caller, so a right
    -- swipe in the demo lands a match and a chat that works.
    if v_liker % 2 = 0 then
      insert into public.swipes (actor_id, target_id, hotel_id, event_id, room, decision)
      values (
        v_demo, v_user,
        case when p_room in ('EVENT_UPCOMING', 'EVENT_HERE_NOW') then null else v_anchor end,
        case when p_room in ('EVENT_UPCOMING', 'EVENT_HERE_NOW') then v_event else null end,
        p_room, 'LIKE'
      )
      on conflict (actor_id, target_id) do nothing;
    end if;
  end loop;
end;
$$;

comment on function public.seed_demo_room(text) is
  'Flag-gated investor-demo placement (2026-08-04): fills the caller''s current room with the demo pool. No-op when DEMO_SEED_ENABLED is off.';

revoke all on function public.seed_demo_room(text) from public, anon;
grant execute on function public.seed_demo_room(text) to authenticated, service_role;
