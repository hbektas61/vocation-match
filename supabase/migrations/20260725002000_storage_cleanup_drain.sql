-- Vocation Match — H-403, H-411
-- Making the storage cleanup queue drainable.
--
-- `public.storage_cleanup_queue` has been a record of outstanding work with no
-- way to do it. Two audits have now said the same thing: a deleted photo is
-- unreadable immediately, and its bytes are still there, because only the
-- storage API can remove them and the database cannot call it.
--
-- The database can still do the half that is its own. These two functions are
-- the contract a service-role job works against: claim a batch, delete the
-- bytes through the storage API, mark the batch purged. Nothing here pretends
-- the bytes are gone — `purged_at` is set by the caller, after the fact, and
-- means "somebody told us they did it".
--
-- The job itself is not in this repository. `docs/hosted-setup.md` says so, and
-- says what it has to do.

create or replace function public.claim_storage_cleanup(p_limit integer default 100)
returns table (id uuid, bucket_id text, object_name text, reason text, queued_at timestamptz)
language sql
volatile
security definer
set search_path = ''
as $$
  -- `skip locked` so two workers never hand the same object to the storage API
  -- twice. Deleting an object twice is harmless, but a queue that cannot be run
  -- concurrently is a queue that stops being run at all.
  select q.id, q.bucket_id, q.object_name, q.reason, q.queued_at
    from public.storage_cleanup_queue q
   where q.purged_at is null
   order by q.queued_at
   limit least(greatest(coalesce(p_limit, 100), 1), 1000)
     for update skip locked;
$$;

revoke all on function public.claim_storage_cleanup(integer) from public, anon, authenticated;
grant execute on function public.claim_storage_cleanup(integer) to service_role;

create or replace function public.mark_storage_cleanup_purged(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.storage_cleanup_queue q
     set purged_at = now()
   where q.id = any(p_ids)
     and q.purged_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_storage_cleanup_purged(uuid[]) from public, anon, authenticated;
grant execute on function public.mark_storage_cleanup_purged(uuid[]) to service_role;

comment on function public.claim_storage_cleanup(integer) is
  'Service-role only. Hands a batch of objects to a worker that deletes their '
  'bytes through the storage API; `skip locked` keeps two workers off the same '
  'row. The database cannot do this itself, which is the whole reason the queue '
  'exists.';

comment on function public.mark_storage_cleanup_purged(uuid[]) is
  'Records that a worker reported deleting these objects. It is a report, not '
  'a proof — nothing here can see inside the object store.';
