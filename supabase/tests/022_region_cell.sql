-- V-010/V-011/V-012 — a venue learns roughly where it is, and nothing learns
-- where anybody was.
--
-- The rules the owner set are mostly *absences*: no raw GPS stored, no Google
-- coordinate stored, no cell on a user row, no cell from a vague reading, no
-- cell a single person can move. An absence is only real if something fails
-- when it stops being true, which is what this file is.
begin;
set search_path = extensions, public, tests, pg_catalog;
select no_plan();

select tests.create_member('ada@example.test',  '00000000-0000-0000-0000-0000000009b1', 'Ada');
select tests.create_member('eda@example.test',  '00000000-0000-0000-0000-0000000009b2', 'Eda');
select tests.create_member('ina@example.test',  '00000000-0000-0000-0000-0000000009b3', 'Ina');
select tests.create_member('ali@example.test',  '00000000-0000-0000-0000-0000000009b4', 'Ali');

create or replace function tests.google_token(p_user uuid, p_place text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session uuid;
  v_token   uuid;
begin
  select s.session_id into v_session
    from public.open_search_session(p_user, null, 'a query', 'venue') s
   where s.allowed;
  select r.token into v_token
    from public.record_place_selections(p_user, v_session, array[p_place]) r;
  return v_token;
end;
$$;
grant execute on function tests.google_token(uuid, text) to anon, authenticated, service_role;

/** Chooses a Google venue as a given member, the way the app does. */
create or replace function tests.take_google_venue(p_user uuid, p_place text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  select a.hotel_id into v_id
    from public.activate_google_venue(tests.google_token(p_user, p_place)) a;
  return v_id;
end;
$$;
grant execute on function tests.take_google_venue(uuid, text) to anon, authenticated, service_role;

-- Alaçatı-ish. Two readings inside one ~1.5 km cell, one clearly outside it.
-- The venue coordinate handed to the check is the same in every call: it is
-- what the edge function resolved, and it is never stored.
create temp table pt as select
  38.2712::double precision as venue_lat, 26.3688::double precision as venue_lng,
  38.2715::double precision as near_lat,  26.3691::double precision as near_lng,
  38.2700::double precision as near2_lat, 26.3670::double precision as near2_lng,
  38.2880::double precision as other_lat, 26.3900::double precision as other_lng;
grant select on pt to anon, authenticated, service_role;

-- All four choose the same Place ID, which is also the D-054 invariant at
-- work: one venue, four members, one room.
create temp table v as select tests.take_google_venue(
  '00000000-0000-0000-0000-0000000009b1', 'gp-cell-biblos') as id;
grant select on v to anon, authenticated, service_role;

select is(
  (select count(distinct x)::int from (
     select tests.take_google_venue('00000000-0000-0000-0000-0000000009b2', 'gp-cell-biblos') as x
     union all
     select tests.take_google_venue('00000000-0000-0000-0000-0000000009b3', 'gp-cell-biblos')
     union all
     select tests.take_google_venue('00000000-0000-0000-0000-0000000009b4', 'gp-cell-biblos')
     union all
     select id from v
   ) t),
  1,
  'four people choosing one Place ID share one venue'
);

-- ------------------------------------------------ before anything is learned
select is(
  (select coarse_region_cell from public.hotels where id = (select id from v)),
  null,
  'a freshly chosen Google venue knows nothing about where it is'
);

select tests.authenticate_as_service();

-- --------------------------------------------- a vague reading teaches nothing
select results_eq(
  $$select outcome from public.record_presence_verified(
      '00000000-0000-0000-0000-0000000009b1',
      (select near_lat from pt), (select near_lng from pt),
      (select venue_lat from pt), (select venue_lng from pt),
      900)$$,
  $$values ('LOCATION_INACCURATE'::text)$$,
  -- D-055a: this used to succeed. A reading whose error is nearly twice the
  -- radius cannot show anybody is inside it, so it is now its own refusal.
  'a fix vaguer than 100 m is refused rather than answered'
);
select is(
  (select coarse_region_cell from public.hotels where id = (select id from v)),
  null,
  'and teaches the venue nothing'
);

-- ------------------------------------------ an out-of-range check teaches nothing
select results_eq(
  $$select within_range from public.record_presence_verified(
      '00000000-0000-0000-0000-0000000009b2',
      (select other_lat from pt), (select other_lng from pt),
      (select venue_lat from pt), (select venue_lng from pt),
      15)$$,
  $$values (false)$$,
  'a reading two kilometres away is out of range'
);
select is(
  (select coarse_region_cell from public.hotels where id = (select id from v)),
  null,
  'and a failed check never says anything about the venue'
);

-- ---------------------------------------------------- a good check establishes it
select results_eq(
  $$select within_range from public.record_presence_verified(
      '00000000-0000-0000-0000-0000000009b1',
      (select near_lat from pt), (select near_lng from pt),
      (select venue_lat from pt), (select venue_lng from pt),
      12)$$,
  $$values (true)$$,
  'a good check at the venue succeeds'
);
select isnt(
  (select coarse_region_cell from public.hotels where id = (select id from v)),
  null,
  'and that is what establishes the venue''s coarse cell'
);
select ok(
  (select coarse_region_cell like 'rcell:%' from public.hotels where id = (select id from v)),
  'which is a cell key, not a coordinate'
);
select is(
  (select coarse_region_cell from public.hotels where id = (select id from v)),
  (select cell_key from app.region_cell_of((select near_lat from pt), (select near_lng from pt))),
  'and it is the cell the reading fell in'
);

-- --------------------------------------- one person cannot move it, ever again
create temp table established as
  select coarse_region_cell as cell from public.hotels where id = (select id from v);
grant select on established to anon, authenticated, service_role;

select lives_ok(
  $$select public.record_presence_verified(
      '00000000-0000-0000-0000-0000000009b1',
      (select other_lat from pt), (select other_lng from pt),
      (select other_lat from pt), (select other_lng from pt),
      5)$$,
  'the same person checks in again, from a different cell'
);
select is(
  (select coarse_region_cell from public.hotels where id = (select id from v)),
  (select cell from established),
  'and cannot move the venue with it — one contribution per person, ever'
);
-- Read as the owner: the vote table is granted to nobody, which is itself
-- asserted further down.
select tests.clear_auth();
select is(
  (select count(*)::int from app.venue_region_contributors
    where venue_id = (select id from v)
      and contributor_key = app.contributor_key(
            (select id from v), '00000000-0000-0000-0000-0000000009b1')),
  1,
  'because the contribution is insert-only'
);
select tests.authenticate_as_service();

-- ------------------------------------------------- an outlier is not accepted
-- A second person, from a different cell, alone. The incumbent has one vote,
-- the rival has one: the rival needs two *and* more, so nothing moves.
select lives_ok(
  $$select public.record_presence_verified(
      '00000000-0000-0000-0000-0000000009b2',
      (select other_lat from pt), (select other_lng from pt),
      (select other_lat from pt), (select other_lng from pt),
      8)$$,
  'a second person contributes a different cell'
);
select is(
  (select coarse_region_cell from public.hotels where id = (select id from v)),
  (select cell from established),
  'and a lone dissenter is an outlier, not a correction'
);

-- ------------------------------------------------- and a real one consolidates
select lives_ok(
  $$select public.record_presence_verified(
      '00000000-0000-0000-0000-0000000009b3',
      (select other_lat from pt), (select other_lng from pt),
      (select other_lat from pt), (select other_lng from pt),
      8)$$,
  'a third person agrees with the second'
);
select is(
  (select coarse_region_cell from public.hotels where id = (select id from v)),
  (select cell_key from app.region_cell_of((select other_lat from pt), (select other_lng from pt))),
  'two distinct people, and strictly more of them, may move it'
);

-- ------------------------------------------------------------ the privacy ledger
select is(
  (select count(*)::int
     from information_schema.columns
    where table_schema = 'app' and table_name = 'venue_region_votes'
      and column_name ~* '(latitude|longitude|accuracy|coordinate|point|geom)'),
  0,
  'the vote table holds no coordinate of any kind'
);
select is(
  (select count(*)::int
     from information_schema.columns
    where table_schema in ('public', 'app')
      and column_name ~* 'coarse_region'
      and table_name <> 'hotels'),
  0,
  'and the cell lives on the venue, never on a user row or an event log'
);
select is(
  (select count(*)::int from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'hotels'
      and column_name in ('coarse_region_cell', 'coarse_region_point')
      and grantee in ('anon', 'authenticated')),
  0,
  'neither column is readable by a client'
);
select is(
  (select is_generated from information_schema.columns
    where table_schema = 'public' and table_name = 'hotels'
      and column_name = 'coarse_region_point'),
  'ALWAYS',
  'the point is generated from the key, so no code path can write a real one'
);

select tests.authenticate_as('00000000-0000-0000-0000-0000000009b1');
select throws_ok(
  $$select coarse_region_cell from public.hotels limit 1$$,
  '42501',
  null,
  'a signed-in member cannot read a venue''s cell'
);
select throws_ok(
  $$select 1 from app.venue_region_contributors limit 1$$,
  '42501',
  null,
  'nor the votes behind it'
);

-- ----------------------------------------------- the cell is not the Here Now
-- The venue's established cell is now two kilometres from the venue the check
-- measures against. If the cell had leaked into the 500 m rule, this would
-- pass; it must fail.
select tests.authenticate_as_service();
select results_eq(
  $$select within_range from public.record_presence_verified(
      '00000000-0000-0000-0000-0000000009b4',
      (select venue_lat from pt), (select venue_lng from pt),
      (select venue_lat from pt), (select venue_lng from pt),
      10)$$,
  $$values (true)$$,
  'Here Now still measures against the resolved venue coordinate'
);
select results_eq(
  $$select within_range from public.record_presence_verified(
      '00000000-0000-0000-0000-0000000009b4',
      (select other_lat from pt), (select other_lng from pt),
      (select venue_lat from pt), (select venue_lng from pt),
      10)$$,
  $$values (false)$$,
  'and standing in the venue''s own coarse cell is not standing at the venue'
);

-- --------------------------------------------------------- V-012, the counts
select ok(
  (select value from public.venue_operations_view()
    where metric = 'here_now_verifications') >= 5,
  'the verifications were counted'
);
select ok(
  (select value from public.venue_operations_view()
    where metric = 'region_cells_formed') >= 1,
  'and so was the moment a venue first learned where it is'
);
select ok(
  (select value from public.venue_operations_view()
    where metric = 'region_cell_outliers_refused') >= 1,
  'and the moment one was refused'
);
select is(
  (select value from public.venue_operations_view()
    where metric = 'google_venues_with_region_cell'),
  1::numeric,
  'the region-pool eligible share is a measured number, not an estimate'
);
select is(
  (select count(*)::int from public.venue_operations_view()
    where metric like '%cost%' or metric like '%estimate%' or metric like '%usd%'),
  0,
  'and nothing in the view is a cost forecast'
);

-- ----------------------------------------------- the boundary, all three sides
select results_eq(
  $$select outcome from public.record_presence_verified(
      '00000000-0000-0000-0000-0000000009b4',
      (select near_lat from pt), (select near_lng from pt),
      (select venue_lat from pt), (select venue_lng from pt),
      99)$$,
  $$values ('IN_RANGE'::text)$$,
  '99 m is accurate enough'
);
select results_eq(
  $$select outcome from public.record_presence_verified(
      '00000000-0000-0000-0000-0000000009b4',
      (select near_lat from pt), (select near_lng from pt),
      (select venue_lat from pt), (select venue_lng from pt),
      101)$$,
  $$values ('LOCATION_INACCURATE'::text)$$,
  '101 m is not'
);
select results_eq(
  $$select outcome from public.record_presence_verified(
      '00000000-0000-0000-0000-0000000009b4',
      (select near_lat from pt), (select near_lng from pt),
      (select venue_lat from pt), (select venue_lng from pt),
      null)$$,
  $$values ('LOCATION_INACCURATE'::text)$$,
  'and a device that will not say is not a device that said yes'
);
-- The refusal wrote nothing: the 99 m answer above is still the stored one.
select results_eq(
  $$select within_range from public.presence_checks
     where user_id = '00000000-0000-0000-0000-0000000009b4'$$,
  $$values (true)$$,
  'a refusal leaves the previous answer exactly as it was'
);

select * from finish(true);
rollback;
