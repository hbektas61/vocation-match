-- Vocation Match — let a deleted account actually delete.
--
-- Found by the owner's own account, not by any test: hosted Supabase now
-- refuses direct SQL deletes on storage tables ("Direct deletion from
-- storage tables is not allowed. Use the Storage API instead."), and
-- `app.queue_photo_cleanup`'s DELETE branch did exactly that, so
-- `delete_my_account` failed with 42501 for any account that had ever
-- uploaded a photo. The local test container has no such guard, which is
-- why 411 green assertions said otherwise.
--
-- The fix is to stop pretending the database owns the object rows at all.
-- The trigger now only records each object in `storage_cleanup_queue`; the
-- existing service-role worker (`scripts/drain-storage-cleanup.js`) deletes
-- through the storage API, which removes the metadata row and the bytes in
-- one supported motion. Nothing becomes readable in the gap: every read of
-- a profile photo goes through `app.may_view_photo`, and with the owner's
-- profile row gone it answers false for everyone.

create or replace function app.queue_photo_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_object record;
begin
  if tg_op = 'DELETE' then
    -- The profile is gone, so nobody is left to call the storage API. Record
    -- every object under this user's prefix for the worker; the rows stay
    -- until the storage API removes them, unreadable the whole time.
    for v_object in
      select o.name
        from storage.objects o
       where o.bucket_id = 'profile-photos'
         and app.photo_owner(o.name) = old.id
    loop
      insert into public.storage_cleanup_queue (bucket_id, object_name, reason)
      values ('profile-photos', v_object.name, 'PROFILE_DELETED');
    end loop;

    return old;
  end if;

  -- Replaced or cleared. The client removes the object itself, which deletes
  -- the bytes as well; this row is the backstop for when it does not get that
  -- far, and draining it twice is harmless.
  if old.photo_path is not null and old.photo_path is distinct from new.photo_path then
    insert into public.storage_cleanup_queue (bucket_id, object_name, reason)
    values ('profile-photos', old.photo_path,
            case when new.photo_path is null then 'REMOVED' else 'REPLACED' end);
  end if;

  return new;
end;
$$;

comment on function app.queue_photo_cleanup() is
  'Queues photo objects for the storage-API worker. Never deletes from '
  'storage.objects directly: hosted Postgres forbids it, and the worker''s '
  'API delete removes row and bytes together.';
