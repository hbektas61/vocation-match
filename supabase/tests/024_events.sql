-- D-056 — the event rooms, where the rules actually live.
--
-- The mobile suite proves the screen and the client's half of the rules. This
-- file proves the things only a database can: the unique constraint that makes
-- two people who picked one event share a room, the concurrency that makes it
-- hold under a race, the RLS that keeps the provider's lease out of a client's
-- reach, and the guarantee that an event room and a hotel room can never see
-- each other.
begin;
set search_path = extensions, public, tests, pg_catalog;
select no_plan();

select tests.create_member('ada@example.test', '00000000-0000-0000-0000-00000000e001', 'Ada');
select tests.create_member('eda@example.test', '00000000-0000-0000-0000-00000000e002', 'Eda');
select tests.create_member('ina@example.test', '00000000-0000-0000-0000-00000000e003', 'Ina');
-- Joins nothing, ever: the "no deck without an event" case needs somebody who
-- has not been given a focus by joining.
select tests.create_member('ali@example.test', '00000000-0000-0000-0000-00000000e004', 'Ali');
-- E-21: two who never declare anything — one who turns up at the event, and
-- one whose reading is too coarse to be believed.
select tests.create_member('efe@example.test', '00000000-0000-0000-0000-00000000e005', 'Efe');
select tests.create_member('mine@example.test', '00000000-0000-0000-0000-00000000e006', 'Mine');

-- A hotel guest, to prove they never leak into a concert.
create temp table h as select tests.create_hotel('Lara Shore', 36.8549, 30.7995) as id;
grant select on h to anon, authenticated, service_role;

