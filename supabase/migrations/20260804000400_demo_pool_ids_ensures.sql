-- The photo script runs before any deck has been opened, so the id listing
-- itself guarantees the pool exists (service-only, like everything demo).
create or replace function public.demo_pool_ids()
returns setof uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform app.ensure_demo_pool();
  return query
    select r.user_id from (
      select du.user_id, row_number() over (order by du.created_at, du.user_id) rn
        from app.demo_users du) r
     order by r.rn;
end;
$$;

revoke all on function public.demo_pool_ids() from public, anon, authenticated;
grant execute on function public.demo_pool_ids() to service_role;
