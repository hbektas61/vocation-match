-- N-008 — persistent chat between matched users.
begin;
set search_path = extensions, public, tests, pg_catalog;
select no_plan();

select tests.create_member('ada@example.test',  '00000000-0000-0000-0000-0000000000a1', 'Ada');
select tests.create_member('bo@example.test',   '00000000-0000-0000-0000-0000000000b1', 'Bo');
select tests.create_member('cam@example.test',  '00000000-0000-0000-0000-0000000000c1', 'Cam');

select tests.create_hotel('Bosphorus Grand', 41.0369, 28.9850);

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

select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select public.swipe('00000000-0000-0000-0000-0000000000b1', 'UPCOMING', 'LIKE');
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select public.swipe('00000000-0000-0000-0000-0000000000a1', 'UPCOMING', 'LIKE');

create temp table m as select id from public.matches limit 1;
grant select on m to anon, authenticated;

-- ------------------------------------------------------------- happy path
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');

select lives_ok(
  format($$insert into public.messages (match_id, sender_id, body)
           values (%L, '00000000-0000-0000-0000-0000000000a1', 'Hello!')$$, (select id from m)),
  'a matched user can send a message'
);

select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');

select is(
  (select body from public.messages),
  'Hello!',
  'the other side of the match reads it'
);

select lives_ok(
  format($$insert into public.messages (match_id, sender_id, body)
           values (%L, '00000000-0000-0000-0000-0000000000b1', 'Hi back')$$, (select id from m)),
  'and can reply'
);

select is(
  (select count(*)::int from public.messages),
  2,
  'the conversation persists'
);

select is(
  (select last_message_body from public.my_matches()),
  'Hi back',
  'the inbox shows the latest message'
);

-- ------------------------------------------------------------ impersonation
select throws_ok(
  format($$insert into public.messages (match_id, sender_id, body)
           values (%L, '00000000-0000-0000-0000-0000000000a1', 'not me')$$, (select id from m)),
  '42501',
  null,
  'nobody can post a message as another user'
);

select throws_ok(
  format($$insert into public.messages (match_id, sender_id, body)
           values (%L, '00000000-0000-0000-0000-0000000000b1', '   ')$$, (select id from m)),
  '23514',
  null,
  'an empty message is refused'
);

select throws_ok(
  format($$insert into public.messages (match_id, sender_id, body)
           values (%L, '00000000-0000-0000-0000-0000000000b1', repeat('x', 2001))$$, (select id from m)),
  '23514',
  null,
  'an over-long message is refused'
);

-- A sender who could choose created_at could reorder someone else's history.
select throws_ok(
  format($$insert into public.messages (match_id, sender_id, body, created_at)
           values (%L, '00000000-0000-0000-0000-0000000000b1', 'backdated', now() - interval '1 year')$$,
         (select id from m)),
  '42501',
  null,
  'a sender cannot choose when their message was sent'
);

select throws_ok(
  $$update public.messages set body = 'edited'$$,
  '42501',
  null,
  'and cannot rewrite a message after sending it'
);

select throws_ok(
  $$delete from public.messages$$,
  '42501',
  null,
  'or delete one'
);

-- --------------------------------------------------------------- outsiders
select tests.authenticate_as('00000000-0000-0000-0000-0000000000c1');

select is(
  (select count(*)::int from public.messages),
  0,
  'someone outside the match cannot read the conversation'
);

select throws_ok(
  format($$insert into public.messages (match_id, sender_id, body)
           values (%L, '00000000-0000-0000-0000-0000000000c1', 'butting in')$$, (select id from m)),
  '42501',
  null,
  'and cannot write into it'
);

select tests.authenticate_as_anon();
select throws_ok(
  $$select count(*) from public.messages$$,
  '42501',
  null,
  'the logged-out role cannot read any message'
);

-- ---------------------------------------------------------------- unmatch
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select public.unmatch((select id from m));

select is(
  (select count(*)::int from public.messages),
  2,
  'the history stays readable after an unmatch'
);

select throws_ok(
  format($$insert into public.messages (match_id, sender_id, body)
           values (%L, '00000000-0000-0000-0000-0000000000a1', 'still here?')$$, (select id from m)),
  '42501',
  null,
  'but nothing new can be added to it'
);

-- ------------------------------------------------------------------ block
select tests.clear_auth();
update public.matches set unmatched_at = null, unmatched_by = null;

select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select public.block_user('00000000-0000-0000-0000-0000000000b1');

-- Reopen the match so the block is the ONLY thing standing in the way.
-- Without this the next assertion would pass because block_user unmatched the
-- pair, and would keep passing even if the block check itself were broken.
select tests.clear_auth();
update public.matches set unmatched_at = null, unmatched_by = null;

select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select is(
  (select count(*)::int from public.blocks),
  0,
  'the blocked user genuinely cannot see the block row that stops them'
);
select throws_ok(
  format($$insert into public.messages (match_id, sender_id, body)
           values (%L, '00000000-0000-0000-0000-0000000000b1', 'hello?')$$, (select id from m)),
  '42501',
  null,
  'a blocked user cannot keep messaging even though the block is invisible to them'
);

select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok(
  format($$insert into public.messages (match_id, sender_id, body)
           values (%L, '00000000-0000-0000-0000-0000000000a1', 'hello?')$$, (select id from m)),
  '42501',
  null,
  'and neither can the blocker'
);

-- ------------------------------------------------------------- suspension
select tests.clear_auth();
delete from public.blocks;
update public.matches set unmatched_at = null, unmatched_by = null;
update public.profiles set suspended_at = now()
 where id = '00000000-0000-0000-0000-0000000000b1';

select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select throws_ok(
  format($$insert into public.messages (match_id, sender_id, body)
           values (%L, '00000000-0000-0000-0000-0000000000b1', 'hello?')$$, (select id from m)),
  '42501',
  null,
  'a suspended account cannot send messages'
);

-- --------------------------------------------------------------- realtime
select tests.clear_auth();

select is(
  (select count(*)::int from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'),
  1,
  'messages are published to Realtime so a conversation updates live'
);

select is(
  (select count(*)::int from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'matches'),
  1,
  'and so are matches, so a new match arrives without a poll'
);

select * from finish(true);
rollback;
