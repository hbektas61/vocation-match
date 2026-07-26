-- H-108 — pushes: who gets told, who never does, and in which language.
--
-- The queue is the contract under test; delivery is pg_net plumbing that only
-- exists deployed. What matters here: a message notifies its recipient and
-- never its sender or the message body; a room arrival notifies the eligible
-- and never the actor, the blocked, or the same person twice in a wave; no
-- token means no queue row; and no client can read the queue at all.
begin;
set search_path = extensions, public, tests, pg_catalog;
select no_plan();

select tests.create_member('ada@example.test', '00000000-0000-0000-0000-0000000000a1', 'Ada');
select tests.create_member('bo@example.test',  '00000000-0000-0000-0000-0000000000b1', 'Bo');
select tests.create_member('cam@example.test', '00000000-0000-0000-0000-0000000000c1', 'Cam');
select tests.create_member('eve@example.test', '00000000-0000-0000-0000-0000000000e1', 'Eve');

create temp table h as select tests.create_hotel('Bosphorus Grand', 41.0369, 28.9850) as one;
grant select on h to anon, authenticated;

-- Everyone settles in BEFORE any tokens exist, so the setup itself queues
-- nothing — no token, no push, no row.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select public.set_active_hotel((select one from h));
select public.declare_upcoming_stay(current_date + 1, current_date + 4);
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select public.set_active_hotel((select one from h));
select public.declare_upcoming_stay(current_date + 1, current_date + 4);
select tests.authenticate_as('00000000-0000-0000-0000-0000000000c1');
select public.set_active_hotel((select one from h));
select public.declare_upcoming_stay(current_date + 1, current_date + 4);

select tests.clear_auth();
select is(
  (select count(*)::int from public.notification_queue),
  0,
  'no tokens yet, so the setup queued nothing'
);

-- ------------------------------------------------------------------- tokens
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select lives_ok(
  $$select public.register_push_token('ExponentPushToken[bo-device-0001]', 'ios', 'en')$$,
  'a device registers its token'
);
select is(
  (select count(*)::int from public.push_tokens),
  1,
  'and sees exactly its own'
);

select tests.authenticate_as('00000000-0000-0000-0000-0000000000c1');
select public.register_push_token('ExponentPushToken[cam-device-0001]', 'android', 'tr');
select is(
  (select count(*)::int from public.push_tokens),
  1,
  'another account cannot see it — tokens are device credentials'
);

-- ----------------------------------------------------------------- messages
select tests.clear_auth();
insert into public.matches (id, user_a, user_b, hotel_id, room)
values ('99999999-9999-4999-8999-999999999901',
        least('00000000-0000-0000-0000-0000000000a1'::uuid, '00000000-0000-0000-0000-0000000000b1'::uuid),
        greatest('00000000-0000-0000-0000-0000000000a1'::uuid, '00000000-0000-0000-0000-0000000000b1'::uuid),
        (select one from h), 'UPCOMING');

select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
insert into public.messages (match_id, sender_id, body)
values ('99999999-9999-4999-8999-999999999901', '00000000-0000-0000-0000-0000000000a1',
        'Meet at the pool bar at four?');

select tests.clear_auth();
select is(
  (select count(*)::int from public.notification_queue
    where kind = 'MESSAGE' and recipient = '00000000-0000-0000-0000-0000000000b1'),
  1,
  'a message queues a push for its recipient'
);
select is(
  (select count(*)::int from public.notification_queue
    where recipient = '00000000-0000-0000-0000-0000000000a1'),
  0,
  'and never for its sender'
);
select is(
  (select q.body from public.notification_queue q
    where q.kind = 'MESSAGE' and q.recipient = '00000000-0000-0000-0000-0000000000b1'),
  'sent you a message.',
  'in the device''s language, with the sender''s name as the title'
);
select is(
  (select count(*)::int from public.notification_queue
    where body like '%pool bar%'),
  0,
  'the message body itself never enters a push — lock screens have readers'
);

-- --------------------------------------------------------------- room entry
select tests.authenticate_as('00000000-0000-0000-0000-0000000000e1');
select public.set_active_hotel((select one from h));
select public.declare_upcoming_stay(current_date + 2, current_date + 5);

select tests.clear_auth();
select is(
  (select count(*)::int from public.notification_queue
    where kind = 'ROOM_NEW' and recipient = '00000000-0000-0000-0000-0000000000b1'),
  1,
  'an arrival tells the people already in the hotel''s rooms'
);
select is(
  (select q.body from public.notification_queue q
    where q.kind = 'ROOM_NEW' and q.recipient = '00000000-0000-0000-0000-0000000000c1'),
  'Otelindeki bir odaya az önce yeni biri katıldı. Bir bak.',
  'each in their own language'
);
select is(
  (select count(*)::int from public.notification_queue
    where kind = 'ROOM_NEW' and recipient = '00000000-0000-0000-0000-0000000000e1'),
  0,
  'and never the arriving person themselves'
);
select is(
  (select count(*)::int from public.notification_queue q
    where q.kind = 'ROOM_NEW' and q.body like '%Eve%'),
  0,
  'nobody is named: who arrived is what the room itself is for'
);

-- A second arrival in the same wave stays quiet for the already-notified.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select public.register_push_token('ExponentPushToken[ada-device-0001]', 'ios', 'en');
select tests.clear_auth();
delete from public.upcoming_stays where user_id = '00000000-0000-0000-0000-0000000000e1';
select tests.authenticate_as('00000000-0000-0000-0000-0000000000e1');
select public.declare_upcoming_stay(current_date + 2, current_date + 5);

select tests.clear_auth();
select is(
  (select count(*)::int from public.notification_queue
    where kind = 'ROOM_NEW' and recipient = '00000000-0000-0000-0000-0000000000b1'),
  1,
  'one push per person per hotel per wave — an arrival day is not a buzz per guest'
);
select is(
  (select count(*)::int from public.notification_queue
    where kind = 'ROOM_NEW' and recipient = '00000000-0000-0000-0000-0000000000a1'),
  1,
  'while somebody whose token arrived between the waves is told once'
);

-- ---------------------------------------------------------------- the queue
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select throws_ok(
  $$select count(*) from public.notification_queue$$,
  '42501',
  'permission denied for table notification_queue',
  'no client reads the queue, including its own recipient'
);

select * from finish(true);
rollback;
