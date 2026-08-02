-- No push crosses a block, proved rather than reasoned about.
--
-- The tempting argument is that a blocked message is refused by RLS, so no
-- notification can be queued for one. That is true today and it is an
-- inference about two pieces of code free to change independently — the day
-- somebody adds a second write path for messages, the inference is silently
-- wrong and nothing goes red. So this file asserts on `notification_queue`.
--
-- Every negative here is paired with a positive taken under the same
-- conditions, because "no rows appeared" proves nothing unless rows appear
-- when they should. An earlier version of this file asserted `count(*) >= 0`,
-- which is true of every number there is: it passed every time and tested
-- nothing. The rule now is — prove the pipe carries, then prove the block
-- stops it, and name the recipient both times.
begin;
set search_path = extensions, public, tests, pg_catalog;
select no_plan();

select tests.create_member('ada@example.test',  '00000000-0000-0000-0000-0000000000a1', 'Ada');
select tests.create_member('bo@example.test',   '00000000-0000-0000-0000-0000000000b1', 'Bo');
select tests.create_member('cam@example.test',  '00000000-0000-0000-0000-0000000000c1', 'Cam');
select tests.create_member('dee@example.test',  '00000000-0000-0000-0000-0000000000d1', 'Dee');
-- A third arriver, because each arrival assertion needs somebody who has never
-- arrived before: `notify_room_entry` fires on joining a room, so reusing a
-- member who is already in one tests nothing.
select tests.create_member('eve@example.test',  '00000000-0000-0000-0000-0000000000e1', 'Eve');

create temp table h as select tests.create_hotel('Bosphorus Grand', 41.0369, 28.9850) as one;
grant select on h to anon, authenticated;

-- Push tokens first, and this is why the file starts here rather than at the
-- block. `app.queue_notification` returns early for a recipient with no
-- registered device — "no token, no push, no queue row" — so without these
-- every assertion below would compare zero to zero and pass for a reason with
-- nothing to do with blocking.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select public.register_push_token('ExponentPushToken[ada-device]', 'ios', 'en');
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select public.register_push_token('ExponentPushToken[bo-device]', 'ios', 'en');
select tests.authenticate_as('00000000-0000-0000-0000-0000000000c1');
select public.register_push_token('ExponentPushToken[cam-device]', 'ios', 'en');
select tests.authenticate_as('00000000-0000-0000-0000-0000000000d1');
select public.register_push_token('ExponentPushToken[dee-device]', 'ios', 'en');
select tests.authenticate_as('00000000-0000-0000-0000-0000000000e1');
select public.register_push_token('ExponentPushToken[eve-device]', 'ios', 'en');

reset role;

create or replace function tests.join_upcoming(p_user uuid) returns void
language plpgsql as $$
begin
  perform tests.authenticate_as(p_user);
  perform public.set_active_hotel((select id from public.hotels limit 1));
  perform public.declare_upcoming_stay(current_date + 1, current_date + 4);
end;
$$;
grant execute on function tests.join_upcoming(uuid) to anon, authenticated;

-- Bo is the recipient every arrival assertion below is about: already in the
-- room, with overlapping dates and a registered device.
select tests.join_upcoming('00000000-0000-0000-0000-0000000000b1');
select tests.join_upcoming('00000000-0000-0000-0000-0000000000a1');

-- The fixture has to genuinely put Bo in a room, or every ROOM_NEW assertion
-- is about somebody who was never going to be notified anyway.
reset role;
select ok(
  app.room_eligible('00000000-0000-0000-0000-0000000000b1',
                    (select id from public.hotels limit 1), 'UPCOMING'),
  'the intended recipient is genuinely in the room — dates overlap and the entitlement holds'
);

select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select public.swipe('00000000-0000-0000-0000-0000000000b1', 'UPCOMING', 'LIKE');
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select public.swipe('00000000-0000-0000-0000-0000000000a1', 'UPCOMING', 'LIKE');

reset role;
create temp table m as select id from public.matches limit 1;
grant select on m to anon, authenticated;

