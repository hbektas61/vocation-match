-- N-010 — the whole journey in one transaction.
--
-- The suites above each prove one rule. This one proves the rules compose:
-- two strangers go from an empty database to a conversation, using only the
-- calls the mobile client actually makes, in the order it makes them.
begin;
set search_path = extensions, public, tests, pg_catalog;
select no_plan();

-- Step 0 — the catalog exists, loaded the way a provider feed loads it.
select tests.create_hotel('Lara Shore Resort', 36.8531, 30.7995, 'Antalya');
select tests.create_hotel('Bosphorus Garden',  41.0433, 29.0031, 'Istanbul');

create temp table journey as
select (select id from public.hotels where name = 'Lara Shore Resort') as lara,
       (select id from public.hotels where name = 'Bosphorus Garden')  as bosphorus;
grant select on journey to anon, authenticated;

-- Step 1 — two people sign up and create adult profiles.
select tests.create_user('mila@example.test', '00000000-0000-0000-0000-0000000000e1');
select tests.create_user('omar@example.test', '00000000-0000-0000-0000-0000000000e2');

select tests.authenticate_as('00000000-0000-0000-0000-0000000000e1');
select lives_ok(
  $$insert into public.profiles (id, display_name, birthdate, bio)
    values ('00000000-0000-0000-0000-0000000000e1', 'Mila',
            (current_date - interval '29 years')::date, 'Here for the sea.')$$,
  'step 1: a new user creates their own profile'
);

select tests.authenticate_as('00000000-0000-0000-0000-0000000000e2');
select throws_ok(
  $$select public.set_active_hotel((select lara from journey))$$,
  'P0002',
  'Finish your profile first.',
  'step 1: nothing works before the profile exists'
);

select lives_ok(
  $$insert into public.profiles (id, display_name, birthdate)
    values ('00000000-0000-0000-0000-0000000000e2', 'Omar',
            (current_date - interval '34 years')::date)$$,
  'step 1: the second user creates a profile too'
);

-- Step 2 — both pick the same hotel.
select lives_ok(
  $$select public.set_active_hotel((select lara from journey))$$,
  'step 2: Omar activates the hotel'
);

select tests.authenticate_as('00000000-0000-0000-0000-0000000000e1');
select public.set_active_hotel((select lara from journey));

select is(
  (select count(*)::int from public.my_rooms() where eligible),
  0,
  'step 2: choosing a hotel alone opens no room'
);

-- Step 3 — Mila declares a stay, Omar walks up to the door.
select public.declare_upcoming_stay(current_date + 2, current_date + 6);
select ok(
  (select eligible from public.my_rooms() where room = 'UPCOMING'),
  'step 3: a self-declared stay opens Upcoming, with no proof of any kind'
);

select ok(
  (select within_range from public.record_presence_check(36.8549, 30.7995)),
  'step 3: and a foreground check 220 m away answers yes'
);

select tests.authenticate_as('00000000-0000-0000-0000-0000000000e2');
select public.declare_upcoming_stay(current_date + 2, current_date + 6);
select public.record_presence_check(36.8545, 30.7999);

-- Step 4 — they find each other in both rooms.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000e1');
select bag_eq(
  $$select display_name from public.discovery_feed('UPCOMING')$$,
  $$values ('Omar'::text)$$,
  'step 4: Upcoming shows the other declared guest'
);
select bag_eq(
  $$select display_name from public.discovery_feed('HERE_NOW')$$,
  $$values ('Omar'::text)$$,
  'step 4: Here Now shows the same person, reached by a different rule'
);

-- Step 5 — mutual like.
select ok(
  not (select matched from public.swipe('00000000-0000-0000-0000-0000000000e2', 'HERE_NOW', 'LIKE')),
  'step 5: Mila likes first and waits'
);

select tests.authenticate_as('00000000-0000-0000-0000-0000000000e2');
select ok(
  (select matched from public.swipe('00000000-0000-0000-0000-0000000000e1', 'HERE_NOW', 'LIKE')),
  'step 5: Omar likes back and they match'
);

-- Step 6 — they talk.
select lives_ok(
  format($$insert into public.messages (match_id, sender_id, body)
           values (%L, '00000000-0000-0000-0000-0000000000e2', 'Hi Mila')$$,
         (select match_id from public.my_matches() limit 1)),
  'step 6: the conversation opens'
);

select tests.authenticate_as('00000000-0000-0000-0000-0000000000e1');
select is(
  (select last_message_body from public.my_matches()),
  'Hi Mila',
  'step 6: and the message reaches the other inbox'
);

-- Step 7 — Mila changes hotel. Discovery in the old hotel closes at once,
-- but the conversation she already has survives (owner decision D-004).
select public.set_active_hotel((select bosphorus from journey));

select is(
  (select count(*)::int from public.my_rooms() where eligible),
  0,
  'step 7: switching hotels closes every room in the hotel she left'
);

select throws_ok(
  $$select * from public.discovery_feed('HERE_NOW')$$,
  '42501',
  'You do not have access to this room yet.',
  'step 7: and the old room is not reachable'
);

select is(
  (select count(*)::int from public.my_matches()),
  1,
  'step 7: but the match she already made is still hers'
);

select is(
  (select count(*)::int from public.messages),
  1,
  'step 7: and so is the conversation'
);

-- Step 8 — safety works from the conversation, at any time.
select lives_ok(
  $$select public.report_user('00000000-0000-0000-0000-0000000000e2', 'HARASSMENT', 'unwanted messages')$$,
  'step 8: reporting from the chat also blocks'
);

select is(
  (select count(*)::int from public.my_matches()),
  0,
  'step 8: the conversation leaves her inbox'
);

-- Reporting also unmatches, so asserting the refusal here as-is would prove
-- nothing about the block: the insert would fail on `unmatched_at` even if the
-- block check were broken. Reopen the match so the block is the only thing left
-- standing in the way.
select tests.clear_auth();
update public.matches set unmatched_at = null, unmatched_by = null;

select tests.authenticate_as('00000000-0000-0000-0000-0000000000e2');
select throws_ok(
  format($$insert into public.messages (match_id, sender_id, body)
           values (%L, '00000000-0000-0000-0000-0000000000e2', 'hello?')$$,
         (select id from public.matches limit 1)),
  '42501',
  null,
  'step 8: and he cannot send anything more, because of the block itself'
);

-- Step 9 — nothing about this journey was written down that should not be.
select tests.clear_auth();

-- Omar's answer is the only one left: Mila's was dropped the moment she
-- switched hotel, and neither of them ever had more than one.
select is(
  (select count(*)::int from public.presence_checks),
  1,
  'step 9: at most one presence answer per person, and none at all for the hotel she left'
);

select is(
  (select count(*)::int
     from information_schema.columns
    where table_schema = 'public'
      and column_name ~* '(reservation|passport|room_number|latitude|longitude)'),
  0,
  'step 9: no reservation, ID, or coordinate column was needed for any of it'
);

select * from finish(true);
rollback;
