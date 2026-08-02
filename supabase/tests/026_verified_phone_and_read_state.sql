-- Two things the schema gained on 2026-08-01: an identity gate that is
-- actually enforced, and read state that actually exists.
--
-- The phone gate is tested as `authenticated`, never through the test helper.
-- `tests.create_member` runs as a superuser and superusers bypass RLS
-- outright, so a test that used the helper would pass whether the policy was
-- there or not — which is the most expensive kind of green.
begin;
set search_path = extensions, public, tests, pg_catalog;
select no_plan();

select tests.create_member('ada@example.test', '00000000-0000-0000-0000-0000000000a1', 'Ada');
select tests.create_member('bo@example.test',  '00000000-0000-0000-0000-0000000000b1', 'Bo');

-- Two raw accounts with no profile yet: one that proved a phone, one that did
-- not. This is the difference the gate is about.
select tests.create_user('withphone@example.test', '00000000-0000-0000-0000-0000000000e1');
select tests.create_user('emailonly@example.test', '00000000-0000-0000-0000-0000000000e2');

-- `tests.create_user` gives every fixture a confirmed phone, because that is
-- what a real member has. This one is deliberately stripped back to an account
-- that only ever proved an email — the case the gate exists for.
update auth.users
   set phone = null, phone_confirmed_at = null
 where id = '00000000-0000-0000-0000-0000000000e2';

-- --------------------------------------------------------- the phone gate

select tests.authenticate_as('00000000-0000-0000-0000-0000000000e2');

select ok(
  not app.current_user_has_verified_phone(),
  'an account with only an email has not proved a phone'
);

select throws_ok(
  $$insert into public.profiles (id, display_name, birthdate)
    values ('00000000-0000-0000-0000-0000000000e2', 'Nobody', '1990-01-01')$$,
  '42501',
  null,
  'and cannot create a profile, so it never reaches discovery'
);

select tests.authenticate_as('00000000-0000-0000-0000-0000000000e1');

select ok(
  app.current_user_has_verified_phone(),
  'an account that verified a phone has proved one'
);

select lives_ok(
  $$insert into public.profiles (id, display_name, birthdate)
    values ('00000000-0000-0000-0000-0000000000e1', 'Real', '1990-01-01')$$,
  'and can create its profile as before'
);

-- A phone that was set but never confirmed is not a verified phone. This is
-- the case a JWT phone claim would get wrong, which is why the function reads
-- auth.users. Written as the owner, since `authenticated` cannot touch that
-- table — which is itself the reason the check has to be SECURITY DEFINER.
reset role;
update auth.users set phone_confirmed_at = null where id = '00000000-0000-0000-0000-0000000000e1';
select tests.authenticate_as('00000000-0000-0000-0000-0000000000e1');
select ok(
  not app.current_user_has_verified_phone(),
  'a phone on the row is not enough — it has to have been confirmed'
);
reset role;
update auth.users set phone_confirmed_at = now() where id = '00000000-0000-0000-0000-0000000000e1';
select tests.authenticate_as('00000000-0000-0000-0000-0000000000e1');

-- Editing and deleting are never gated: somebody already inside must be able
-- to leave, whatever the state of their phone.
select lives_ok(
  $$update public.profiles set display_name = 'Renamed' where id = '00000000-0000-0000-0000-0000000000e1'$$,
  'the gate is on creating a profile, not on editing one'
);

-- ------------------------------------------------- the product gate (000500)
--
-- The insert policy closes the way in. This closes the rooms — an account that
-- already holds a profile from before phone-only sign-in must not still be
-- able to swipe, check in or join a room. Staging has nine of exactly that.
--
-- The pairing that matters: the product is refused, and safety is not.

reset role;
-- A member in every respect except that their account never confirmed a phone.
-- Written as the owner because `auth.users` is not client-writable — which is
-- the reason the check is SECURITY DEFINER in the first place.
update auth.users set phone_confirmed_at = null
 where id = '00000000-0000-0000-0000-0000000000b1';

select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');

select throws_ok(
  $$select public.discovery_feed('UPCOMING', 10)$$,
  '42501',
  null,
  'no phone, no deck'
);

select throws_ok(
  format($$select public.swipe(%L, 'UPCOMING', 'LIKE')$$, '00000000-0000-0000-0000-0000000000a1'),
  '42501',
  null,
  'no phone, no swipe'
);

select throws_ok(
  $$select public.my_rooms()$$,
  '42501',
  null,
  'no phone, no rooms'
);

select throws_ok(
  $$select public.declare_upcoming_stay(current_date + 1, current_date + 3)$$,
  '42501',
  null,
  'no phone, no declared stay'
);

-- And now the half that matters more. None of this may be gated: an account
-- that cannot prove a phone must still be able to protect itself and leave.

select lives_ok(
  format($$select public.block_user(%L)$$, '00000000-0000-0000-0000-0000000000a1'),
  'blocking still works without a phone — taking away somebody''s block button is the worst reading of "secure"'
);

