-- H-101..H-106 — profile photos in a private bucket.
--
-- What matters here is not that an upload works. It is that the four ways a
-- photo could leak are all closed: an arbitrary URL, an anonymous read, a read
-- by someone who is not in the room, and a write under someone else's prefix.
begin;
set search_path = extensions, public, tests, pg_catalog;
select no_plan();

select tests.create_member('ada@example.test', '00000000-0000-0000-0000-0000000000a1', 'Ada');
select tests.create_member('bo@example.test',  '00000000-0000-0000-0000-0000000000b1', 'Bo');
select tests.create_member('cem@example.test', '00000000-0000-0000-0000-0000000000c1', 'Cem');
select tests.create_member('dee@example.test', '00000000-0000-0000-0000-0000000000d1', 'Dee');

select tests.create_hotel('Bosphorus Grand', 41.0369, 28.9850);
select tests.create_hotel('Galata Rooms',    41.0256, 28.9744, 'Istanbul');

create or replace function tests.hotel_id(p_name text) returns uuid
language sql stable as $$ select id from public.hotels where name = p_name $$;
grant execute on function tests.hotel_id(text) to anon, authenticated;

create or replace function tests.join_upcoming(p_user uuid, p_hotel text) returns void
language plpgsql as $$
begin
  perform tests.authenticate_as(p_user);
  perform public.set_active_hotel(tests.hotel_id(p_hotel));
  perform public.declare_upcoming_stay(current_date + 1, current_date + 4);
end;
$$;
grant execute on function tests.join_upcoming(uuid, text) to anon, authenticated;

-- Ada, Bo and Dee share a hotel and a room. Cem is at the other hotel.
select tests.join_upcoming('00000000-0000-0000-0000-0000000000a1', 'Bosphorus Grand');
select tests.join_upcoming('00000000-0000-0000-0000-0000000000b1', 'Bosphorus Grand');
select tests.join_upcoming('00000000-0000-0000-0000-0000000000d1', 'Bosphorus Grand');
select tests.join_upcoming('00000000-0000-0000-0000-0000000000c1', 'Galata Rooms');

-- ------------------------------------------------------- there is no URL left
select hasnt_column('public', 'profiles', 'photo_url',
  'profiles.photo_url is gone — there is nowhere left to put a URL (D-014)');

-- One named exception (2026-07-27): hotels.photo_url is a public catalogue
-- image with a licence credit, not user content — D-014 is about *people's*
-- photos never living behind a stable URL. Anything else matching is still
-- a failure.
select bag_eq(
  $$select table_name || '.' || column_name
     from information_schema.columns
    where table_schema = 'public'
      and column_name ~* '(photo_url|image_url|avatar_url|picture_url)'$$,
  $$values ('hotels.photo_url'::text)$$,
  'and no table but the hotel catalogue grew one');

-- The client may still write its own row, but not the photo: `photo_path` is
-- set only through `set_profile_photo`, which checks the object exists.
select bag_eq(
  $$select column_name::text
      from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'profiles'
       and grantee = 'authenticated' and privilege_type = 'UPDATE'$$,
  $$values ('id'::text),('display_name'),('bio'),('birthdate'),('interests'),
           ('gender_identity'),('show_gender'),('orientations'),('show_orientation'),('show_me')$$,
  -- `id` is in the list because PostgREST's upsert sets every payload column
  -- including the key (001 pins the shape); the update policy's with-check
  -- keeps it worthless as a way into anyone else's row.
  'the updatable column list still excludes suspended_at — dropping a column did not re-open it — and no longer includes photo_path');

select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok(
  $$update public.profiles
       set photo_path = '00000000-0000-0000-0000-0000000000a1/qk3x9wz2m4vb8ntr6ha1cd5e.jpg'
     where id = '00000000-0000-0000-0000-0000000000a1'$$,
  '42501',
  null,
  'a client cannot set its own photo_path directly — the column grant is gone, so a path with nothing behind it cannot be written');

