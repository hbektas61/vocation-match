-- The claim has to be reachable by the one caller that needs it.
--
-- `app` is deliberately not exposed through PostgREST, which is right for the
-- table but wrong for the function: the backend reaches it as service_role
-- over the same REST layer. So the function moves to `public` and stays shut
-- to everybody but service_role — exactly the arrangement
-- `upsert_hotel_from_provider` already uses. The table stays unexposed.

drop function app.claim_metered_call(text, integer);

create or replace function public.claim_metered_call(
  p_service   text,
  p_allowance integer
)
returns table (allowed boolean, remaining integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period date := date_trunc('month', now())::date;
  v_used   integer;
begin
  insert into app.metered_calls as m (service, period, used, allowance)
  values (p_service, v_period, 1, p_allowance)
  on conflict (service, period) do update
     -- The claim and the test are one statement, so two callers at the
     -- ceiling cannot both be told yes.
     set used = case when m.used < m.allowance then m.used + 1 else m.used end,
         allowance = excluded.allowance,
         updated_at = now()
  returning m.used into v_used;

  return query
    select v_used <= p_allowance,
           greatest(p_allowance - v_used, 0);
end;
$$;

comment on function public.claim_metered_call(text, integer) is
  'D-052: claims one paid call before it leaves the building. service_role only — no client may spend the allowance directly.';

revoke all on function public.claim_metered_call(text, integer) from public, anon, authenticated;
grant execute on function public.claim_metered_call(text, integer) to service_role;
