-- N-003 — hotel catalog, provider write boundary, and coordinate secrecy.
begin;
set search_path = extensions, public, tests, pg_catalog;
select no_plan();

select tests.create_member('ada@example.test', '00000000-0000-0000-0000-0000000000a1');
select tests.create_hotel('Bosphorus Grand', 41.0369, 28.9850);
select tests.create_hotel('Galata Rooms',    41.0256, 28.9744);
select tests.create_hotel('Closed Hotel',    41.0100, 28.9700);

update public.hotels set is_active = false where name = 'Closed Hotel';

-- ------------------------------------------------------------ provider feed
select is(
  (select count(*)::int from public.hotels),
  3,
  'the provider entry point created the catalog rows'
);

select is(
  (select count(*)::int
     from public.hotels
    where provider = 'test' and provider_hotel_id = 'Bosphorus Grand'),
  1,
  'a hotel is identified by (provider, provider_hotel_id)'
);

-- Re-running the feed updates in place instead of duplicating.
select tests.create_hotel('Bosphorus Grand', 41.0369, 28.9850, 'Istanbul');
select is(
  (select count(*)::int from public.hotels),
  3,
  're-importing the same hotel updates the cached row rather than duplicating it'
);

select throws_ok(
  $$select tests.create_hotel('Impossible', 91.0, 28.9)$$,
  '23514',
  'Hotel coordinates are out of range.',
  'the provider boundary rejects impossible coordinates'
);

-- ------------------------------------------------------------ client access
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');

select is(
  (select count(*)::int from public.hotels),
  2,
  'a signed-in user sees only active hotels'
);

select throws_ok(
  $$select location from public.hotels limit 1$$,
  '42501',
  null,
  'a signed-in user cannot read hotel coordinates at all'
);

select is(
  (select count(*)::int from public.search_hotels('bosph')),
  1,
  'search_hotels finds a hotel by partial name'
);

select is(
  (select count(*)::int from public.search_hotels('istanbul')),
  2,
  'search_hotels finds hotels by city'
);

select is(
  (select count(*)::int from public.search_hotels('closed')),
  0,
  'search_hotels never returns an inactive hotel'
);

select is(
  (select count(*)::int from public.search_hotels('%')),
  0,
  'a wildcard typed into the search box is treated as a character, not a pattern'
);

select is(
  (select count(*)::int from public.search_hotels('_')),
  0,
  'and so is an underscore'
);

select is(
  (select count(*)::int
     from public.search_hotels('bosph') s
    where s.name is null or s.city is null),
  0,
  'search_hotels returns a usable card for every hit'
);

-- D-037 — the search forgives how people actually type a venue's name.
select is(
  (select count(*)::int from public.search_hotels('bosphorusgrand')),
  1,
  'joined-up words still land (squashed matching)'
);

select is(
  (select count(*)::int from public.search_hotels('bosphorus grand palace')),
  1,
  'one stray word in a multi-word query is forgiven (token matching)'
);

select is(
  (select count(*)::int from public.search_hotels('palace kebab')),
  0,
  'two stray words are a different search, not a fuzzy one'
);

select throws_ok(
  $$select public.upsert_hotel_from_provider('rogue','x','X','Y','ZZ',1,1)$$,
  '42501',
  null,
  'a signed-in user cannot write to the hotel catalog'
);

select throws_ok(
  $$insert into public.hotels (provider, provider_hotel_id, name, city, country, location)
    values ('rogue','x','X','Y','ZZ', st_setsrid(st_makepoint(1,1),4326)::geography)$$,
  '42501',
  null,
  'a signed-in user cannot insert a hotel directly'
);

-- ------------------------------------------------------------------- anon
select tests.authenticate_as_anon();

select throws_ok(
  $$select count(*) from public.hotels$$,
  '42501',
  null,
  'the logged-out role cannot read the catalog'
);

select throws_ok(
  $$select public.search_hotels('bosph')$$,
  '42501',
  null,
  'the logged-out role cannot search the catalog'
);

select * from finish(true);
rollback;