-- ------------------------------------------------------------- the path rule
-- Written as the owning role: what is under test here is the constraint, and
-- the grant above already proved a client cannot reach this statement at all.
select tests.clear_auth();

select lives_ok(
  $$update public.profiles
       set photo_path = '00000000-0000-0000-0000-0000000000a1/qk3x9wz2m4vb8ntr6ha1cd5e.jpg'
     where id = '00000000-0000-0000-0000-0000000000a1'$$,
  'a path under your own id is accepted');

select throws_ok(
  $$update public.profiles
       set photo_path = '00000000-0000-0000-0000-0000000000b1/qk3x9wz2m4vb8ntr6ha1cd5e.jpg'
     where id = '00000000-0000-0000-0000-0000000000a1'$$,
  '23514',
  null,
  'a path under someone else''s id is refused by the constraint, not by the client');

select throws_ok(
  $$update public.profiles
       set photo_path = 'https://tracker.example/beacon.jpg'
     where id = '00000000-0000-0000-0000-0000000000a1'$$,
  '23514',
  null,
  'and a URL is refused outright — this is the beacon the review found');

select throws_ok(
  $$update public.profiles
       set photo_path = '00000000-0000-0000-0000-0000000000a1/avatar.jpg'
     where id = '00000000-0000-0000-0000-0000000000a1'$$,
  '23514',
  null,
  'a guessable filename is refused: a user id is public to everyone in the room, so the second segment has to be the unguessable part');

-- ---------------------------------------------------------------- the bucket
select tests.clear_auth();

select ok(
  not (select public from storage.buckets where id = 'profile-photos'),
  'the bucket is private — there is no permanent public URL for a face');

select is(
  (select allowed_mime_types from storage.buckets where id = 'profile-photos'),
  array['image/jpeg', 'image/png', 'image/webp'],
  'and only accepts image types');

-- --------------------------------------------------------------- who may write
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');

select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('profile-photos', '00000000-0000-0000-0000-0000000000a1/qk3x9wz2m4vb8ntr6ha1cd5e.jpg',
            '00000000-0000-0000-0000-0000000000a1')$$,
  'a user writes under their own prefix');

select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('profile-photos', '00000000-0000-0000-0000-0000000000b1/zzz9wz2m4vb8ntr6ha1cd5e2.jpg',
            '00000000-0000-0000-0000-0000000000a1')$$,
  '42501',
  null,
  'and cannot write under anyone else''s');

-- The `owner` column is written by the storage service and is part of the row
-- being inserted, so a policy that trusted it would be trusting the attacker.
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('profile-photos', '00000000-0000-0000-0000-0000000000b1/ww9wz2m4vb8ntr6ha1cd5e23.jpg',
            '00000000-0000-0000-0000-0000000000b1')$$,
  '42501',
  null,
  'claiming to be the owner in the row does not help — the prefix is compared to the caller');

select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('profile-photos', 'not-a-uuid/qk3x9wz2m4vb8ntr6ha1cd5e.jpg',
            '00000000-0000-0000-0000-0000000000a1')$$,
  '42501',
  null,
  'a path that is not owner-scoped at all is refused');

select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('some-other-bucket', '00000000-0000-0000-0000-0000000000a1/qk3x9wz2m4vb8ntr6ha1cd5f.jpg',
            '00000000-0000-0000-0000-0000000000a1')$$,
  '42501',
  null,
  'the policies grant nothing outside the profile-photos bucket');

-- Bo now has a photo too, for the read tests below.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('profile-photos', '00000000-0000-0000-0000-0000000000b1/bo7x9wz2m4vb8ntr6ha1cd5e.jpg',
            '00000000-0000-0000-0000-0000000000b1')$$,
  'bo uploads their own');

select is(
  (select count(*)::int from storage.objects
    where name = '00000000-0000-0000-0000-0000000000a1/qk3x9wz2m4vb8ntr6ha1cd5e.jpg'
      and bucket_id = 'profile-photos'),
  1,
  'bo can see ada''s object: they are in the same room of the same hotel');

