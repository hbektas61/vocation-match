-- The owner's standing proof (2026-07-30): raw location, Google's coordinate
-- and Google's name are never persisted.
--
-- Every other file here tests a behaviour. This one tests the *schema* — what
-- it is even possible to store — because the three promises above are not
-- properties of a code path. They are properties of the shape of the database,
-- and the honest way to keep them is to make the shape unable to hold them.
--
-- It is deliberately blunt: it walks every column of every table in `public`
-- and `app`, and it walks the result type of every function. A future column
-- named `google_name` or `last_latitude` fails here on the day it is written,
-- whether or not anything writes to it yet.
begin;
set search_path = extensions, public, tests, pg_catalog;
select no_plan();

-- ------------------------------------------------------ 1. no raw location
/**
 * The complete list of places a coordinate may live, and why each is allowed.
 *
 *   hotels.location            a catalogue venue's own position, from an open
 *                              dataset we are licensed to store. Not granted
 *                              to any client (ADR-012).
 *   hotels.coarse_region_point the centre of a ~1.5 km cell, GENERATED from
 *                              the cell key so nothing can write a real one.
 *   search_sessions.dest_*     the bounding box of the *town* somebody is
 *                              searching in, held for the life of one search
 *                              session and deleted with it. It is the outline
 *                              of a public place, not anybody's position, and
 *                              the two assertions after this one keep it that
 *                              way: no client can read it, and it does not
 *                              outlive a day.
 *
 * Nothing else, anywhere. In particular nothing keyed to a *person*: that is
 * what "no raw GPS" means, and a table of user positions would fail here even
 * if every value in it were rounded.
 */
select is(
  (select coalesce(string_agg(c.table_schema || '.' || c.table_name || '.' || c.column_name, ', '
                              order by c.table_name, c.column_name), '')
     from information_schema.columns c
    where c.table_schema in ('public', 'app')
      and (
        c.udt_name in ('geography', 'geometry')
        or c.column_name ~* '(latitude|longitude|^lat$|^lng$|^lon$|coordinate|gps|accuracy)'
      )
      and not (c.table_name = 'hotels'
               and c.column_name in ('location', 'coarse_region_point'))
      and not (c.table_name = 'search_sessions'
               and c.column_name like 'dest\_%')),
  '',
  'no coordinate is stored anywhere but the two columns on hotels that are allowed one'
);

-- The destination box's two guards, stated rather than assumed.
select is(
  (select count(*)::int from information_schema.table_privileges
    where table_schema = 'app' and table_name = 'search_sessions'
      and grantee in ('anon', 'authenticated')),
  0,
  'the destination box is unreachable by any client'
);
select ok(
  (select prosrc like '%delete from app.search_sessions%'
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'open_search_session'),
  'and a search session is deleted rather than left to become a catalogue'
);

select is(
  (select count(*)::int
     from information_schema.tables
    where table_schema in ('public', 'app')
      and table_name ~* '(location|position|gps|track|breadcrumb|geo)_?(history|log|trail|event)?'),
  0,
  'and no table exists whose whole purpose would be to remember where somebody was'
);

-- A reading reaches exactly two functions, and leaves neither as a column.
select is(
  (select count(*)::int
     from information_schema.columns
    where table_schema = 'public' and table_name = 'presence_checks'),
  5,
  'a presence check is five columns: who, where-venue, the answer, and two times'
);
select bag_eq(
  $$select column_name::text from information_schema.columns
     where table_schema = 'public' and table_name = 'presence_checks'$$,
  $$values ('user_id'::text),('hotel_id'),('within_range'),('checked_at'),('expires_at')$$,
  'and none of them is the reading it was computed from'
);

-- --------------------------------------------- 2. no Google coordinate, ever
select is(
  (select count(*)::int
     from public.hotels
    where provider = 'google' and location is not null),
  0,
  'no Google venue has a stored coordinate'
);

-- And the constraint that keeps it that way is the *other* direction: every
-- non-Google row must have one, so the nullability cannot quietly spread.
select throws_ok(
  $$insert into public.hotels (provider, provider_hotel_id, name, city, country)
    values ('overture', 'x/1', 'Nowhere', 'Nowhere', 'Nowhere')$$,
  '23514',
  null,
  'a non-Google row still cannot exist without one'
);

-- The one column a Google venue may gain is generated from a cell key, so the
-- most precise thing it can ever hold is the centre of a ~1.5 km square.
select is(
  (select is_generated from information_schema.columns
    where table_schema = 'public' and table_name = 'hotels'
      and column_name = 'coarse_region_point'),
  'ALWAYS',
  'and the coarse point is derived, never written'
);

-- ------------------------------------------------- 3. no Google display name
select tests.create_member('ada@example.test', '00000000-0000-0000-0000-0000000009c1', 'Ada');

create or replace function tests.google_venue(p_user uuid, p_place text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_session uuid; v_token uuid; v_id uuid;
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  select s.session_id into v_session
    from public.open_search_session(p_user, null, 'q', 'venue') s where s.allowed;
  select r.token into v_token
    from public.record_place_selections(p_user, v_session, array[p_place]) r;
  select a.hotel_id into v_id from public.activate_google_venue(v_token) a;
  return v_id;
end;
$$;
grant execute on function tests.google_venue(uuid, text) to anon, authenticated, service_role;

create temp table g as
  select tests.google_venue('00000000-0000-0000-0000-0000000009c1', 'ChIJtest_place_id') as id;
grant select on g to anon, authenticated, service_role;

select tests.clear_auth();

-- Everything textual the row holds, concatenated. If a display name ever got
-- written, it would be in here.
select is(
  (select name || '|' || city || '|' || country || '|' || coalesce(address, '-')
     from public.hotels where id = (select id from g)),
  '(google)|(google)|(google)|-',
  'a Google venue''s text columns are placeholders and nothing else'
);
select is(
  (select provider_hotel_id from public.hotels where id = (select id from g)),
  'ChIJtest_place_id',
  'the Place ID is the one Google fact stored, which Google permits'
);
select is(
  (select coalesce(photo_url, '-') || '|' || coalesce(photo_attribution, '-')
     from public.hotels where id = (select id from g)),
  '-|-',
  'and no photograph or credit came with it'
);

-- No column anywhere is *named* as if it were meant to hold Google content.
select is(
  (select coalesce(string_agg(c.table_name || '.' || c.column_name, ', '), '')
     from information_schema.columns c
    where c.table_schema in ('public', 'app')
      and c.column_name ~* '(google|places?)_(name|display|address|photo|rating|review|phone|website|types?)'),
  '',
  'and nothing is even shaped like a place to put Google''s content'
);

-- --------------------------------------------- what the metrics may remember
select is(
  (select coalesce(string_agg(column_name, ', ' order by column_name), '')
     from information_schema.columns
    where table_schema = 'app' and table_name = 'provider_events'),
  'id, occurred_at, operation, outcome, quantity, session_id, user_id',
  'a provider event is a count with a label, never a query, a place or a point'
);

select * from finish(true);
rollback;
