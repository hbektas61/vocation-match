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
 *   event_content.venue_*      where a *concert hall* is, leased from
 *                              Ticketmaster with an expiry (D-056 §10). It is
 *                              a published address of a public building, it is
 *                              needed to measure 500 m against, it is
 *                              unreachable by any client, and it is purged
 *                              when the lease ends or a takedown arrives.
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
               and c.column_name like 'dest\_%')
      and not (c.table_name = 'event_content'
               and c.column_name in ('venue_latitude', 'venue_longitude'))),
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

-- The event venue's two guards, the same shape as the destination box's.
select is(
  (select count(*)::int from information_schema.table_privileges
    where table_schema = 'app' and table_name = 'event_content'
      and grantee in ('anon', 'authenticated')),
  0,
  'the leased event venue coordinate is unreachable by any client'
);
select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'app' and table_name = 'event_content'
      and column_name = 'expires_at' and is_nullable = 'NO'),
  1,
  'and every row of it has to expire'
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

-- ------------------------- 4. nothing location-derived is exposed to a client
-- D-055a. The cell is not a coordinate, which is exactly why it needs its own
-- assertion: a column called `geohash` or `h3_index` would sail past the
-- coordinate check above while being the same disclosure. The rule is by
-- *shape of name*, so a future one is caught before it is granted.
select is(
  (select coalesce(string_agg(
            g.table_name || '.' || g.column_name || ' → ' || g.grantee, ', '), '')
     from information_schema.column_privileges g
     join information_schema.columns c
       on c.table_schema = g.table_schema
      and c.table_name = g.table_name
      and c.column_name = g.column_name
    where g.table_schema in ('public', 'app')
      and g.grantee in ('anon', 'authenticated')
      and (
        g.column_name ~* '(cell|geohash|^h3|_h3|s2_|region_point|region_cell|viewport|bbox|bounding)'
        or c.udt_name in ('geography', 'geometry')
      )),
  '',
  'no location-derived column is granted to any client'
);

select is(
  (select coalesce(string_agg(t.table_name || ' → ' || t.grantee, ', '), '')
     from information_schema.table_privileges t
    where t.table_schema = 'app'
      and t.table_name in ('venue_region_contributors', 'venue_region_tally',
                           'instance_secret', 'search_sessions', 'provider_events')
      and t.grantee in ('anon', 'authenticated')),
  '',
  'and the tables behind it are closed to clients outright'
);

-- No API function hands one back either, whatever it is called.
select is(
  (select coalesce(string_agg(p.proname, ', '), '')
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and pg_get_function_result(p.oid) ~* '(cell|geohash|h3|region_point|viewport|bbox)'
      and exists (
        select 1 from aclexplode(p.proacl) a
         where a.privilege_type = 'EXECUTE'
           and (a.grantee = 0 or pg_get_userbyid(a.grantee) in ('authenticated', 'anon'))
      )),
  '',
  'and no client-callable function returns one'
);

-- ---------------------------------- 5. a contribution is not a location record
select bag_eq(
  $$select column_name::text from information_schema.columns
     where table_schema = 'app' and table_name = 'venue_region_contributors'$$,
  $$values ('venue_id'::text),('contributor_key')$$,
  'a contribution holds a venue and an irreversible key — no user id, no cell, no clock'
);
select bag_eq(
  $$select column_name::text from information_schema.columns
     where table_schema = 'app' and table_name = 'venue_region_tally'$$,
  $$values ('venue_id'::text),('cell_key'),('contributions')$$,
  'and the cell counts are aggregated at venue level, with nobody named'
);
-- The one pairing that survives, and why.
--
-- `search_sessions` holds the viewport of the town somebody is *searching in*,
-- beside their user id. That is a place they typed and are looking at on
-- screen — a stated intention, not an observation of where they were — and it
-- is deleted within a day. Every other pairing is forbidden, which is what
-- makes this one an exemption rather than a precedent: it is named here, and
-- anything else appearing fails.
select is(
  (select coalesce(string_agg(distinct a.table_schema || '.' || a.table_name, ', '), '')
     from information_schema.columns a
     join information_schema.columns b
       on a.table_schema = b.table_schema and a.table_name = b.table_name
    where a.table_schema in ('public', 'app')
      and a.column_name = 'user_id'
      and b.column_name ~* '(cell|geohash|h3|latitude|longitude|region_point)'
      and a.table_name <> 'search_sessions'),
  '',
  'no table pairs a user id with an observed location, and the one intent-shaped exception is named'
);
select is(
  (select count(*)::int from information_schema.tables
    where table_schema = 'app' and table_name = 'venue_region_votes'),
  0,
  'the old shape, which did pair them, is gone'
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