-- Seeing an object and being able to change it are different questions. A
-- DELETE the policy does not match removes zero rows rather than raising, so
-- the assertion that carries the meaning is the count afterwards.
select lives_ok(
  $$delete from storage.objects
     where name = '00000000-0000-0000-0000-0000000000a1/qk3x9wz2m4vb8ntr6ha1cd5e.jpg'$$,
  'bo may issue a delete for ada''s object');

select is(
  (select count(*)::int from storage.objects
    where name = '00000000-0000-0000-0000-0000000000a1/qk3x9wz2m4vb8ntr6ha1cd5e.jpg'),
  1,
  'ada''s object survived bo''s delete');

-- --------------------------------------------------------------- who may read
-- Cem is at the other hotel: same app, different room, no line of sight.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000c1');

select is(
  (select count(*)::int from storage.objects where bucket_id = 'profile-photos'),
  0,
  'someone at a different hotel sees no photos at all');

-- Dee is at the same hotel but has no open room.
select tests.clear_auth();
delete from public.upcoming_stays where user_id = '00000000-0000-0000-0000-0000000000d1';
select tests.authenticate_as('00000000-0000-0000-0000-0000000000d1');

select is(
  (select count(*)::int from storage.objects where bucket_id = 'profile-photos'),
  0,
  'being at the hotel is not enough — the room has to be open, which is the same rule discovery uses');

-- Anonymous.
select tests.authenticate_as_anon();
select is(
  (select count(*)::int from storage.objects where bucket_id = 'profile-photos'),
  0,
  'a logged-out request sees nothing: there is no policy for anon and the bucket is not public');

-- Blocking.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select public.block_user('00000000-0000-0000-0000-0000000000b1');

select is(
  (select count(*)::int from storage.objects
    where name like '00000000-0000-0000-0000-0000000000b1/%'),
  0,
  'a blocked person''s photo disappears for the blocker');

select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select is(
  (select count(*)::int from storage.objects
    where name like '00000000-0000-0000-0000-0000000000a1/%'),
  0,
  'and in the other direction too, without telling anyone a block happened');

select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select public.unblock_user('00000000-0000-0000-0000-0000000000b1');

-- Suspension.
select tests.clear_auth();
update public.profiles set suspended_at = now()
 where id = '00000000-0000-0000-0000-0000000000b1';

select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select is(
  (select count(*)::int from storage.objects
    where name like '00000000-0000-0000-0000-0000000000b1/%'),
  0,
  'a suspended account leaves the room, and its photo leaves with it');

select tests.clear_auth();
update public.profiles set suspended_at = null
 where id = '00000000-0000-0000-0000-0000000000b1';

-- A match keeps the read open after the room closes, because the inbox keeps
-- the conversation — and its avatar — readable.
select tests.clear_auth();
insert into public.matches (user_a, user_b, hotel_id, room)
values (least('00000000-0000-0000-0000-0000000000a1'::uuid, '00000000-0000-0000-0000-0000000000c1'::uuid),
        greatest('00000000-0000-0000-0000-0000000000a1'::uuid, '00000000-0000-0000-0000-0000000000c1'::uuid),
        tests.hotel_id('Bosphorus Grand'), 'UPCOMING');

select tests.authenticate_as('00000000-0000-0000-0000-0000000000c1');
select is(
  (select count(*)::int from storage.objects
    where name like '00000000-0000-0000-0000-0000000000a1/%'),
  1,
  'a match sees the photo even from another hotel');

select tests.clear_auth();
update public.matches set unmatched_at = now()
 where user_a = least('00000000-0000-0000-0000-0000000000a1'::uuid, '00000000-0000-0000-0000-0000000000c1'::uuid);

select tests.authenticate_as('00000000-0000-0000-0000-0000000000c1');
select is(
  (select count(*)::int from storage.objects
    where name like '00000000-0000-0000-0000-0000000000a1/%'),
  1,
  'and still does after unmatching, which is what makes the closed conversation readable');

