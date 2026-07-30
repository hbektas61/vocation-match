-- S-002 — per-user throttles on the endpoints that cost someone else something.
begin;
set search_path = extensions, public, tests, pg_catalog;
select no_plan();

select tests.create_member('ada@example.test', '00000000-0000-0000-0000-0000000000a1', 'Ada');
select tests.create_member('bo@example.test',  '00000000-0000-0000-0000-0000000000b1', 'Bo');
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

-- ------------------------------------------------------------ the counter
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');

select throws_ok(
  $$select count(*) from public.rate_limits$$,
  '42501',
  null,
  'a client cannot read the counters — how close you are to a limit is itself useful to someone probing it'
);

select throws_ok(
  $$insert into public.rate_limits (user_id, bucket) values ('00000000-0000-0000-0000-0000000000a1', 'x')$$,
  '42501',
  null,
  'and cannot write them'
);

-- ---------------------------------------------------------- presence checks
-- 30 an hour is far more than an answer that lasts 30 minutes needs, and low
-- enough that binary-searching the hotel position by repeated calls stops
-- being free.
select lives_ok(
  $$select public.record_presence_check(41.0389, 28.9850, 10) from generate_series(1, 30)$$,
  'thirty presence checks in an hour are fine'
);

select throws_ok(
  $$select public.record_presence_check(41.0389, 28.9850, 10)$$,
  '54000',
  'You are doing that too often. Try again later.',
  'the thirty-first is refused, with a code that means slow down rather than something broke'
);

-- The refusal is per user, not global.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select lives_ok(
  $$select public.record_presence_check(41.0389, 28.9850, 10)$$,
  'another user is unaffected by the first one hitting a limit'
);

-- ------------------------------------------------------------------ reports
-- The tightest limit, because unlimited reporting is both a way to bury a
-- moderation queue and a way to mass-block.
select tests.clear_auth();
-- Held in a scratch table rather than selected back out of `profiles`: the
-- reporter cannot see anyone else's profile row, so a subquery would silently
-- return nothing and the test would pass without reporting anybody.
create temp table targets as
select i as n,
       tests.create_member('target' || i || '@example.test', null,
                           'Target ' || lpad(i::text, 2, '0')) as id
  from generate_series(1, 12) i;
grant select on targets to anon, authenticated;

select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');

select lives_ok(
  $$select public.report_user(t.id, 'SPAM', null, false)
      from (select id from targets order by n limit 10) t$$,
  'ten reports in an hour are allowed'
);

select throws_ok(
  $$select public.report_user(t.id, 'SPAM', null, false)
      from (select id from targets where n = 11) t$$,
  '54000',
  'You are doing that too often. Try again later.',
  'the eleventh is refused'
);

select is(
  (select count(*)::int from public.reports),
  10,
  'and the refused report was not filed'
);

-- ----------------------------------------------------------------- window
-- Rolling the window forward lets the same user through again.
select tests.clear_auth();
update public.rate_limits
   set window_start = now() - interval '2 hours'
 where user_id = '00000000-0000-0000-0000-0000000000a1';

select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok(
  $$select public.record_presence_check(41.0389, 28.9850, 10)$$,
  'once the window rolls over the allowance comes back'
);

-- ---------------------------------------------------------------- messages
select tests.clear_auth();
delete from public.rate_limits;

select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select public.swipe('00000000-0000-0000-0000-0000000000b1', 'UPCOMING', 'LIKE');
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select public.swipe('00000000-0000-0000-0000-0000000000a1', 'UPCOMING', 'LIKE');

create temp table m as select id from public.matches limit 1;
grant select on m to anon, authenticated;

select lives_ok(
  format($$insert into public.messages (match_id, sender_id, body)
           select %L, '00000000-0000-0000-0000-0000000000b1', 'hi ' || i
             from generate_series(1, 60) i$$, (select id from m)),
  'sixty messages in a minute are allowed'
);

select throws_ok(
  format($$insert into public.messages (match_id, sender_id, body)
           values (%L, '00000000-0000-0000-0000-0000000000b1', 'one too many')$$,
         (select id from m)),
  '54000',
  'You are doing that too often. Try again later.',
  'the sixty-first is refused'
);

select is(
  (select count(*)::int from public.messages),
  60,
  'and it was not stored'
);

select * from finish(true);
rollback;
