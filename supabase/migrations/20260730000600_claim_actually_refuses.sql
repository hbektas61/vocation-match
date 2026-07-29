-- The claim has to refuse, and the first version did not.
--
-- It guarded the increment (`used` stopped at the allowance) but then tested
-- `used <= allowance`, which is still true at the ceiling — so the call after
-- the last one was told yes. A counter that cannot say no is not a ceiling.
--
-- The test now *is* the increment: the UPDATE carries `used < allowance` in its
-- WHERE, so a refusal is the row not matching, and the row lock makes that
-- decision atomic between concurrent callers.

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
  -- Make sure this month's row exists, and let a changed allowance take
  -- effect without a deploy.
  insert into app.metered_calls (service, period, used, allowance)
  values (p_service, v_period, 0, p_allowance)
  on conflict (service, period) do update
     set allowance = excluded.allowance,
         updated_at = now();

  update app.metered_calls m
     set used = m.used + 1,
         updated_at = now()
   where m.service = p_service
     and m.period = v_period
     and m.used < m.allowance
  returning m.used into v_used;

  if v_used is null then
    -- Nothing matched, so the allowance is gone. Report what is left rather
    -- than raising: the screen has three other ways to answer (D-052).
    return query
      select false,
             coalesce(
               (select greatest(m.allowance - m.used, 0)
                  from app.metered_calls m
                 where m.service = p_service and m.period = v_period),
               0
             );
    return;
  end if;

  return query select true, greatest(p_allowance - v_used, 0);
end;
$$;

comment on function public.claim_metered_call(text, integer) is
  'D-052: claims one paid call, atomically, and refuses at the ceiling. service_role only.';

revoke all on function public.claim_metered_call(text, integer) from public, anon, authenticated;
grant execute on function public.claim_metered_call(text, integer) to service_role;