-- A suspension outranks a match. The conversation history stays readable, but
-- the suspended account's face leaves with the rest of it.
select tests.clear_auth();
update public.profiles set suspended_at = now()
 where id = '00000000-0000-0000-0000-0000000000a1';

select tests.authenticate_as('00000000-0000-0000-0000-0000000000c1');
select is(
  (select count(*)::int from storage.objects
    where name like '00000000-0000-0000-0000-0000000000a1/%'),
  0,
  'a match does not keep a suspended account''s photo visible');

select tests.clear_auth();
update public.profiles set suspended_at = null
 where id = '00000000-0000-0000-0000-0000000000a1';

-- --------------------------------------------------------------- the feed
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select is(
  (select photo_path from public.discovery_feed('UPCOMING')
    where user_id = '00000000-0000-0000-0000-0000000000a1'),
  '00000000-0000-0000-0000-0000000000a1/qk3x9wz2m4vb8ntr6ha1cd5e.jpg',
  'the card carries the object path, which is useless without a signed read');

-- Having already decided on someone takes their photo away too. Otherwise a
-- pass leaves behind a working "are they still checked in?" probe, which is
-- the sort of tracking D-005 exists to prevent.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select is(
  (select count(*)::int from storage.objects
    where name like '00000000-0000-0000-0000-0000000000a1/%'),
  1,
  'bo can still see ada before deciding');

select public.swipe('00000000-0000-0000-0000-0000000000a1', 'UPCOMING', 'PASS');
select is(
  (select count(*)::int from storage.objects
    where name like '00000000-0000-0000-0000-0000000000a1/%'),
  0,
  'and cannot once they have passed — the same filter the deck already applies');

-- --------------------------------------------------- setting the photo
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');

select throws_ok(
  $$select public.set_profile_photo('00000000-0000-0000-0000-0000000000c1/qk3x9wz2m4vb8ntr6ha1cd5e.jpg')$$,
  '42501',
  'That photo is not yours.',
  'you cannot point your profile at somebody else''s object');

select throws_ok(
  $$select public.set_profile_photo('00000000-0000-0000-0000-0000000000a1/neverwasuploaded0000000a.jpg')$$,
  'P0002',
  'That photo was not uploaded.',
  'nor at a path with nothing behind it — which is what made the cleanup queue growable for free');

select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('profile-photos', '00000000-0000-0000-0000-0000000000a1/new4x9wz2m4vb8ntr6ha1cd5.png',
            '00000000-0000-0000-0000-0000000000a1')$$,
  'ada uploads a replacement');

select is(
  (select photo_path from public.set_profile_photo(
     '00000000-0000-0000-0000-0000000000a1/new4x9wz2m4vb8ntr6ha1cd5.png')),
  '00000000-0000-0000-0000-0000000000a1/new4x9wz2m4vb8ntr6ha1cd5.png',
  'and an object that really exists is accepted');

-- ------------------------------------------- the answer does not follow anyone
-- A signed URL is minted by the storage API, which no rate limit can reach, and
-- one request can ask about a whole list of people at once. So the answer must
-- not change as its subject walks in and out of range — otherwise it is a live
-- feed on them, which is the thing D-005 exists to prevent.
select tests.clear_auth();
delete from public.upcoming_stays where user_id = '00000000-0000-0000-0000-0000000000a1';
delete from public.presence_checks where user_id = '00000000-0000-0000-0000-0000000000a1';

select tests.authenticate_as('00000000-0000-0000-0000-0000000000d1');
select tests.clear_auth();
insert into public.upcoming_stays (user_id, hotel_id, start_date, end_date)
values ('00000000-0000-0000-0000-0000000000d1', tests.hotel_id('Bosphorus Grand'),
        current_date + 1, current_date + 4);

select tests.authenticate_as('00000000-0000-0000-0000-0000000000d1');
select is(
  (select count(*)::int from storage.objects
    where name = '00000000-0000-0000-0000-0000000000a1/new4x9wz2m4vb8ntr6ha1cd5.png'),
  1,
  'ada leaving the room does not change the answer about ada''s photo');

