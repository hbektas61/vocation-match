-- N-009 — block, report, and the moderation pipeline (owner decision D-008).
begin;
set search_path = extensions, public, tests, pg_catalog;
select no_plan();

select tests.create_member('ada@example.test',  '00000000-0000-0000-0000-0000000000a1', 'Ada');
select tests.create_member('bo@example.test',   '00000000-0000-0000-0000-0000000000b1', 'Bo');
select tests.create_member('cam@example.test',  '00000000-0000-0000-0000-0000000000c1', 'Cam');
select tests.create_member('dana@example.test', '00000000-0000-0000-0000-0000000000d1', 'Dana');

create temp table h as select tests.create_hotel('Bosphorus Grand', 41.0369, 28.9850) as one;
grant select on h to anon, authenticated;

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
select tests.join_upcoming('00000000-0000-0000-0000-0000000000c1');
select tests.join_upcoming('00000000-0000-0000-0000-0000000000d1');

-- Ada and Bo match first, so blocking has something to tear down.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select public.swipe('00000000-0000-0000-0000-0000000000b1', 'UPCOMING', 'LIKE');
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select public.swipe('00000000-0000-0000-0000-0000000000a1', 'UPCOMING', 'LIKE');

select is(
  (select count(*)::int from public.matches where unmatched_at is null),
  1,
  'Ada and Bo are matched before the block'
);

-- ------------------------------------------------------------------- block
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');

select throws_ok(
  $$select public.block_user('00000000-0000-0000-0000-0000000000a1')$$,
  '23514',
  'You cannot block yourself.',
  'a user cannot block themselves'
);

select lives_ok(
  $$select public.block_user('00000000-0000-0000-0000-0000000000b1')$$,
  'blocking works from anywhere in the app, match or no match'
);

select is(
  (select count(*)::int from public.matches where unmatched_at is null),
  0,
  'blocking ends the match immediately'
);

select is(
  (select count(*)::int from public.my_matches()),
  0,
  'and the conversation leaves the blocker`s inbox'
);

select lives_ok(
  $$select public.block_user('00000000-0000-0000-0000-0000000000b1')$$,
  'blocking twice is not an error'
);

select is(
  (select count(*)::int from public.my_blocks()),
  1,
  'the blocked list shows exactly one person (backlog R-002 needs this list)'
);

select is(
  (select display_name from public.my_blocks()),
  'Bo',
  'and it names them'
);

select throws_ok(
  $$select public.swipe('00000000-0000-0000-0000-0000000000b1', 'UPCOMING', 'LIKE')$$,
  '42501',
  'That person is not available.',
  'the blocker cannot swipe on the blocked person'
);

-- --------------------------------------------------------- the other side
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');

select is(
  (select count(*)::int from public.blocks),
  0,
  'the blocked person is never shown that a block exists'
);

select is(
  (select count(*)::int from public.my_matches()),
  0,
  'and the conversation leaves their inbox too'
);

select throws_ok(
  $$select public.swipe('00000000-0000-0000-0000-0000000000a1', 'UPCOMING', 'LIKE')$$,
  '42501',
  'That person is not available.',
  'the blocked person cannot swipe back'
);

-- ----------------------------------------------------------------- unblock
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok(
  $$select public.unblock_user('00000000-0000-0000-0000-0000000000b1')$$,
  'a block can be undone — it is not a life sentence (R-002)'
);

select is(
  (select count(*)::int from public.my_blocks()),
  0,
  'the blocked list is empty again'
);

select is(
  (select count(*)::int from public.matches where unmatched_at is null),
  0,
  'unblocking does not resurrect the match that the block ended'
);

-- ------------------------------------------------------------------ report
select throws_ok(
  $$select public.report_user('00000000-0000-0000-0000-0000000000a1', 'SPAM')$$,
  '23514',
  'You cannot report yourself.',
  'a user cannot report themselves'
);

select throws_ok(
  $$select public.report_user('00000000-0000-0000-0000-0000000000b1', 'BECAUSE')$$,
  '23514',
  'Choose a reason for the report.',
  'a report needs a known reason'
);

select lives_ok(
  $$select public.report_user('00000000-0000-0000-0000-0000000000c1', 'HARASSMENT', 'kept sending messages')$$,
  'reporting works'
);

select is(
  (select count(*)::int from public.reports),
  1,
  'the reporter can see the report they filed'
);