select lives_ok(
  format($$select public.report_user(%L, 'HARASSMENT', 'still able to report')$$,
         '00000000-0000-0000-0000-0000000000a1'),
  'and so does reporting'
);

select lives_ok(
  $$select public.my_matches()$$,
  'and reading your own conversations'
);

select lives_ok(
  format($$select public.unblock_user(%L)$$, '00000000-0000-0000-0000-0000000000a1'),
  'and undoing a block'
);

-- Deletion last, because it ends the account: an account that cannot use the
-- product and cannot leave it either would be a trap.
select lives_ok(
  $$select public.delete_my_account()$$,
  'and deleting the account, which is the one door that must never be gated'
);

-- Put the fixture back for the read-state half of this file.
reset role;
select tests.create_member('bo2@example.test', '00000000-0000-0000-0000-0000000000b1', 'Bo');

select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select ok(
  app.current_user_has_verified_phone(),
  'and a member who did confirm a phone passes the same gate'
);
select lives_ok(
  $$select public.discovery_feed('UPCOMING', 10)$$,
  'so every normal product call is available to them'
);

-- --------------------------------------------------------------- read state

reset role;
create temp table h as select tests.create_hotel('Bosphorus Grand', 41.0369, 28.9850) as one;
grant select on h to anon, authenticated;

-- Back to the owner: creating a function in `tests` is DDL, and the role left
-- over from the last sign-in cannot do it.
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

select tests.join_upcoming('00000000-0000-0000-0000-0000000000a1');
select tests.join_upcoming('00000000-0000-0000-0000-0000000000b1');
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select public.swipe('00000000-0000-0000-0000-0000000000b1', 'UPCOMING', 'LIKE');
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select public.swipe('00000000-0000-0000-0000-0000000000a1', 'UPCOMING', 'LIKE');

reset role;
create temp table m as select id from public.matches limit 1;
grant select on m to anon, authenticated;

-- Ada writes twice; Bo has not looked.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
insert into public.messages (match_id, sender_id, body)
values ((select id from m), '00000000-0000-0000-0000-0000000000a1', 'first'),
       ((select id from m), '00000000-0000-0000-0000-0000000000a1', 'second');

select is(
  (select t.unread_count from public.my_matches() t limit 1),
  0,
  'your own messages are never unread to you'
);

select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');

select is(
  (select t.unread_count from public.my_matches() t limit 1),
  2,
  'the other side sees two waiting'
);

select is(public.unread_total(), 2, 'and the tab total agrees');

-- Opening the conversation.
select ok(public.mark_match_read((select id from m)) > 0, 'opening it marks it read to the latest message');

select is(
  (select t.unread_count from public.my_matches() t limit 1),
  0,
  'nothing is waiting any more'
);
select is(public.unread_total(), 0, 'and the tab mark is gone');

-- A new message after reading is unread again; reading twice is not.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
insert into public.messages (match_id, sender_id, body)
values ((select id from m), '00000000-0000-0000-0000-0000000000a1', 'third');

select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select is((select t.unread_count from public.my_matches() t limit 1), 1, 'a later message is unread again');
select ok(public.mark_match_read((select id from m)) > 0, 'read again');
select ok(public.mark_match_read((select id from m)) > 0, 'and again, which changes nothing');
select is((select t.unread_count from public.my_matches() t limit 1), 0, 'still nothing waiting');

-- Monotonic: an old sequence arriving late must not turn a read conversation
-- unread. Two devices, or a retried request, would otherwise do exactly that.
select ok(public.mark_match_read((select id from m), 1) > 1, 'a late, lower sequence does not move the marker back');
select is((select t.unread_count from public.my_matches() t limit 1), 0, 'so the conversation stays read');

-- Reading ahead of what exists would silence the conversation for good, since
-- the marker never moves backwards. It is clamped instead.
select ok(
  public.mark_match_read((select id from m), 999999) < 999999,
  'a read marker cannot be pushed past the last message in the conversation'
);

select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
insert into public.messages (match_id, sender_id, body)
values ((select id from m), '00000000-0000-0000-0000-0000000000a1', 'after the overreach');
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select is(
  (select t.unread_count from public.my_matches() t limit 1),
  1,
  'so a later message is still unread'
);
select ok(public.mark_match_read((select id from m)) > 0, 'and can be read normally');

-- Nobody marks anybody else's conversation.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000e1');
select throws_ok(
  format($$select public.mark_match_read(%L)$$, (select id from m)),
  '42501',
  null,
  'a stranger cannot mark a conversation they are not in'
);

select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select is(
  (select count(*)::int from public.match_reads),
  1,
  'and a member sees only their own read state, never the other side''s'
);

-- ----------------------------------------------- blocking clears the badge

select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
insert into public.messages (match_id, sender_id, body)
values ((select id from m), '00000000-0000-0000-0000-0000000000a1', 'fourth');

select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select is(public.unread_total(), 1, 'one waiting before the block');
select public.block_user('00000000-0000-0000-0000-0000000000a1');
select is(
  public.unread_total(),
  0,
  'blocking leaves no badge behind — a mark you can only clear by reopening a conversation you left is a trap'
);

select * from finish();
rollback;
