-- D-054 — the vacation venue is a Google Place ID, and nothing else of
-- Google's.
--
-- The mobile suite proves the screen; this proves the thing the screen cannot:
-- that two people who chose the same place are in the same room, that the row
-- holding that fact contains no Google content, and that the location check
-- still measures the same 500 m when the coordinate arrives from outside the
-- database and is thrown away afterwards.
begin;
set search_path = extensions, public, tests, pg_catalog;
select no_plan();

select tests.create_member('ada@example.test',  '00000000-0000-0000-0000-0000000009a1', 'Ada');
select tests.create_member('eda@example.test',  '00000000-0000-0000-0000-0000000009a2', 'Eda');
select tests.create_member('free@example.test', '00000000-0000-0000-0000-0000000009a3', 'Free');
select tests.set_premium('00000000-0000-0000-0000-0000000009a3', false);

-- A catalogue venue, so the two providers can be compared side by side.
create temp table cat as select tests.create_hotel('Lara Shore', 36.85, 30.79) as id;
grant select on cat to anon, authenticated, service_role;

/**
 * The backend's half of a search: open a session, record what Autocomplete
 * "returned", and hand back one token. Exactly what the edge function does,
 * minus the network.
 */
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

-- ------------------------------------------------------ §8.12 one identity
select tests.authenticate_as('00000000-0000-0000-0000-0000000009a1');
-- Read before anything is chosen, so the §6 assertion below compares against
-- what this account actually started with rather than against a number.
create temp table finds as select public.google_finds_remaining() as before;
grant select on finds to anon, authenticated, service_role;

create temp table ada as
select (select hotel_id from public.activate_google_venue(
          tests.google_token('00000000-0000-0000-0000-0000000009a1', 'gp-venue-biblos'))) as venue;
grant select on ada to anon, authenticated, service_role;

select tests.authenticate_as('00000000-0000-0000-0000-0000000009a2');
create temp table eda as
select (select hotel_id from public.activate_google_venue(
          tests.google_token('00000000-0000-0000-0000-0000000009a2', 'gp-venue-biblos'))) as venue;
grant select on eda to anon, authenticated, service_role;

select is(
  (select venue from eda),
  (select venue from ada),
  'two people who selected the same Place ID share one internal venue'
);

-- ------------------------------------------ §8.13 a name decides nothing
select tests.authenticate_as('00000000-0000-0000-0000-0000000009a2');
select isnt(
  (select hotel_id from public.activate_google_venue(
     tests.google_token('00000000-0000-0000-0000-0000000009a2', 'gp-venue-biblos-marbella'))),
  (select venue from ada),
  'the same display name under a different Place ID is a different venue'
);

-- ------------------------------------------------- §8.14 no duplicate mint
select tests.authenticate_as_service();
select is(
  public.upsert_google_venue('gp-venue-biblos'),
  (select venue from ada),
  'a repeat first-selection resolves to the venue that already exists'
);
select is(
  (select count(*)::int from public.hotels
    where provider = 'google' and provider_hotel_id = 'gp-venue-biblos'),
  1,
  'and the unique key is what guarantees it, in one statement'
);

-- ------------------------------------------------- §8.17/§8.18 what is kept
select is(
  (select name || '|' || city || '|' || country
     from public.hotels where provider_hotel_id = 'gp-venue-biblos'),
  '(google)|(google)|(google)',
  'a Google venue holds a placeholder, never Google''s display name'
);
select is(
  (select location is null and address is null and photo_url is null
     from public.hotels where provider_hotel_id = 'gp-venue-biblos'),
  true,
  'and no coordinate, address or photograph of Google''s'
);
select is(
  (select provider_hotel_id from public.hotels where id = (select venue from ada)),
  'gp-venue-biblos',
  'the Place ID itself is stored, which Google permits'
);

-- The gap is for Google alone: every other provider is as strict as it was.
select throws_ok(
  $$insert into public.hotels (provider, provider_hotel_id, name, city, country)
    values ('osm', 'node/1', 'Nowhere', 'Nowhere', 'Nowhere')$$,
  '23514',
  null,
  'a catalogue row still cannot exist without a coordinate'
);

-- A placeholder must never be findable by name (the D-048 rule, again).
select tests.authenticate_as('00000000-0000-0000-0000-0000000009a1');
select is(
  (select count(*)::int from public.search_venues('google')),
  0,
  'the placeholder is not an answer to a name search'
);

-- --------------------------------------------------- the selection's guard
select tests.authenticate_as('00000000-0000-0000-0000-0000000009a1');
create temp table tok as
select tests.google_token('00000000-0000-0000-0000-0000000009a1', 'gp-venue-before-sunset') as t;
grant select on tok to anon, authenticated, service_role;

