-- Vacation Match — one demo face per room (owner, 2026-08-04).
--
-- The first cut of D-064 placed the same twelve profiles into whichever room
-- the owner opened, so every deck showed the same faces — which reads as the
-- rooms leaking into each other, the exact opposite of the product's core
-- claim. The pool grows to thirty and each room owns a disjoint slice of
-- six; seeding a room also clears any demo placement that does not belong to
-- that slice, so the old everywhere-pool cannot linger.
--
-- The old pool is deleted outright (profiles cascade takes every placement,
-- swipe and photo binding with them) and rebuilt with genders alternating,
-- so every slice of six carries three women and three men whatever the
-- viewer's filter says. Photos are re-bound by rerunning
-- scripts/demo-photos.mjs.

-- ------------------------------------------------------------ rebuild pool
delete from auth.users
 where id in (select du.user_id from app.demo_users du);
delete from app.demo_users;

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
  if (select count(*) from app.demo_users) >= 30 then
    return;
  end if;

  for v_row in
    -- Alternating W/M on purpose: the slice arithmetic below hands each room
    -- six consecutive rows, which this ordering makes three women, three men.
    select * from (values
      ('Elif',    date '1999-04-12', 'Gün batımı, kahve ve iyi müzik.',          'WOMAN', array['Deniz', 'Kahve']),
      ('Kerem',   date '1998-09-21', 'Sahilde koşu, akşam raket.',               'MAN',   array['Koşu', 'Tenis']),
      ('Zeynep',  date '2001-08-03', 'Plaj voleybolu ve açık hava sinemaları.',  'WOMAN', array['Spor', 'Sinema']),
      ('Arda',    date '2000-02-14', 'Playlist konuşabiliriz.',                  'MAN',   array['Müzik', 'Festival']),
      ('Selin',   date '1997-01-25', 'Yeni şehirler, eski plak dükkânları.',     'WOMAN', array['Gezi', 'Müzik']),
      ('Emir',    date '1996-07-07', 'Tekne turu planlayan aranıyor.',           'MAN',   array['Deniz', 'Yüzme']),
      ('Derin',   date '2002-06-17', 'Dalış sertifikam var, kullanmaya geldim.', 'WOMAN', array['Dalış', 'Deniz']),
      ('Deniz',   date '1999-12-02', 'İsmim gibi: denizsiz olmuyor.',            'MAN',   array['Deniz', 'Kamp']),
      ('Melis',   date '2000-11-09', 'Kahvaltı uzun sürsün, gerisi kolay.',      'WOMAN', array['Yemek', 'Yoga']),
      ('Baran',   date '2001-05-19', 'Kahve makinemle seyahat ederim.',          'MAN',   array['Kahve', 'Gezi']),
      ('İrem',    date '1998-03-30', 'Fotoğraf çekerim, çektiririm.',            'WOMAN', array['Fotoğraf', 'Gezi']),
      ('Mert',    date '1997-10-28', 'Gitar getirdim, istek alıyorum.',          'MAN',   array['Gitar', 'Canlı müzik']),
      ('Ceren',   date '1999-02-11', 'Kitap + hamak = tatil.',                   'WOMAN', array['Kitap', 'Deniz']),
      ('Can',     date '1998-06-24', 'Kahvaltıcıyım, tatlıcıyım.',               'MAN',   array['Yemek', 'Gezi']),
      ('Naz',     date '2001-01-08', 'Sabah yüzer, akşam dans ederim.',          'WOMAN', array['Yüzme', 'Dans']),
      ('Efe',     date '1997-05-16', 'Sörf öğreniyorum, düşerken gülüyorum.',    'MAN',   array['Sörf', 'Deniz']),
      ('Yasemin', date '2000-09-27', 'Pastel gün batımları koleksiyoncusu.',     'WOMAN', array['Fotoğraf', 'Deniz']),
      ('Umut',    date '1999-08-19', 'Akşam koşusuna eşlik aranır.',             'MAN',   array['Koşu', 'Müzik']),
      ('Aslı',    date '1996-12-05', 'Bir latte, bir sahil, bir plan.',          'WOMAN', array['Kahve', 'Gezi']),
      ('Tuna',    date '2002-03-14', 'Masa tenisinde iddialıyım.',               'MAN',   array['Spor', 'Oyun']),
      ('Pelin',   date '1998-07-22', 'Yerel pazarlar ve deniz kabukları.',       'WOMAN', array['Gezi', 'Yemek']),
      ('Onur',    date '1997-04-09', 'Kamp ateşi hikâyecisiyim.',                'MAN',   array['Kamp', 'Gitar']),
      ('Buse',    date '2001-10-31', 'Havuz kenarı playlist küratörü.',          'WOMAN', array['Müzik', 'Yüzme']),
      ('Kaan',    date '1999-01-27', 'Gün doğumu dalışları benden.',             'MAN',   array['Dalış', 'Deniz']),
      ('Şevval',  date '2000-05-03', 'Açık hava yogası ve taze meyve.',          'WOMAN', array['Yoga', 'Yemek']),
      ('Berk',    date '1996-11-15', 'Yolculuk uzun, playlist hazır.',           'MAN',   array['Müzik', 'Gezi']),
      ('Damla',   date '1999-06-06', 'Sahilde film gecesi organizatörü.',        'WOMAN', array['Sinema', 'Deniz']),
      ('Alp',     date '2001-09-12', 'Beach volley takımına oyuncu arıyorum.',   'MAN',   array['Spor', 'Deniz']),
      ('Gizem',   date '1997-08-08', 'Gitmediğim koy kalmasın.',                 'WOMAN', array['Gezi', 'Yüzme']),
      ('Emre',    date '1998-04-01', 'İyi espri, iyi kahve, iyi manzara.',       'MAN',   array['Kahve', 'Mizah'])
    ) as fixture(display_name, birthdate, bio, gender_identity, interests)
  loop
    v_id := gen_random_uuid();
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
      interests, onboarding_completed_at, premium_until
    ) values (
      v_id, v_row.display_name, v_row.bio, v_row.birthdate,
      v_row.gender_identity, true, 'EVERYONE',
      '{}'::text[], false,
      v_row.interests, now(), now() + interval '10 years'
    );
    insert into app.demo_users (user_id) values (v_id);
  end loop;