select is(
  (select count(*)::int from public.my_blocks()),
  1,
  'reporting blocks the person by default'
);

select tests.authenticate_as('00000000-0000-0000-0000-0000000000c1');
select is(
  (select count(*)::int from public.reports),
  0,
  'the reported person is never shown the report'
);

-- ------------------------------------------------------ automatic flagging
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select public.report_user('00000000-0000-0000-0000-0000000000c1', 'SPAM');

select tests.clear_auth();
select is(
  (select count(*)::int from public.moderation_actions
    where subject_id = '00000000-0000-0000-0000-0000000000c1' and action = 'FLAGGED'),
  0,
  'two reporters are not enough to raise a flag'
);

-- Dana reports without blocking, so the suspension checks further down are
-- testing the suspension itself rather than Dana's own block.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000d1');
select public.report_user('00000000-0000-0000-0000-0000000000c1', 'FAKE_PROFILE', null, false);

select is(
  (select count(*)::int from public.my_blocks()),
  0,
  'a report can be filed without blocking when the reporter says so'
);

select tests.clear_auth();
select is(
  (select count(*)::int from public.moderation_actions
    where subject_id = '00000000-0000-0000-0000-0000000000c1' and action = 'FLAGGED'),
  1,
  'a third distinct reporter raises exactly one flag'
);

-- --------------------------------------------------------------- moderation
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');

select throws_ok(
  $$select count(*) from public.moderation_queue$$,
  '42501',
  null,
  'no signed-in user can read the moderation queue'
);

select throws_ok(
  format($$select public.resolve_report(%L, 'DISMISSED')$$,
         (select id from public.reports limit 1)),
  '42501',
  null,
  'no signed-in user can resolve a report'
);

select throws_ok(
  $$update public.reports set status = 'DISMISSED'$$,
  '42501',
  null,
  'and no signed-in user can edit a report directly'
);

select tests.authenticate_as_service();

select is(
  (select distinct_reporters::int from public.moderation_queue
    where reported_id = '00000000-0000-0000-0000-0000000000c1'),
  3,
  'the moderation queue shows the pile-on'
);

select lives_ok(
  format($$select public.resolve_report(%L, 'ACTIONED', 'repeat harassment')$$,
         (select id from public.reports
           where reported_id = '00000000-0000-0000-0000-0000000000c1' limit 1)),
  'a moderator can action a report'
);

select ok(
  (select suspended_at is not null from public.profiles
    where id = '00000000-0000-0000-0000-0000000000c1'),
  'actioning a report suspends the account'
);

select is(
  (select count(*)::int from public.moderation_actions
    where subject_id = '00000000-0000-0000-0000-0000000000c1' and action = 'SUSPENDED'),
  1,
  'and the decision is written to the moderation trail'
);

-- --------------------------------------------- suspension cannot be undone
-- A moderation column lives on a table the user owns a row in, so the write
-- grant has to be column-level. With a table-wide UPDATE grant this next
-- statement would succeed and a suspended user could reinstate themselves.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000c1');
select throws_ok(
  $$update public.profiles set suspended_at = null
     where id = '00000000-0000-0000-0000-0000000000c1'$$,
  '42501',
  null,
  'a suspended user cannot clear their own suspension'
);

select lives_ok(
  $$update public.profiles set display_name = 'Cam again'
     where id = '00000000-0000-0000-0000-0000000000c1'$$,
  'but can still edit the fields that are actually theirs'
);

select ok(
  (select suspended_at is not null from public.profiles
    where id = '00000000-0000-0000-0000-0000000000c1'),
  'and the suspension is still in place afterwards'
);

-- ------------------------------------------------- suspension takes effect
select tests.authenticate_as('00000000-0000-0000-0000-0000000000d1');

select is(
  (select count(*)::int from public.discovery_feed('UPCOMING') f
    where f.display_name = 'Cam'),
  0,
  'a suspended account disappears from every room'
);

select throws_ok(
  $$select public.swipe('00000000-0000-0000-0000-0000000000c1', 'UPCOMING', 'LIKE')$$,
  '42501',
  'That person is not in this room.',
  'and cannot be swiped on'
);

-- ------------------------------------------------- reports outlive accounts
select tests.clear_auth();
delete from auth.users where id = '00000000-0000-0000-0000-0000000000c1';

select is(
  (select count(*)::int from public.reports where reported_id is null),
  3,
  'deleting the account does not erase the reports filed about it'
);

select * from finish(true);
rollback;