select tests.clear_auth();
insert into public.upcoming_stays (user_id, hotel_id, start_date, end_date)
values ('00000000-0000-0000-0000-0000000000a1', tests.hotel_id('Bosphorus Grand'),
        current_date + 1, current_date + 4);

-- The viewer's own eligibility still gates it, because that is their own state
-- and says nothing about anybody else.
select tests.clear_auth();
delete from public.upcoming_stays where user_id = '00000000-0000-0000-0000-0000000000d1';
select tests.authenticate_as('00000000-0000-0000-0000-0000000000d1');
select is(
  (select count(*)::int from storage.objects
    where name = '00000000-0000-0000-0000-0000000000a1/new4x9wz2m4vb8ntr6ha1cd5.png'),
  0,
  'but the viewer''s own room still has to be open');

-- ------------------------------------------------------------------ cleanup
select throws_ok(
  $$select count(*) from public.storage_cleanup_queue$$,
  '42501',
  null,
  'the cleanup queue is invisible to a client');

select tests.authenticate_as_service();
select is(
  (select reason from public.storage_cleanup_queue
    where object_name = '00000000-0000-0000-0000-0000000000a1/qk3x9wz2m4vb8ntr6ha1cd5e.jpg'),
  'REPLACED',
  'replacing a photo queues the old object for a byte-level delete the database cannot do itself');

select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select is(
  (select photo_path from public.set_profile_photo(null)),
  null,
  'clearing the photo is the same call with no path');

select tests.authenticate_as_service();
select is(
  (select reason from public.storage_cleanup_queue
    where object_name = '00000000-0000-0000-0000-0000000000a1/new4x9wz2m4vb8ntr6ha1cd5.png'),
  'REMOVED',
  'and removing one does the same');

-- Twenty an hour is generous for a person and closes the loop that grew the
-- queue for free.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok(
  $$select public.set_profile_photo(null) from generate_series(1, 18)$$,
  'a person changing their mind repeatedly is fine');
select throws_ok(
  $$select public.set_profile_photo(null)$$,
  '54000',
  'You are doing that too often. Try again later.',
  'a script is not: the twenty-first change in an hour is refused');

-- Deleting the profile is the case where no client is left to call the
-- storage API — and the trigger must NOT drop the metadata rows itself:
-- hosted Postgres refuses direct deletes from storage tables (this is what
-- broke the first real account deletion on staging). The rows wait,
-- unreadable, for the worker's storage-API delete.
select tests.clear_auth();
delete from public.profiles where id = '00000000-0000-0000-0000-0000000000b1';

select is(
  (select count(*)::int from storage.objects
    where name like '00000000-0000-0000-0000-0000000000b1/%'),
  1,
  'the object row waits for the storage-API worker rather than being deleted by SQL');

select is(
  (select reason from public.storage_cleanup_queue
    where object_name = '00000000-0000-0000-0000-0000000000b1/bo7x9wz2m4vb8ntr6ha1cd5e.jpg'),
  'PROFILE_DELETED',
  'and records the bytes still to be purged, rather than pretending they are gone');

-- --------------------------------------------------------- draining the queue
-- The queue is a contract with a worker that does not live in this repository.
-- What the database owes it: a batch nobody else is holding, and a way to
-- record that the bytes were reported gone.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok(
  $$select * from public.claim_storage_cleanup(10)$$,
  '42501',
  null,
  'a client cannot claim cleanup work');

select tests.authenticate_as_service();
select ok(
  (select count(*) from public.claim_storage_cleanup(10)) > 0,
  'a service-role worker gets a batch');

select is(
  public.mark_storage_cleanup_purged(
    array(select id from public.storage_cleanup_queue where purged_at is null)),
  (select count(*)::int from public.storage_cleanup_queue where purged_at is null),
  'and marking them purged updates exactly the rows it was given');

select is(
  (select count(*)::int from public.claim_storage_cleanup(10)),
  0,
  'a purged object is not handed out again');

select * from finish(true);
rollback;