select throws_ok(
  $$select * from public.activate_google_venue(gen_random_uuid())$$,
  'P0003',
  'That place selection is not usable.',
  'a token the backend never issued is refused'
);
select tests.authenticate_as('00000000-0000-0000-0000-0000000009a2');
select throws_ok(
  $$select * from public.activate_google_venue((select t from tok))$$,
  'P0003',
  'That place selection is not usable.',
  'and so is somebody else''s token'
);
select tests.authenticate_as('00000000-0000-0000-0000-0000000009a1');
select lives_ok(
  $$select * from public.activate_google_venue((select t from tok))$$,
  'its owner may spend it once'
);
select throws_ok(
  $$select * from public.activate_google_venue((select t from tok))$$,
  'P0003',
  'That place selection is not usable.',
  'and never twice'
);

-- §6: this is the core flow, so it costs no advanced-find entitlement.
select is(
  public.google_finds_remaining(),
  (select before from finds),
  'choosing where you are going spends none of the D-053 allowance'
);

-- ---------------------------------------------- §8.16 switching closes the old
select is(
  (select hotel_id from public.user_active_hotel where user_id = app.current_user_id()),
  (select id from public.hotels where provider_hotel_id = 'gp-venue-before-sunset'),
  'the newest choice is the one active venue'
);
select is(
  (select count(*)::int from public.hotel_activation_events
    where user_id = app.current_user_id() and deactivated_at is null),
  1,
  'and exactly one activation is open, so the previous room closed at once'
);

-- ------------------------------------------------------- §8.20–§8.24 Here Now
-- The catalogue path refuses a venue whose coordinate is not ours, rather than
-- measuring against a null and storing the answer as "not here".
select throws_ok(
  $$select * from public.record_presence_check(38.2661, 26.3799)$$,
  'P0004',
  'That place needs the verified check.',
  'the catalogue check declines a Google venue instead of guessing'
);

select tests.authenticate_as_service();
-- Before Sunset is at 38.2661, 26.3799 — the coordinate the edge function
-- would have resolved a moment earlier and is about to forget. The far
-- reading runs first so the in-range answer is the one left standing for the
-- eligibility assertion below.
select results_eq(
  $$select within_range from public.record_presence_verified(
      '00000000-0000-0000-0000-0000000009a1', 38.3161, 26.3799, 38.2661, 26.3799)$$,
  $$values (false)$$,
  'a reading five kilometres away is outside the radius'
);
select results_eq(
  $$select within_range from public.record_presence_verified(
      '00000000-0000-0000-0000-0000000009a1', 38.2661, 26.3799, 38.2661, 26.3799)$$,
  $$values (true)$$,
  'and one at the venue is inside it'
);
select is(
  (select count(*)::int
     from information_schema.columns
    where table_schema = 'public' and table_name = 'presence_checks'
      and column_name ~* '(latitude|longitude|distance|meters)'),
  0,
  'neither reading is written down — the row holds a decision, not a place'
);

-- D-036 still guards the door, before any location is used. The free member
-- is given a venue first, so the refusal being measured is the entitlement's
-- and not "you have not chosen anywhere yet".
select tests.authenticate_as('00000000-0000-0000-0000-0000000009a3');
select public.activate_google_venue(
  tests.google_token('00000000-0000-0000-0000-0000000009a3', 'gp-venue-biblos'));
select tests.authenticate_as_service();
select throws_ok(
  $$select * from public.record_presence_verified(
      '00000000-0000-0000-0000-0000000009a3', 38.2661, 26.3799, 38.2661, 26.3799)$$,
  'PP001',
  'Here Now is for Premium members.',
  'a free member''s location is not taken for a room they cannot enter'
);

-- §8.24: no declaration was ever made, and the room is open on proximity alone.
select tests.authenticate_as('00000000-0000-0000-0000-0000000009a1');
select is(
  (select count(*)::int from public.upcoming_stays where user_id = app.current_user_id()),
  0,
  'nothing was declared'
);
select results_eq(
  $$select eligible from public.my_rooms() where room = 'HERE_NOW'$$,
  $$values (true)$$,
  'and Here Now is open anyway (D-002)'
);

-- ------------------------------------------- the destination stays backstage
select tests.authenticate_as_service();
create temp table dest as
select s.session_id
  from public.open_search_session(
    '00000000-0000-0000-0000-0000000009a1', null, null, 'destination') s
 where s.allowed;
grant select on dest to anon, authenticated, service_role;

select ok(
  public.set_session_destination(
    '00000000-0000-0000-0000-0000000009a1', (select session_id from dest),
    'gp-dest-alacati', 38.259, 26.353, 38.3, 26.394),
  'the chosen destination''s box is held on the session'
);
select is(
  (select low_latitude from public.session_destination(
     '00000000-0000-0000-0000-0000000009a1', (select session_id from dest))),
  38.259::double precision,
  'and the backend can read it back to scope the venue search'
);
select is(
  (select count(*)::int from public.session_destination(
     '00000000-0000-0000-0000-0000000009a2', (select session_id from dest))),
  0,
  'but never for another user'
);

select tests.authenticate_as('00000000-0000-0000-0000-0000000009a1');
select throws_ok(
  $$select * from public.session_destination(
      '00000000-0000-0000-0000-0000000009a1', gen_random_uuid())$$,
  '42501',
  null,
  'and never for a client, whatever it asks about'
);

select * from finish(true);
rollback;