/** The backend's half of a search: mint one selection for a named event. */
create or replace function tests.event_token(
  p_user uuid, p_event text, p_status text default 'onsale'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_token uuid;
begin
  select r.token into v_token
    from public.record_event_selections(
      p_user, 'test-search',
      jsonb_build_array(jsonb_build_object('id', p_event, 'status', p_status))) r;
  return v_token;
end;
$$;
grant execute on function tests.event_token(uuid, text, text) to anon, authenticated, service_role;

/** Leases one event's content, the way the edge function does after a detail. */
create or replace function tests.lease_event(
  p_event text,
  p_starts timestamptz,
  p_ends   timestamptz,
  p_lat    double precision default 41.0435,
  p_lng    double precision default 28.9976,
  p_status text default 'onsale',
  p_tbd    boolean default false
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.put_event_content(
    p_event,
    jsonb_build_object('id', p_event, 'name', 'Leased Name'),
    p_status, p_starts, p_ends, 'Europe/Istanbul', p_tbd, p_lat, p_lng, interval '1 hour');
$$;
grant execute on function tests.lease_event(
  text, timestamptz, timestamptz, double precision, double precision, text, boolean)
  to anon, authenticated, service_role;

select tests.authenticate_as_service();

-- Before anything else: a fresh database ships with events **off**. Production
-- is a fresh database, so this is the assertion that keeps item 7 true without
-- anybody having to remember it — and `on conflict do nothing` in the seed
-- means re-applying the migration can never flip it on either.
-- Read through the function rather than the table: the table is granted to
-- nobody, which is the point, and the function is how the app asks.
select is(
  (select f.enabled from public.feature_flags() f where f.flag = 'EVENTS_FEATURE_ENABLED'),
  false,
  'the events feature ships off, everywhere, until an operator turns it on'
);
select is(
  (select count(*)::int from public.feature_flags() f
    where f.flag = 'EVENTS_FEATURE_ENABLED'),
  1,
  'and the seed is idempotent — one row, however many times it is applied'
);

select public.set_feature_flag('EVENTS_FEATURE_ENABLED', true);

-- ------------------------------------------------- §2.1 canonical identity
select tests.authenticate_as('00000000-0000-0000-0000-00000000e001');
create temp table ada as select (select e.event_id from public.join_event_upcoming(
  tests.event_token('00000000-0000-0000-0000-00000000e001', 'tm-arena')) e) as id;
grant select on ada to anon, authenticated, service_role;

select tests.authenticate_as('00000000-0000-0000-0000-00000000e002');
create temp table eda as select (select e.event_id from public.join_event_upcoming(
  tests.event_token('00000000-0000-0000-0000-00000000e002', 'tm-arena')) e) as id;
grant select on eda to anon, authenticated, service_role;

select is(
  (select id from eda), (select id from ada),
  'two people who picked the same provider event share one internal subject'
);
select isnt(
  (select e.event_id from public.join_event_upcoming(
     tests.event_token('00000000-0000-0000-0000-00000000e002', 'tm-arena-other')) e),
  (select id from ada),
  'and the same name under a different id would be a different subject'
);

select tests.authenticate_as_service();
select is(
  public.upsert_event('tm-arena'),
  (select id from ada),
  'a concurrent first selection resolves to the subject that already exists'
);
select is(
  (select count(*)::int from public.events where provider_event_id = 'tm-arena'),
  1,
  'because the unique key settles it in one statement'
);

-- ------------------------------------------------------- §6.2 the selection
select tests.authenticate_as('00000000-0000-0000-0000-00000000e001');
select throws_ok(
  $$select * from public.join_event_upcoming(gen_random_uuid())$$,
  'P0003',
  'That event selection is not usable.',
  'a token the backend never issued is refused'
);

create temp table tok as
  select tests.event_token('00000000-0000-0000-0000-00000000e001', 'tm-festival') as t;
grant select on tok to anon, authenticated, service_role;

select tests.authenticate_as('00000000-0000-0000-0000-00000000e002');
select throws_ok(
  $$select * from public.join_event_upcoming((select t from tok))$$,
  'P0003',
  'That event selection is not usable.',
  'and so is somebody else''s'
);
select tests.authenticate_as('00000000-0000-0000-0000-00000000e001');
select lives_ok(
  $$select * from public.join_event_upcoming((select t from tok))$$,
  'its owner may spend it once'
);
select throws_ok(
  $$select * from public.join_event_upcoming((select t from tok))$$,
  'P0003',
  'That event selection is not usable.',
  'and never twice'
);

-- §8.1: a cancelled event takes no new members.
select throws_ok(
  $$select * from public.join_event_upcoming(
      tests.event_token('00000000-0000-0000-0000-00000000e001', 'tm-off', 'cancelled'))$$,
  'P0005',
  'That event has been cancelled.',
  'a cancelled event takes no new members'
);

-- --------------------------------------------- §5 events do not touch hotels
select is(
  (select count(*)::int from public.user_active_hotel where user_id = app.current_user_id()),
  0,
  'joining events left no hotel behind'
);
select lives_ok(
  $$select public.set_active_hotel((select id from h))$$,
  'a venue can be chosen afterwards'
);
select lives_ok(
  $$select * from public.join_event_upcoming(
      tests.event_token('00000000-0000-0000-0000-00000000e001', 'tm-third'))$$,
  'and another event joined on top of it'
);
select is(
  (select hotel_id from public.user_active_hotel where user_id = app.current_user_id()),
  (select id from h),
  'without the venue being deactivated (§16.13)'
);
select is(
  (select count(*)::int from public.my_events()),
  3,
  'several future events coexist (§16.14)'
);

-- --------------------------------------------------- §5 the rooms never mix
-- Ada and Eda are both in tm-arena; Ina is in a different event at the same
-- venue; the hotel guest is in no event at all.
select tests.authenticate_as('00000000-0000-0000-0000-00000000e003');
select public.join_event_upcoming(
  tests.event_token('00000000-0000-0000-0000-00000000e003', 'tm-arena-other'));

select tests.authenticate_as('00000000-0000-0000-0000-00000000e001');
select public.set_event_focus((select id from ada), 'EVENT_UPCOMING');
select results_eq(
  $$select display_name from public.discovery_feed('EVENT_UPCOMING')$$,
  $$values ('Eda'::text)$$,
  'an event deck holds only the people in that same event'
);

select tests.authenticate_as('00000000-0000-0000-0000-00000000e004');
select throws_ok(
  $$select * from public.discovery_feed('EVENT_UPCOMING')$$,
  'P0002',
  'Choose an event first.',
  'and no deck at all for somebody who has joined no event'
);

-- --------------------------------------------------- §8.2/§9 the live window
select tests.authenticate_as_service();
select tests.lease_event('tm-arena', now() + interval '10 hours', now() + interval '13 hours');

select results_eq(
  $$select outcome from public.record_event_presence(
      '00000000-0000-0000-0000-00000000e001', (select id from ada),
      41.0435, 28.9976, 41.0435, 28.9976, 10)$$,
  $$values ('EVENT_NOT_STARTED'::text)$$,
  'a check ten hours early is refused (§16.21)'
);

select tests.lease_event('tm-arena', now() - interval '12 hours', now() - interval '9 hours');
select results_eq(
  $$select outcome from public.record_event_presence(
      '00000000-0000-0000-0000-00000000e001', (select id from ada),
      41.0435, 28.9976, 41.0435, 28.9976, 10)$$,
  $$values ('EVENT_FINISHED'::text)$$,
  'and one long after the grace period too (§16.22)'
);

select tests.lease_event('tm-arena', now() - interval '30 minutes', now() + interval '2 hours');
select results_eq(
  $$select outcome from public.record_event_presence(
      '00000000-0000-0000-0000-00000000e001', (select id from ada),
      41.0435, 28.9976, 41.0435, 28.9976, 10)$$,
  $$values ('IN_RANGE'::text)$$,
  'a fresh accurate reading inside 500 m succeeds (§16.23)'
);
select results_eq(
  $$select outcome from public.record_event_presence(
      '00000000-0000-0000-0000-00000000e001', (select id from ada),
      41.0935, 28.9976, 41.0435, 28.9976, 10)$$,
  $$values ('TOO_FAR'::text)$$,
  'and five kilometres away does not (§16.24)'
);
select results_eq(
  $$select outcome from public.record_event_presence(
      '00000000-0000-0000-0000-00000000e001', (select id from ada),
      41.0435, 28.9976, 41.0435, 28.9976, 900)$$,
  $$values ('LOCATION_INACCURATE'::text)$$,
  'a fix too vague to settle 500 m is refused, by the shared rule (§16.25)'
);
select results_eq(
  $$select outcome from public.record_event_presence(
      '00000000-0000-0000-0000-00000000e001', (select id from ada),
      41.0435, 28.9976, null, null, 10)$$,
  $$values ('EVENT_LOCATION_UNAVAILABLE'::text)$$,
  'and an event with no published venue fails safely rather than guessing (§16.26)'
);

-- §16.28: the expiry is the earlier of the TTL and the window's end.
-- Started four hours ago, ended two: still inside the three-hour grace, but
-- closing sooner than a three-hour verification would last.
select tests.lease_event('tm-arena', now() - interval '4 hours', now() - interval '2 hours');
select ok(
  (select pc.expires_at from public.record_event_presence(
     '00000000-0000-0000-0000-00000000e001', (select id from ada),
     41.0435, 28.9976, 41.0435, 28.9976, 10) pc)
    < now() + app.event_presence_ttl(),
  'a verification cannot outlive the event it is about'
);

-- §16.20: a date-only event supports UPCOMING and refuses the live room.
select tests.lease_event('tm-third', null, null, 41.0, 29.0, 'onsale', true);
select is(
  (select count(*)::int from app.event_live_window(
     (select e.id from public.events e where e.provider_event_id = 'tm-third'))),
  0,
  'a date-only event has no live window, because one would have to be invented'
);
select results_eq(
  $$select outcome from public.record_event_presence(
      '00000000-0000-0000-0000-00000000e001',
      (select e.id from public.events e where e.provider_event_id = 'tm-third'),
      41.0, 29.0, 41.0, 29.0, 10)$$,
  $$values ('EVENT_TIME_UNCONFIRMED'::text)$$,
  'and its live room says so rather than opening'
);

-- §16.29: one live *event* at a time, and the hotel untouched.
select tests.lease_event('tm-arena', now() - interval '30 minutes', now() + interval '2 hours');
select tests.lease_event('tm-arena-other', now() - interval '30 minutes', now() + interval '2 hours');
-- Ada joins the second event too: the rule under test is "one *live* event at
-- a time", which needs one person in two of them.
select tests.authenticate_as('00000000-0000-0000-0000-00000000e001');
select public.join_event_upcoming(
  tests.event_token('00000000-0000-0000-0000-00000000e001', 'tm-arena-other'));
select tests.authenticate_as_service();
select public.record_event_presence(
  '00000000-0000-0000-0000-00000000e001', (select id from ada),
  41.0435, 28.9976, 41.0435, 28.9976, 10);
select public.record_presence_verified(
  '00000000-0000-0000-0000-00000000e001', 36.8549, 30.7995, 36.8549, 30.7995, 10);
select public.record_event_presence(
  '00000000-0000-0000-0000-00000000e001',
  (select e.id from public.events e where e.provider_event_id = 'tm-arena-other'),
  41.0435, 28.9976, 41.0435, 28.9976, 10);

select is(
  (select event_id from public.event_presence_checks
    where user_id = '00000000-0000-0000-0000-00000000e001'),
  (select e.id from public.events e where e.provider_event_id = 'tm-arena-other'),
  'a second live event replaces the first'
);
select is(
  (select count(*)::int from public.presence_checks
    where user_id = '00000000-0000-0000-0000-00000000e001' and within_range),
  1,
  'and the hotel''s own answer is left exactly where it was'
);

-- ------------------------------------------------- §10 the lease and takedown
select is(
  (select count(*)::int from public.event_content(array[(select id from ada)])),
  1,
  'a fresh lease is served'
);
select is(
  (select count(*)::int from public.purge_event_content('tm-arena')),
  1,
  'a takedown removes that event''s content'
);
select is(
  (select count(*)::int from public.event_content(array[(select id from ada)])),
  0,
  'and it is then absent rather than stale'
);
select is(
  (select count(*)::int from public.event_memberships
    where event_id = (select id from ada) and withdrawn_at is null),
  2,
  'while every membership survives it (§16.39)'
);
select is(
  (select count(*)::int from public.events where id = (select id from ada)),
  1,
  'and so does the room''s identity'
);

-- Expired content is not served as fresh (§16.35). Aged as the owner, since
-- the lease table is granted to nobody — which is itself asserted below.
select tests.lease_event('tm-arena', now(), now() + interval '2 hours');
select tests.clear_auth();
-- `expires_at > fetched_at` is the table's own rule, so ageing a lease means
-- moving both — which is what a lease genuinely going stale looks like.
update app.event_content
   set fetched_at = now() - interval '2 hours',
       expires_at = now() - interval '1 minute'
 where event_id = (select id from ada);
select tests.authenticate_as_service();
select is(
  (select count(*)::int from public.event_content(array[(select id from ada)])),
  0,
  'expired provider content is not served as fresh'
);

-- ------------------------------------------------- §16.38 what a room holds
select is(
  (select coalesce(string_agg(column_name, ', ' order by column_name), '')
     from information_schema.columns
    where table_schema = 'public' and table_name = 'event_memberships'),
  'declared_at, event_id, user_id, withdrawn_at',
  'a membership is who, which event, and two clocks — no provider content'
);
select is(
  (select count(*)::int
     from information_schema.columns
    where table_schema = 'public'
      and table_name in ('events', 'event_memberships', 'event_presence_checks',
                         'user_event_focus', 'matches', 'swipes')
      and column_name ~* '(event_name|venue_name|image|url|classification|address|status)'),
  0,
  'and no app-owned event table has a column shaped like provider display content'
);

-- --------------------------------------------------- §14 the client's reach
select tests.authenticate_as('00000000-0000-0000-0000-00000000e001');
select throws_ok(
  $$select 1 from app.event_content limit 1$$,
  '42501', null,
  'a client cannot read the provider lease'
);
select throws_ok(
  $$select 1 from app.event_selections limit 1$$,
  '42501', null,
  'nor the selection tokens'
);
select throws_ok(
  $$select 1 from app.event_search_cache limit 1$$,
  '42501', null,
  'nor the shared search cache'
);
select throws_ok(
  $$select 1 from app.feature_flags limit 1$$,
  '42501', null,
  'nor the switches'
);
select is(
  (select count(*)::int from public.event_memberships
    where user_id <> app.current_user_id()),
  0,
  'and sees only its own memberships'
);

-- ------------------------------------------- §12 the ceilings, before the call
select tests.authenticate_as_service();
select ok(
  public.claim_provider_second('tm-test', 1),
  'the first request in a second is allowed'
);
select ok(
  not public.claim_provider_second('tm-test', 1),
  'and the second one in the same second is not'
);
select ok(
  not public.provider_breaker('tm-test', 'check'),
  'the breaker starts closed'
);
select ok(
  (select bool_and(x) from (
     select public.provider_breaker('tm-test', 'fail') from generate_series(1, 5)
   ) t(x)) is not null,
  'five failures are recorded'
);
select ok(
  public.provider_breaker('tm-test', 'check'),
  'and the breaker is open after them'
);
select ok(
  not public.provider_breaker('tm-test', 'ok'),
  'a success closes it again'
);

-- §7.1: one caller fills, the rest are told to wait rather than piling on.
select results_eq(
  $$select state from public.take_event_search_cache('k1')$$,
  $$values ('fill'::text)$$,
  'the first caller claims the fill'
);
select results_eq(
  $$select state from public.take_event_search_cache('k1')$$,
  $$values ('wait'::text)$$,
  'and a concurrent identical one waits instead of making a second request'
);
select lives_ok(
  $$select public.put_event_search_cache('k1', '{"events":[]}'::jsonb, interval '15 minutes')$$,
  'the filler writes what it got'
);
select results_eq(
  $$select state from public.take_event_search_cache('k1')$$,
  $$values ('hit'::text)$$,
  'and everybody after that is served from the cache'
);

-- ------------------------------------------------- E-015 the scheduled sweep
-- A lease that has lapsed, and one flagged for takedown, beside a full set of
-- app-owned records. The sweep must take exactly the first two.
select tests.authenticate_as_service();
select tests.lease_event('tm-sweep-a', now(), now() + interval '2 hours');
select tests.lease_event('tm-sweep-b', now(), now() + interval '2 hours');
select public.request_event_takedown('tm-sweep-b');

select tests.clear_auth();
update app.event_content
   set fetched_at = now() - interval '2 hours', expires_at = now() - interval '1 minute'
 where event_id = (select e.id from public.events e where e.provider_event_id = 'tm-sweep-a');

create temp table before_sweep as
  select (select count(*) from public.events)               as events,
         (select count(*) from public.event_memberships)    as memberships,
         (select count(*) from public.swipes)               as swipes,
         (select count(*) from public.matches)              as matches,
         (select count(*) from public.messages)             as messages,
         (select count(*) from public.blocks)               as blocks,
         (select count(*) from public.reports)              as reports,
         (select count(*) from app.event_content)           as leases;
grant select on before_sweep to anon, authenticated, service_role;

-- Three, not two: the lease aged for the §16.35 assertion above is still
-- sitting there expired, and the sweep is exactly the thing that collects it.
select is(
  app.purge_event_content_run(),
  3,
  'the sweep takes every expired lease and every flagged one'
);

select is(
  (select b.events || '/' || b.memberships || '/' || b.swipes || '/' || b.matches
          || '/' || b.messages || '/' || b.blocks || '/' || b.reports
     from before_sweep b),
  ((select count(*) from public.events) || '/' ||
   (select count(*) from public.event_memberships) || '/' ||
   (select count(*) from public.swipes) || '/' ||
   (select count(*) from public.matches) || '/' ||
   (select count(*) from public.messages) || '/' ||
   (select count(*) from public.blocks) || '/' ||
   (select count(*) from public.reports)),
  'and touches no event identity, membership, swipe, match, message, block or report'
);
select is(
  (select b.leases - 3 from before_sweep b),
  (select count(*) from app.event_content),
  'exactly three leases fewer, and nothing else'
);

-- The run is recorded either way, which is what makes a silent failure loud.
select is(
  (select ok from app.cron_runs order by ran_at desc limit 1),
  true,
  'a successful run is written to the ledger'
);
select is(
  (select rows_affected from app.cron_runs order by ran_at desc limit 1),
  3,
  'with the number of rows it took'
);

select tests.authenticate_as_service();
select is(
  (select failures_24h::int from public.cron_health('event_content_purge')),
  0,
  'and the runbook view says nothing has failed'
);
select is(
  (select overdue from public.cron_health('event_content_purge')),
  false,
  'nor is it overdue'
);
select is(
  (select overdue from public.cron_health('a-job-that-never-ran')),
  true,
  'while a job that has never run reads as overdue rather than as healthy'
);

-- A second run with nothing to take is a no-op that still records itself.
select is(app.purge_event_content_run(), 0, 'a sweep with nothing to do takes nothing');
select is(
  (select runs_24h::int from public.cron_health('event_content_purge')),
  2,
  'and is still counted, so "it stopped running" is distinguishable from "it found nothing"'
);

select tests.authenticate_as('00000000-0000-0000-0000-00000000e001');
select throws_ok(
  $$select 1 from app.cron_runs limit 1$$,
  '42501', null,
  'the ledger is not a client''s to read'
);


-- ============================================================== E-21 (D-057)
-- Being at an event must not require having said you were going to it. The
-- hotel room has been protected from that inversion since D-002; the event
-- room was not.
select tests.authenticate_as_service();
select tests.lease_event('tm-solo', now() - interval '30 minutes', now() + interval '2 hours');

-- e005 has joined nothing at all.
select is(
  (select count(*)::int from public.event_memberships m
    where m.user_id = '00000000-0000-0000-0000-00000000e005'),
  0,
  'E-21: the account under test has declared for no event'
);

-- One token, kept, so the replay below is genuinely the *same* token rather
-- than a second one minted to look like it.
create temporary table e21 as
  select tests.event_token('00000000-0000-0000-0000-00000000e005', 'tm-solo', 'onsale') as token;

select results_eq(
  $$select outcome from public.record_event_presence_from_selection(
      '00000000-0000-0000-0000-00000000e005', (select token from e21),
      41.0435, 28.9976, 41.0435, 28.9976, 10)$$,
  $$values ('IN_RANGE'::text)$$,
  'E-21: a live check succeeds from a selection token with no membership'
);

select is(
  (select count(*)::int from public.event_memberships m
    where m.user_id = '00000000-0000-0000-0000-00000000e005'),
  0,
  'E-21: and it created no membership behind their back'
);

select is(
  (select count(*)::int from public.event_presence_checks pc
    where pc.user_id = '00000000-0000-0000-0000-00000000e005' and pc.within_range),
  1,
  'E-21: exactly one live answer was written'
);

select is(
  (select room from public.user_event_focus f
    where f.user_id = '00000000-0000-0000-0000-00000000e005'),
  'EVENT_HERE_NOW',
  'E-21: and the focus is the live room, not the declared one'
);

-- Replay: the same token again is safe, idempotent, and adds nothing.
select results_eq(
  $$select outcome from public.record_event_presence_from_selection(
      '00000000-0000-0000-0000-00000000e005', (select token from e21),
      41.0435, 28.9976, 41.0435, 28.9976, 10)$$,
  $$values ('IN_RANGE'::text)$$,
  'E-21: replaying the same token gives the same answer rather than an error'
);

select is(
  (select count(*)::int from public.event_presence_checks pc
    where pc.user_id = '00000000-0000-0000-0000-00000000e005'),
  1,
  'E-21: and still exactly one presence row after the replay'
);

select is(
  (select count(*)::int from public.events e where e.provider_event_id = 'tm-solo'),
  1,
  'E-21: one canonical subject, however many times the token is used'
);

-- A refusal must leave nothing behind. 900 m of accuracy is D-055a's example.
select results_eq(
  $$select outcome from public.record_event_presence_from_selection(
      '00000000-0000-0000-0000-00000000e006',
      tests.event_token('00000000-0000-0000-0000-00000000e006', 'tm-solo', 'onsale'),
      41.0435, 28.9976, 41.0435, 28.9976, 900)$$,
  $$values ('LOCATION_INACCURATE'::text)$$,
  'E-21: a 900 m fix is refused here exactly as it is on the membership path'
);

select is(
  (select count(*)::int from public.event_presence_checks pc
    where pc.user_id = '00000000-0000-0000-0000-00000000e006'),
  0,
  'E-21: a refused check writes no presence row'
);

select is(
  (select count(*)::int from public.event_memberships m
    where m.user_id = '00000000-0000-0000-0000-00000000e006'),
  0,
  'E-21: and no membership'
);

-- Somebody else's token is not a key.
select throws_ok(
  $$select 1 from public.record_event_presence_from_selection(
      '00000000-0000-0000-0000-00000000e004',
      tests.event_token('00000000-0000-0000-0000-00000000e005', 'tm-solo', 'onsale'),
      41.0435, 28.9976, 41.0435, 28.9976, 10)$$,
  'P0002', null,
  'E-21: a token belonging to somebody else is refused'
);

select tests.authenticate_as('00000000-0000-0000-0000-00000000e001');
select throws_ok(
  $$select 1 from public.record_event_presence_from_selection(
      '00000000-0000-0000-0000-00000000e001', gen_random_uuid(),
      41.0435, 28.9976, 41.0435, 28.9976, 10)$$,
  '42501', null,
  'E-21: and a client cannot call it directly at all'
);

-- ============================================================== N-07 (D-057)
select tests.authenticate_as('00000000-0000-0000-0000-00000000e001');
-- This suite's members are premium, so the premium ceiling is what it reports.
select results_eq(
  $$select "limit", used, remaining, is_premium from public.google_checkin_entitlement()$$,
  $$values (10, 0, 10, true)$$,
  'N-07: an account is told its ceiling, its spend and what is left'
);

select tests.authenticate_as_service();
select is(
  (select app.google_find_allowance('00000000-0000-0000-0000-00000000e001')),
  10,
  'N-07: and the ceiling it reports is the one the charge itself uses, not a copy'
);
select tests.authenticate_as('00000000-0000-0000-0000-00000000e001');

select ok(
  (select resets_at from public.google_checkin_entitlement()) > now(),
  'N-07: and when the allowance comes back, as an instant rather than a duration'
);

select ok(
  (select resets_at from public.google_checkin_entitlement())
    = date_trunc('month', now()) + interval '1 month',
  'N-07: which is the UTC month boundary the charge itself is keyed on'
);

select tests.authenticate_as_anon();
select throws_ok(
  $$select 1 from public.google_checkin_entitlement()$$,
  '42501', null,
  'N-07: anonymous callers read nobody''s entitlement'
);

select * from finish(true);
rollback;