-- ==================================== a message: exactly one, then none

select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
insert into public.messages (match_id, sender_id, body)
values ((select id from m), '00000000-0000-0000-0000-0000000000a1', 'hello');

reset role;
select is(
  (select count(*)::int from public.notification_queue
    where recipient = '00000000-0000-0000-0000-0000000000b1' and kind = 'MESSAGE'),
  1,
  'MESSAGE, unblocked: exactly one push is queued for the person written to'
);

select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select public.block_user('00000000-0000-0000-0000-0000000000a1');

reset role;
create temp table msg_before as
  select count(*) as n from public.notification_queue
   where recipient = '00000000-0000-0000-0000-0000000000b1';
grant select on msg_before to anon, authenticated;

select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok(
  $$insert into public.messages (match_id, sender_id, body)
    values ((select id from m), '00000000-0000-0000-0000-0000000000a1', 'after the block')$$,
  '42501',
  null,
  'the blocked sender cannot write into the conversation'
);

reset role;
select is(
  (select count(*)::int from public.notification_queue
    where recipient = '00000000-0000-0000-0000-0000000000b1'),
  (select n::int from msg_before),
  'MESSAGE, blocked: not one further push of any kind reached the person who blocked them'
);

-- ==================================== an arrival: exactly one, then none
--
-- A different path entirely: nobody sends anything, somebody turns up at the
-- hotel and `notify_room_entry` fans out to everyone already in a room there.
-- It carries its own block check, and this is what holds it in place.

-- The six-hour damper is cleared before *every* arrival assertion. Ada already
-- arrived above, so without this "no new push" could mean "blocked" or "too
-- soon" and the assertion could not tell which — which is the whole thing
-- being measured.
reset role;
delete from public.notification_queue
 where recipient = '00000000-0000-0000-0000-0000000000b1' and kind = 'ROOM_NEW';

-- Cam is a stranger to Bo — no block either way — so Bo must hear about it.
select tests.join_upcoming('00000000-0000-0000-0000-0000000000c1');

reset role;
select is(
  (select count(*)::int from public.notification_queue
    where recipient = '00000000-0000-0000-0000-0000000000b1' and kind = 'ROOM_NEW'),
  1,
  'ROOM_NEW, unblocked: a stranger arriving queues exactly one push for Bo'
);

select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select public.block_user('00000000-0000-0000-0000-0000000000d1');

-- The six-hour damper would hide a real failure here: without clearing it,
-- "no new push" could mean "blocked" or "too soon", and the assertion could
-- not tell which. Cleared for Bo so the only variable left is the block.
reset role;
delete from public.notification_queue
 where recipient = '00000000-0000-0000-0000-0000000000b1' and kind = 'ROOM_NEW';

-- Dee arrives under conditions otherwise identical to Cam's: same hotel, same
-- overlapping dates, same device, damper equally clear. The block is the only
-- difference between this assertion and the one above.
select tests.join_upcoming('00000000-0000-0000-0000-0000000000d1');

reset role;
select is(
  (select count(*)::int from public.notification_queue
    where recipient = '00000000-0000-0000-0000-0000000000b1' and kind = 'ROOM_NEW'),
  0,
  'ROOM_NEW, blocked: the same arrival queues nothing at all'
);

-- The control for that control. Eve has never arrived, is not blocked, and the
-- damper is equally clear — so she must get through. Without this pair, the
-- assertion above would also pass if arrival pushes had stopped working
-- altogether. Eve rather than Cam because an arrival is joining a room, and
-- Cam is already in one.
reset role;
delete from public.notification_queue
 where recipient = '00000000-0000-0000-0000-0000000000b1' and kind = 'ROOM_NEW';

select tests.join_upcoming('00000000-0000-0000-0000-0000000000e1');

reset role;
select is(
  (select count(*)::int from public.notification_queue
    where recipient = '00000000-0000-0000-0000-0000000000b1' and kind = 'ROOM_NEW'),
  1,
  'and an unblocked arrival under those same cleared conditions still reaches Bo'
);

select * from finish();
rollback;
