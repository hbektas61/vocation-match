-- Vocation Match — up to nine ordered photos instead of one.
--
-- `profiles.photo_path` stays, and stays authoritative for the discovery card:
-- it is now *derived*, always equal to the photo in slot 1. Keeping it
-- means the card, the cleanup worker, the read policy and every existing test
-- carry on working unchanged, and it gives the whole change a single invariant
-- to hold rather than a second source of truth to keep in step.
--
-- Everything that already protects one photo protects all nine, because they
-- are the same objects in the same bucket under the same owner prefix: the
-- unguessable path, the private read policy, the EXIF strip on the client, the
-- size and MIME limits, and the cleanup queue.

create table public.profile_photos (
  user_id    uuid     not null references public.profiles (id) on delete cascade,
  -- Slot 1 is the primary photo. Contiguous by construction: removing one
  -- closes the gap, so there is never a hole for a client to reason about.
  -- Named `slot` rather than `position`, which is a reserved word in SQL.
  slot   smallint not null check (slot between 1 and 9),
  path       text     not null,
  created_at timestamptz not null default now(),
  -- Deferrable, so a reorder can be one statement. Rewriting the order in
  -- place otherwise trips the uniqueness of `(user_id, slot)` halfway through,
  -- and the obvious workaround — shuffling everything out to high numbers
  -- first — is not available either, because the range check below is a CHECK
  -- constraint and those cannot be deferred at all.
  constraint profile_photos_pkey primary key (user_id, slot) deferrable initially immediate,
  -- One row per object. Without this the same object could sit in two slots
  -- and removing one slot would enqueue an object the other still shows.
  unique (path)
);

comment on table public.profile_photos is
  'Up to nine ordered photos per profile. Slot 1 is the primary and is '
  'mirrored into profiles.photo_path, which is what a discovery card reads.';

alter table public.profile_photos enable row level security;
-- Forced, so the table's owner is bound by its own policies too. The security
-- baseline insists on it for every public table, which is what caught this.
alter table public.profile_photos force row level security;

-- Readable only by its owner. Nobody else ever sees the *set*: a card carries
-- the primary path and nothing more, so the number of photos somebody has is
-- not a fact other guests can collect.
create policy profile_photos_owner_reads on public.profile_photos
  for select to authenticated
  using (user_id = app.require_user());

-- No client write policy at all. Every change goes through the functions
-- below, which is what keeps ownership checked against the caller's identity
-- rather than against an argument.
revoke all on table public.profile_photos from anon, authenticated;
grant select on table public.profile_photos to authenticated;

create index profile_photos_by_owner on public.profile_photos (user_id, slot);

-- Existing photos become slot 1, so nobody loses the photo they have.
insert into public.profile_photos (user_id, slot, path)
select p.id, 1, p.photo_path
  from public.profiles p
 where p.photo_path is not null
on conflict do nothing;

-- ------------------------------------------------------------------ helpers

/**
 * Re-derives `profiles.photo_path` from slot 1.
 *
 * The one invariant this migration rests on. Called at the end of every
 * function that touches the set, rather than each of them remembering.
 */
