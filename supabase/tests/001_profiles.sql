-- N-002 — profile ownership, 18+ enforcement, and RLS isolation.
begin;
set search_path = extensions, public, tests, pg_catalog;
select no_plan();

select tests.create_user('ada@example.test',  '00000000-0000-0000-0000-0000000000a1');
select tests.create_user('brut@example.test', '00000000-0000-0000-0000-0000000000b1');

-- ---------------------------------------------------------------- 18+ rule
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');

select throws_ok(
  $$insert into public.profiles (id, display_name, birthdate)
    values ('00000000-0000-0000-0000-0000000000a1', 'Too Young', current_date - interval '17 years')$$,
  '23514',
  'Vocation Match is 18+ only.',
  'a user under 18 cannot create a profile (server-side, not just the client gate)'
);

select lives_ok(
  $$insert into public.profiles (id, display_name, birthdate, bio)
    values ('00000000-0000-0000-0000-0000000000a1', 'Ada', current_date - interval '18 years', 'hi')$$,
  'a user who turns 18 today can create a profile'
);

select throws_ok(
  $$update public.profiles set birthdate = current_date - interval '10 years'
     where id = '00000000-0000-0000-0000-0000000000a1'$$,
  '23514',
  'Vocation Match is 18+ only.',
  'an existing profile cannot be edited below 18'
);

-- ---------------------------------------------------------------- interests
-- The column is free text chosen by the person it belongs to, which is exactly
-- the shape of field that becomes a place to put a payload if nothing bounds it.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');

select lives_ok(
  $$update public.profiles set interests = array['Coffee','Long walks']
     where id = '00000000-0000-0000-0000-0000000000a1'$$,
  'a handful of interests can be saved'
);

select throws_ok(
  $$update public.profiles
       set interests = array['a','b','c','d','e','f']
     where id = '00000000-0000-0000-0000-0000000000a1'$$,
  '23514',
  null,
  'more than five interests is refused by the database, not only by the client'
);

select throws_ok(
  $$update public.profiles
       set interests = array[repeat('x', 25)]
     where id = '00000000-0000-0000-0000-0000000000a1'$$,
  '23514',
  null,
  'an over-long interest is refused'
);

select throws_ok(
  $$update public.profiles set interests = array['   ']
     where id = '00000000-0000-0000-0000-0000000000a1'$$,
  '23514',
  null,
  'a blank interest is refused'
);

select throws_ok(
  $$update public.profiles set interests = array[null]::text[]
     where id = '00000000-0000-0000-0000-0000000000a1'$$,
  '23514',
  null,
  'a null interest is refused'
);

select is(
  (select interests from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'),
  array['Coffee','Long walks'],
  'a refused write leaves the stored list untouched'
);

-- ------------------------------------------------------------ ownership
select throws_ok(
  $$insert into public.profiles (id, display_name, birthdate)
    values ('00000000-0000-0000-0000-0000000000b1', 'Impostor', current_date - interval '30 years')$$,
  '42501',
  null,
  'a user cannot create a profile owned by someone else'
);

select is(
  (select count(*)::int from public.profiles),
  1,
  'the owner sees exactly their own profile row'
);

-- ------------------------------------------------------- isolation from B
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');

select is(
  (select count(*)::int from public.profiles
    where id = '00000000-0000-0000-0000-0000000000a1'),
  0,
  'another signed-in user cannot read the profile row (birthdate stays private)'
);

with attempted as (
  update public.profiles set display_name = 'Hacked'
   where id = '00000000-0000-0000-0000-0000000000a1'
  returning 1
)
select is((select count(*)::int from attempted), 0,
  'another signed-in user cannot update the profile row');

-- Nobody deletes a profile row directly any more, their own included: the
-- grant is gone entirely and `delete_my_account()` is the only path, because
-- a direct delete left the auth row behind (see 20260725001700).
select throws_ok(
  $$delete from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'$$,
  '42501',
  null,
  'a signed-in user cannot delete a profile row at all — not another person''s, and not their own');

-- ------------------------------------------------------ PostgREST upsert
-- The app never speaks plain INSERT or UPDATE: `saveOwnProfile` goes
-- through PostgREST's upsert, whose conflict arm writes `SET id =
-- excluded.id, ...` — every payload column including the key. This is the
-- statement shape that failed the first real onboarding on hosted Supabase
-- with 42501 while every plain-statement test stayed green, so the shape
-- itself is pinned here.
select tests.create_user('upsy@example.test', '00000000-0000-0000-0000-000000000091');
select tests.authenticate_as('00000000-0000-0000-0000-000000000091');

select lives_ok(
  $$insert into public.profiles (id, display_name, birthdate, bio)
    values ('00000000-0000-0000-0000-000000000091', 'First save',
            (current_date - interval '30 years')::date, null)
    on conflict (id) do update
      set id = excluded.id, display_name = excluded.display_name,
          birthdate = excluded.birthdate, bio = excluded.bio$$,
  'the upsert''s insert arm works for a first-time profile'
);

select lives_ok(
  $$insert into public.profiles (id, display_name, birthdate, bio)
    values ('00000000-0000-0000-0000-000000000091', 'Second save',
            (current_date - interval '30 years')::date, null)
    on conflict (id) do update
      set id = excluded.id, display_name = excluded.display_name,
          birthdate = excluded.birthdate, bio = excluded.bio$$,
  'and its conflict arm — the one that also sets id — works for a re-save'
);

select is(
  (select display_name from public.profiles
    where id = '00000000-0000-0000-0000-000000000091'),
  'Second save',
  'the re-save actually landed'
);

-- The id grant must not become a way to claim somebody else's row.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select throws_ok(
  $$insert into public.profiles (id, display_name, birthdate, bio)
    values ('00000000-0000-0000-0000-000000000091', 'Hijack',
            (current_date - interval '30 years')::date, null)
    on conflict (id) do update
      set id = excluded.id, display_name = excluded.display_name,
          birthdate = excluded.birthdate, bio = excluded.bio$$,
  '42501',
  null,
  'upserting onto another person''s row is refused outright'
);

-- ----------------------------------------------------------------- anon
select tests.authenticate_as_anon();

select throws_ok(
  $$select count(*) from public.profiles$$,
  '42501',
  null,
  'the logged-out role cannot read profiles at all'
);

-- ------------------------------------------------------------- cascade
select tests.clear_auth();

delete from auth.users where id = '00000000-0000-0000-0000-0000000000a1';

select is(
  (select count(*)::int from public.profiles
    where id = '00000000-0000-0000-0000-0000000000a1'),
  0,
  'deleting the auth user removes the profile'
);

-- --------------------------------------------------------------- helpers
select ok(app.is_adult((current_date - interval '18 years')::date),
  'app.is_adult() accepts exactly 18');
select ok(not app.is_adult((current_date - interval '18 years' + interval '1 day')::date),
  'app.is_adult() rejects one day short of 18');
select is(app.age_years((current_date - interval '31 years')::date), 31,
  'app.age_years() derives a coarse age without exposing the birthdate');

select * from finish(true);
rollback;