end;
$$;

-- ------------------------------------------------- one slice per room
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
  v_index  integer := 0;
  v_lo     integer;
begin
  if not app.demo_seed_enabled() then return; end if;
  if p_room not in ('UPCOMING', 'HERE_NOW', 'NEARBY', 'EVENT_UPCOMING', 'EVENT_HERE_NOW') then
    return;
  end if;
  if exists (select 1 from app.demo_users du where du.user_id = v_user) then return; end if;

  perform app.ensure_demo_pool();

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

  -- Each room owns rows lo..lo+5 of the pool, in creation order: no demo
  -- face ever appears in two rooms, which is the product's own claim.
  v_lo := case p_room
    when 'UPCOMING'       then 1
    when 'HERE_NOW'       then 7
    when 'NEARBY'         then 13
    when 'EVENT_UPCOMING' then 19
    else 25
  end;

  -- The everywhere-pool the first cut left behind: any demo placement for
  -- this room that is not this room's slice goes, before the slice lands.
  if p_room = 'UPCOMING' then
    delete from public.upcoming_stays us
     where us.user_id in (
       select r.user_id from (
         select du.user_id, row_number() over (order by du.created_at, du.user_id) rn
           from app.demo_users du) r
        where r.rn not between v_lo and v_lo + 5);
  elsif p_room = 'HERE_NOW' then
    delete from public.presence_checks pc
     where pc.user_id in (
       select r.user_id from (
         select du.user_id, row_number() over (order by du.created_at, du.user_id) rn
           from app.demo_users du) r
        where r.rn not between v_lo and v_lo + 5);
  elsif p_room = 'NEARBY' then
    delete from public.checkins c
     where c.user_id in (
       select r.user_id from (
         select du.user_id, row_number() over (order by du.created_at, du.user_id) rn
           from app.demo_users du) r
        where r.rn not between v_lo and v_lo + 5);
  else
    delete from public.event_memberships m
     where m.event_id = v_event
       and m.user_id in (
       select r.user_id from (
         select du.user_id, row_number() over (order by du.created_at, du.user_id) rn
           from app.demo_users du) r
        where r.rn not between 19 and 30);
  end if;

  for v_demo in
    select r.user_id from (
      select du.user_id, row_number() over (order by du.created_at, du.user_id) rn
        from app.demo_users du) r
     where r.rn between v_lo and v_lo + 5
     order by r.rn
  loop
    v_index := v_index + 1;

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

    if v_index % 2 = 0 then
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