create function app.sync_primary_photo(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles p
     set photo_path = (
           select pp.path from public.profile_photos pp
            where pp.user_id = p_user and pp.slot = 1
         )
   where p.id = p_user;
end;
$$;

/** Refuses a path the caller does not own, or one with no object behind it. */
create function app.assert_photo_usable(p_user uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.photo_owner(p_path) is distinct from p_user then
    raise exception 'That photo is not yours.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'profile-photos' and o.name = p_path
  ) then
    raise exception 'That photo was not uploaded.' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------- the set

create function public.own_profile_photos()
returns table (slot smallint, path text)
language sql
security definer
set search_path = ''
as $$
  select pp.slot, pp.path
    from public.profile_photos pp
   where pp.user_id = app.require_user()
   order by pp.slot;
$$;

revoke all on function public.own_profile_photos() from public, anon;
grant execute on function public.own_profile_photos() to authenticated, service_role;

/**
 * Appends a photo at the first free slot.
 *
 * Returns the whole set rather than the one row, because the caller's next act
 * is always to redraw the grid, and a second round trip to find out what it
 * now looks like is a chance for the two to disagree.
 */
create function public.add_profile_photo(p_path text)
returns table (slot smallint, path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_user();
  v_next smallint;
begin
  perform app.assert_photo_usable(v_user, p_path);
  -- Same budget as the single-photo path had, and for the same reason: enough
  -- for anyone editing a profile, not enough to grow the cleanup queue in a loop.
  perform app.rate_limit(v_user, 'profile_photo', 20, interval '1 hour');

  select coalesce(max(pp.slot), 0) + 1 into v_next
    from public.profile_photos pp where pp.user_id = v_user;

  if v_next > 9 then
    raise exception 'That is nine photos already.' using errcode = '23514';
  end if;

  insert into public.profile_photos (user_id, slot, path)
  values (v_user, v_next, p_path);

  perform app.sync_primary_photo(v_user);
  return query select pp.slot, pp.path from public.profile_photos pp
                where pp.user_id = v_user order by pp.slot;
end;
$$;

revoke all on function public.add_profile_photo(text) from public, anon;
grant execute on function public.add_profile_photo(text) to authenticated, service_role;

/**
 * Removes one slot, closes the gap, and hands the object to the cleanup queue.
 *
 * Idempotent on a slot that is already empty: a retry after a dropped response
 * must not read as a failure.
 */
create function public.remove_profile_photo(p_slot smallint)
returns table (slot smallint, path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_user();
  v_path text;
begin
  perform app.rate_limit(v_user, 'profile_photo', 20, interval '1 hour');

  select pp.path into v_path
    from public.profile_photos pp
   where pp.user_id = v_user and pp.slot = p_slot;

  if v_path is not null then
    delete from public.profile_photos pp
     where pp.user_id = v_user and pp.slot = p_slot;

    -- The object outlives the row until the worker gets to it; leaving it
    -- unqueued is how a private bucket fills with things nothing points at.
    insert into public.storage_cleanup_queue (bucket_id, object_name, reason)
    values ('profile-photos', v_path, 'REMOVED');

    -- Close the gap so slots stay contiguous.
    update public.profile_photos pp
       set slot = pp.slot - 1
     where pp.user_id = v_user and pp.slot > p_slot;

    perform app.sync_primary_photo(v_user);
  end if;

  return query select pp.slot, pp.path from public.profile_photos pp
                where pp.user_id = v_user order by pp.slot;
end;
$$;

revoke all on function public.remove_profile_photo(smallint) from public, anon;
grant execute on function public.remove_profile_photo(smallint) to authenticated, service_role;

/**
 * Sets the order from a complete list of the caller's own paths.
 *
 * A full list rather than a move-this-there instruction, because the client
 * already knows the order it wants and a partial instruction has to be applied
 * against a set that may have changed underneath it. Anything missing from the
 * list is refused rather than deleted: reordering is not a way to remove.
 */
create function public.reorder_profile_photos(p_paths text[])
returns table (slot smallint, path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := app.require_user();
  v_count integer;
begin
  perform app.rate_limit(v_user, 'profile_photo', 20, interval '1 hour');

  select count(*) into v_count from public.profile_photos pp where pp.user_id = v_user;

  if coalesce(array_length(p_paths, 1), 0) <> v_count then
    raise exception 'That is not the whole set.' using errcode = '23514';
  end if;

  if exists (
    select 1 from unnest(p_paths) as wanted(path)
     where not exists (
       select 1 from public.profile_photos pp
        where pp.user_id = v_user and pp.path = wanted.path)
  ) then
    raise exception 'That photo is not yours.' using errcode = '42501';
  end if;

  -- One statement, with uniqueness checked at the end of it rather than row by
  -- row. Every intermediate state is therefore allowed to be inconsistent; the
  -- final one is not.
  set constraints public.profile_photos_pkey deferred;

  update public.profile_photos pp
     set slot = wanted.ordinality::smallint
    from unnest(p_paths) with ordinality as wanted(path, ordinality)
   where pp.user_id = v_user and pp.path = wanted.path;

  set constraints public.profile_photos_pkey immediate;

  perform app.sync_primary_photo(v_user);
  return query select pp.slot, pp.path from public.profile_photos pp
                where pp.user_id = v_user order by pp.slot;
end;
$$;

revoke all on function public.reorder_profile_photos(text[]) from public, anon;
grant execute on function public.reorder_profile_photos(text[]) to authenticated, service_role;
