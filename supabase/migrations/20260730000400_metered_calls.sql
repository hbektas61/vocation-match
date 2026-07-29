-- D-052: the counter that makes the ceiling real.
--
-- A budget alarm tells you afterwards; it does not stop anything. So the
-- month's allowance lives here, is claimed transactionally before any paid
-- call leaves the building, and refuses once it is spent. The Cloud daily
-- quota sits under it as the second wall, and the app keeps working when both
-- are reached — the catalogue, the written search and the cell owe nobody
-- money.
--
-- The ceiling is deliberately below the free tier rather than at it, because
-- our count and Google's will not agree to the request.

create table app.metered_calls (
  service    text        not null,
  -- The month this row governs, as its first day.
  period     date        not null,
  used       integer     not null default 0 constraint metered_calls_used check (used >= 0),
  allowance  integer     not null constraint metered_calls_allowance check (allowance > 0),
  updated_at timestamptz not null default now(),

  constraint metered_calls_pkey primary key (service, period)
);

comment on table app.metered_calls is
  'D-052: the monthly allowance for a paid provider, claimed before the call rather than counted after it.';

alter table app.metered_calls enable row level security;
-- No client reaches this table. The functions below are the only doors, and
-- both are definer-owned.
revoke all on table app.metered_calls from anon, authenticated;

/**
 * Claims one call, or refuses.
 *
 * Returns whether the caller may proceed, plus what is left, so a screen can
 * say "the extra search is unavailable this month" honestly rather than
 * failing at the provider.
 */
create or replace function app.claim_metered_call(
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

  -- A refused claim shows as "used did not move", which is what the guard
  -- above guarantees when the allowance is gone.
  return query
    select v_used <= p_allowance,
           greatest(p_allowance - v_used, 0);
end;
$$;

revoke all on function app.claim_metered_call(text, integer) from public, anon, authenticated;
grant execute on function app.claim_metered_call(text, integer) to service_role;

/** What is left this month, for a screen that wants to explain itself. */
create or replace function public.metered_remaining(p_service text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select greatest(m.allowance - m.used, 0)
       from app.metered_calls m
      where m.service = p_service
        and m.period = date_trunc('month', now())::date),
    -- No row yet means nothing has been spent this month.
    2147483647
  );
$$;

revoke all on function public.metered_remaining(text) from public, anon;
grant execute on function public.metered_remaining(text) to authenticated, service_role;
