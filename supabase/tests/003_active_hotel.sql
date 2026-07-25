-- N-004 — exactly one active hotel, switching, and the audit trail.
begin;
set search_path = extensions, public, tests, pg_catalog;
select no_plan();

select tests.create_member('ada@example.test', '00000000-0000-0000-0000-0000000000a1');
select tests.create_member('bo@example.test',  '00000000-0000-0000-0000-0000000000b1');
select tests.create_user('nobody@example.test', '00000000-0000-0000-0000-0000000000c1');

create temp table h as
select tests.create_hotel('Bosphorus Grand', 41.0369, 28.9850) as one,
       tests.create_hotel('Galata Rooms',    41.0256, 28.9744) as two,
       tests.create_hotel('Closed Hotel',    41.0100, 28.9700) as closed;
update public.hotels set is_active = false where id = (select closed from h);
-- the test switches roles, so the scratch table has to be readable by them
grant select on h to anon, authenticated;

-- --------------------------------------------------------------- signed out
select tests.authenticate_as_anon();
-- The logged-out role cannot even reach the function: EXECUTE is revoked, so
-- the refusal happens before any application code runs.
select throws_ok(
  format($$select public.set_active_hotel(%L)$$, (select one from h)),
  '42501',
  null,
  'a logged-out caller cannot activate a hotel'
);

-- A request that carries a token with no subject does reach the function, and
-- is told to sign in (28000) rather than that it is forbidden (42501) — the
-- client has to tell those two apart to know whether to show a login screen.
select tests.authenticate_without_claims();
select throws_ok(
  format($$select public.set_active_hotel(%L)$$, (select one from h)),
  '28000',
  'Sign in to continue.',
  'a claimless caller is told to sign in, not that they are forbidden'
);

-- ------------------------------------------------------- signed in, no profile
select tests.authenticate_as('00000000-0000-0000-0000-0000000000c1');
select throws_ok(
  format($$select public.set_active_hotel(%L)$$, (select one from h)),
  'P0002',
  'Finish your profile first.',
  'a user without a profile cannot activate a hotel'
);

-- ------------------------------------------------------------------ activate
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');

select is(
  (select count(*)::int from public.my_rooms() where eligible),
  0,
  'no room is open before a hotel is chosen'
);

select is(
  (select r.previous_hotel_id from public.set_active_hotel((select one from h)) r),
  null,
  'the first activation reports no previous hotel'
);

select is(
  (select hotel_id from public.user_active_hotel where user_id = '00000000-0000-0000-0000-0000000000a1'),
  (select one from h),
  'the chosen hotel is now active'
);

select is(
  (select count(*)::int from public.hotel_activation_events
    where user_id = '00000000-0000-0000-0000-0000000000a1' and deactivated_at is null),
  1,
  'exactly one activation event is open'
);

-- ----------------------------------------------------------------- idempotent
select is(
  (select r.presence_cleared from public.set_active_hotel((select one from h)) r),
  false,
  're-activating the current hotel is a no-op'
);

select is(
  (select count(*)::int from public.hotel_activation_events
    where user_id = '00000000-0000-0000-0000-0000000000a1'),
  1,
  're-activating the current hotel does not add a second event'
);

-- --------------------------------------------------------------------- switch
select public.record_presence_check(41.0370, 28.9851);
select ok(
  (select eligible from public.my_rooms() where room = 'HERE_NOW'),
  'Here Now opens after a nearby check at the active hotel'
);

select is(
  (select r.previous_hotel_id from public.set_active_hotel((select two from h)) r),
  (select one from h),
  'switching reports which hotel was left'
);

select is(
  (select count(*)::int from public.user_active_hotel
    where user_id = '00000000-0000-0000-0000-0000000000a1'),
  1,
  'a user still has exactly one active hotel after switching'
);

select ok(
  not (select eligible from public.my_rooms() where room = 'HERE_NOW'),
  'switching hotels closes Here Now access immediately (D-004)'
);

select is(
  (select count(*)::int from public.presence_checks
    where user_id = '00000000-0000-0000-0000-0000000000a1'),
  0,
  'the presence answer for the previous hotel is dropped, not carried over'
);

select is(
  (select count(*)::int from public.hotel_activation_events
    where user_id = '00000000-0000-0000-0000-0000000000a1' and deactivated_at is not null),
  1,
  'the previous activation is closed in the audit trail'
);

select is(
  (select count(*)::int from public.hotel_activation_events
    where user_id = '00000000-0000-0000-0000-0000000000a1' and deactivated_at is null),
  1,
  'and exactly one activation stays open'
);

-- ------------------------------------------------------------ bad activations
select throws_ok(
  format($$select public.set_active_hotel(%L)$$, (select closed from h)),
  'P0002',
  'That hotel is not available.',
  'an inactive hotel cannot be activated'
);

select throws_ok(
  $$select public.set_active_hotel('00000000-0000-0000-0000-0000000000ff')$$,
  'P0002',
  'That hotel is not available.',
  'an unknown hotel cannot be activated'
);

-- --------------------------------------------------------- no direct writes
select throws_ok(
  format($$insert into public.user_active_hotel (user_id, hotel_id)
           values ('00000000-0000-0000-0000-0000000000a1', %L)$$, (select one from h)),
  '42501',
  null,
  'a client cannot write the active hotel directly'
);

select throws_ok(
  format($$update public.user_active_hotel set hotel_id = %L
            where user_id = '00000000-0000-0000-0000-0000000000a1'$$, (select one from h)),
  '42501',
  null,
  'a client cannot update the active hotel directly'
);

-- ----------------------------------------------------------------- isolation
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');

select is(
  (select count(*)::int from public.user_active_hotel),
  0,
  'another user cannot see where someone else is staying'
);

select is(
  (select count(*)::int from public.hotel_activation_events),
  0,
  'another user cannot read someone else`s hotel history'
);

select * from finish(true);
rollback;
