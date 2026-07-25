-- H-201, H-202, H-206 — deleting your own account.
--
-- Two things have to be true at once, and they pull in opposite directions:
-- everything that is *yours* has to go, and the record that you were reported
-- has to stay. A test that only checked the first would pass on a function that
-- quietly erased the moderation trail.
begin;
set search_path = extensions, public, tests, pg_catalog;
select no_plan();

select tests.create_member('ada@example.test', '00000000-0000-0000-0000-0000000000a1', 'Ada');
select tests.create_member('bo@example.test',  '00000000-0000-0000-0000-0000000000b1', 'Bo');
select tests.create_member('cem@example.test', '00000000-0000-0000-0000-0000000000c1', 'Cem');
select tests.create_hotel('Bosphorus Grand', 41.0369, 28.9850);

create or replace function tests.hotel_id(p_name text) returns uuid
language sql stable as $$ select id from public.hotels where name = p_name $$;
grant execute on function tests.hotel_id(text) to anon, authenticated;

create or replace function tests.join_upcoming(p_user uuid) returns void
language plpgsql as $$
begin
  perform tests.authenticate_as(p_user);
  perform public.set_active_hotel(tests.hotel_id('Bosphorus Grand'));
  perform public.declare_upcoming_stay(current_date + 1, current_date + 4);
end;
$$;
grant execute on function tests.join_upcoming(uuid) to anon, authenticated;

select tests.join_upcoming('00000000-0000-0000-0000-0000000000a1');
select tests.join_upcoming('00000000-0000-0000-0000-0000000000b1');
select tests.join_upcoming('00000000-0000-0000-0000-0000000000c1');

-- Ada and Bo match and talk. Cem reports Ada, and a moderator actions it.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select public.swipe('00000000-0000-0000-0000-0000000000b1', 'UPCOMING', 'LIKE');
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select public.swipe('00000000-0000-0000-0000-0000000000a1', 'UPCOMING', 'LIKE');

select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select public.set_profile_photo(null);

select tests.clear_auth();
insert into storage.objects (bucket_id, name, owner)
values ('profile-photos', '00000000-0000-0000-0000-0000000000a1/adax9wz2m4vb8ntr6ha1cd5e.jpg',
        '00000000-0000-0000-0000-0000000000a1');

select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select public.set_profile_photo('00000000-0000-0000-0000-0000000000a1/adax9wz2m4vb8ntr6ha1cd5e.jpg');
insert into public.messages (match_id, sender_id, body)
select m.id, '00000000-0000-0000-0000-0000000000a1', 'Hello from Ada'
  from public.matches m limit 1;

select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
insert into public.messages (match_id, sender_id, body)
select m.id, '00000000-0000-0000-0000-0000000000b1', 'Hello back'
  from public.matches m limit 1;

select tests.authenticate_as('00000000-0000-0000-0000-0000000000c1');
select public.report_user('00000000-0000-0000-0000-0000000000a1', 'HARASSMENT', 'made me uncomfortable');

select tests.authenticate_as_service();
select public.resolve_report(
  (select id from public.reports where reported_id = '00000000-0000-0000-0000-0000000000a1'),
  'ACTIONED', 'suspended pending review');

-- ------------------------------------------------------ there is no argument
select is(
  (select coalesce(array_length(p.proargnames, 1), 0)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'delete_my_account'),
  0,
  'delete_my_account takes no arguments, so there is no id for a caller to tamper with');

select tests.authenticate_as_anon();
select throws_ok(
  $$select public.delete_my_account()$$,
  '42501',
  null,
  'a logged-out caller cannot even execute it');

select tests.authenticate_without_claims();
select throws_ok(
  $$select public.delete_my_account()$$,
  '28000',
  'Sign in to continue.',
  'and a token with no subject is told to sign in, not that something broke');

