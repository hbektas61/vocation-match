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

with attempted as (
  delete from public.profiles
   where id = '00000000-0000-0000-0000-0000000000a1'
  returning 1
)
select is((select count(*)::int from attempted), 0,
  'another signed-in user cannot delete the profile row');

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
