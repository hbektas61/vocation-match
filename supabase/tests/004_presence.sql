-- N-005 — the 500 m foreground check: server-side distance, boolean answer,
-- nothing retained. Owner decisions D-002 and D-005.
begin;
set search_path = extensions, public, tests, pg_catalog;
select no_plan();

select tests.create_member('ada@example.test', '00000000-0000-0000-0000-0000000000a1');
select tests.create_member('bo@example.test',  '00000000-0000-0000-0000-0000000000b1');

create temp table h as
select tests.create_hotel('Bosphorus Grand', 41.0369, 28.9850) as one;
grant select on h to anon, authenticated;

-- 0.002 degrees of latitude is roughly 220 m; 0.010 is roughly 1.1 km.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');

select throws_ok(
  $$select public.record_presence_check(41.0370, 28.9851, 10)$$,
  'P0002',
  'Choose a hotel first.',
  'a presence check without an active hotel is refused'
);

select public.set_active_hotel((select one from h));

-- ------------------------------------------------------------- inside 500 m
select ok(
  (select within_range from public.record_presence_check(41.0389, 28.9850, 10)),
  'a reading about 220 m from the hotel is inside the radius'
);

select ok(
  (select expires_at from public.presence_checks
    where user_id = '00000000-0000-0000-0000-0000000000a1') > now(),
  'the answer carries a freshness window'
);

select ok(
  (select expires_at from public.presence_checks
    where user_id = '00000000-0000-0000-0000-0000000000a1')
    <= now() + interval '31 minutes',
  'the freshness window is the 30-minute one, not an open-ended session'
);

-- ------------------------------------------------------------ outside 500 m
select ok(
  not (select within_range from public.record_presence_check(41.0469, 28.9850, 10)),
  'a reading about 1.1 km away is outside the radius'
);

select is(
  (select count(*)::int from public.presence_checks
    where user_id = '00000000-0000-0000-0000-0000000000a1'),
  1,
  'a second check replaces the first: there is one answer per user, never a trail'
);

-- ---------------------------------------------------------- unusable input
select throws_ok(
  $$select public.record_presence_check(91.0, 28.9, 10)$$,
  '23514',
  'That location reading is not usable.',
  'an impossible latitude is rejected'
);

select throws_ok(
  $$select public.record_presence_check(null, 28.9)$$,
  '23514',
  'That location reading is not usable.',
  'a missing reading is rejected rather than treated as far away'
);

-- ------------------------------------------------------ nothing is retained
select is(
  (select count(*)::int
     from information_schema.columns
    where table_schema = 'public' and table_name = 'presence_checks'),
  5,
  'presence_checks has exactly the five non-locating columns'
);

select bag_eq(
  $$select column_name::text from information_schema.columns
     where table_schema = 'public' and table_name = 'presence_checks'$$,
  $$values ('user_id'::text),('hotel_id'),('within_range'),('checked_at'),('expires_at')$$,
  'the reading itself is never stored — only the answer and when it expires'
);

-- ---------------------------------------------------------- direct writes
select throws_ok(
  format($$insert into public.presence_checks (user_id, hotel_id, within_range, expires_at)
           values ('00000000-0000-0000-0000-0000000000a1', %L, true, now() + interval '30 minutes')$$,
         (select one from h)),
  '42501',
  null,
  'a client cannot claim presence without a location check'
);

select throws_ok(
  $$update public.presence_checks set within_range = true
     where user_id = '00000000-0000-0000-0000-0000000000a1'$$,
  '42501',
  null,
  'a client cannot flip its own presence answer'
);

select lives_ok(
  $$delete from public.presence_checks where user_id = '00000000-0000-0000-0000-0000000000a1'$$,
  'a user can drop their own presence answer (in-app stop sharing)'
);

-- ----------------------------------------------------------------- privacy
select public.record_presence_check(41.0370, 28.9851, 10);
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');

select is(
  (select count(*)::int from public.presence_checks),
  0,
  'another user cannot see whether someone is at the hotel through the table'
);

-- ------------------------------------------------------------------ expiry
select tests.clear_auth();
update public.presence_checks
   set expires_at = now() - interval '1 minute'
 where user_id = '00000000-0000-0000-0000-0000000000a1';

select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select public.set_active_hotel((select one from h));
select public.record_presence_check(41.0389, 28.9850, 10);

-- Checked without RLS in the way, so this counts rows rather than visibility.
select tests.clear_auth();
select is(
  (select count(*)::int from public.presence_checks pc
    where pc.user_id = '00000000-0000-0000-0000-0000000000a1'),
  0,
  'expired answers are swept away by the next check'
);

select * from finish(true);
rollback;