-- ------------------------------- and no second way to delete your own data
-- Before the audit, a table-wide DELETE grant on `profiles` let a client wipe
-- everything with one PostgREST call — no confirmation, no rate limit, and the
-- auth row left behind so the account stayed registered and signed in.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok(
  $$delete from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'$$,
  '42501',
  null,
  'a client cannot delete its own profile row directly — delete_my_account is the only path');

select is(
  (select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'),
  1,
  'and the row is still there');

-- ------------------------------------------ a suspended account can still leave
-- Ada was suspended by the moderator above. Being suspended is a limit on
-- reaching other people, not a reason to trap someone in the product.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select ok(
  (select suspended_at is not null from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'),
  'ada is suspended before deleting');

select lives_ok(
  $$select public.delete_my_account()$$,
  'a suspended account can still delete itself');

-- ------------------------------------------------------------ what went away
select tests.clear_auth();

select is(
  (select count(*)::int from auth.users where id = '00000000-0000-0000-0000-0000000000a1'),
  0,
  'the auth row is gone — the account cannot sign in again');

select is(
  (select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'),
  0,
  'and the profile with it');

select is(
  (select count(*)::int from public.user_active_hotel
    where user_id = '00000000-0000-0000-0000-0000000000a1'),
  0,
  'the active hotel is gone');

select is(
  (select count(*)::int from public.upcoming_stays
    where user_id = '00000000-0000-0000-0000-0000000000a1'),
  0,
  'the declared stay is gone');

select is(
  (select count(*)::int from public.swipes
    where actor_id = '00000000-0000-0000-0000-0000000000a1'
       or target_id = '00000000-0000-0000-0000-0000000000a1'),
  0,
  'every swipe, in both directions, is gone');

select is(
  (select count(*)::int from public.matches),
  0,
  'the match is gone — which also removes it from the other person''s inbox, the honest consequence of deleting a two-sided record');

select is(
  (select count(*)::int from public.messages),
  0,
  'and the conversation with it, rather than leaving a deleted person''s words in somebody else''s app');

select is(
  (select count(*)::int from public.rate_limits
    where user_id = '00000000-0000-0000-0000-0000000000a1'),
  0,
  'the rate-limit counters are gone');

select is(
  (select count(*)::int from storage.objects
    where name like '00000000-0000-0000-0000-0000000000a1/%'),
  0,
  'the photo object row is gone, so nothing can read it');

select is(
  (select reason from public.storage_cleanup_queue
    where object_name = '00000000-0000-0000-0000-0000000000a1/adax9wz2m4vb8ntr6ha1cd5e.jpg'),
  'PROFILE_DELETED',
  'and its bytes are queued for the one delete a database cannot do itself');

-- ------------------------------------------------------------- what stayed
select is(
  (select count(*)::int from public.reports),
  1,
  'the report about ada survives — deleting an account is not a way to erase it');

select is(
  (select reported_id from public.reports),
  null,
  'anonymised rather than removed');

select is(
  (select reporter_id from public.reports),
  '00000000-0000-0000-0000-0000000000c1'::uuid,
  'and the person who filed it is untouched');

select is(
  (select count(*)::int from public.moderation_actions where action = 'SUSPENDED'),
  1,
  'the moderation decision survives too');

-- ------------------------------------------------------- everyone else is fine
select is(
  (select count(*)::int from public.profiles),
  2,
  'the other two accounts are untouched');

select is(
  (select hotel_id from public.user_active_hotel
    where user_id = '00000000-0000-0000-0000-0000000000b1'),
  tests.hotel_id('Bosphorus Grand'),
  'bo still has their hotel');

-- ----------------------------------------------------- a second call is honest
-- The client's session is still valid for a few minutes after the auth row
-- goes, so this is a real state a retry can reach.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok(
  $$select public.delete_my_account()$$,
  'P0002',
  'That account no longer exists.',
  'deleting twice says so rather than silently reporting success');

select * from finish(true);
rollback;
