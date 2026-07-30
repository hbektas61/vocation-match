-- E-015 — the lease is swept on a clock, and the sweep is watchable.
--
-- `purge_event_content()` and the takedown path existed and were tested; what
-- did not exist was anything that *calls* the sweep. Expired rows were never
-- served — `event_content()` refuses them — so this was tidiness rather than a
-- leak, but a lease nobody collects is a promise nobody keeps: §10.1 says
-- expired provider content is removed, not merely ignored.
--
-- Four things this file is careful about:
--
--   1. **Idempotent.** Applying this migration twice must leave one job, not
--      two. `cron.schedule` is upsert-by-name on pg_cron 1.4+, but the
--      unschedule below makes that true regardless of version — and makes the
--      intent readable rather than inferred.
--
--   2. **Watchable.** A cron job that fails silently is worse than no cron
--      job, because the runbook then says "it runs hourly" and the data says
--      otherwise. Every run writes a row: when, whether it worked, how many
--      rows it took, and the error if it did not.
--
--   3. **Incapable of collateral damage.** The sweep can only reach
--      `app.event_content`. It has no path to an event identity, a membership,
--      a swipe, a match, a message, a block or a report — and the test asserts
--      that by counting all of them across a purge.
--
--   4. **Applies where there is no scheduler.** The test container has neither
--      pg_cron nor pg_net. The function is what the tests prove; the schedule
--      is deployment, and its absence must not fail a migration.

-- ---------------------------------------------------------------- the ledger
create table app.cron_runs (
  id            bigserial   primary key,
  job           text        not null,
  ran_at        timestamptz not null default now(),
  ok            boolean     not null,
  rows_affected integer     not null default 0,
  /** The message only. A stack trace is not something to keep for a month. */
  error_text    text,

  constraint cron_runs_job check (char_length(job) between 3 and 60)
);

comment on table app.cron_runs is
  'E-015: one row per scheduled run. What the runbook reads to answer "is it still running, and is it working".';

create index cron_runs_job_time on app.cron_runs (job, ran_at desc);

alter table app.cron_runs enable row level security;
revoke all on table app.cron_runs from anon, authenticated;

-- ----------------------------------------------------------------- the sweep
/**
 * One purge run: sweep the lease, and record what happened either way.
 *
 * Returns the number of rows removed. Never raises — a scheduled job that
 * throws is a job pg_cron will keep retrying into the same failure, and the
 * useful record of that is a row here rather than a line in a log nobody
 * reads.
 */
create or replace function app.purge_event_content_run()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer := 0;
begin
  -- Housekeeping first, so the ledger cannot grow without bound. A month is
  -- long enough to notice a job that stopped and short enough to stay small.
  delete from app.cron_runs r where r.ran_at < now() - interval '30 days';

  -- The one thing it may touch. `purge_event_content(null)` removes exactly
  -- what has expired or been asked to go, and nothing else — it has no join
  -- to a membership, a match or a message to remove them through.
  v_rows := public.purge_event_content(null);

  insert into app.cron_runs (job, ok, rows_affected)
  values ('event_content_purge', true, coalesce(v_rows, 0));

  return coalesce(v_rows, 0);
exception when others then
  insert into app.cron_runs (job, ok, rows_affected, error_text)
  values ('event_content_purge', false, 0, left(sqlerrm, 500));
  return 0;
end;
$$;

revoke all on function app.purge_event_content_run() from public, anon, authenticated;
grant execute on function app.purge_event_content_run() to service_role;

/**
 * What the runbook asks: has it run recently, and is it working?
 *
 * Deliberately a small, boring shape. An operator checking on a cron job at
 * two in the morning wants four numbers, not a query to write.
 */
create or replace function public.cron_health(p_job text default 'event_content_purge')
returns table (
  job              text,
  last_run_at      timestamptz,
  last_ok          boolean,
  last_error       text,
  runs_24h         bigint,
  failures_24h     bigint,
  rows_purged_24h  bigint,
  /** True when the last run is older than two hours — hourly plus a grace. */
  overdue          boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with recent as (
    select * from app.cron_runs r where r.job = p_job and r.ran_at > now() - interval '24 hours'
  ),
  latest as (
    select * from app.cron_runs r where r.job = p_job order by r.ran_at desc limit 1
  )
  select p_job,
         (select ran_at from latest),
         (select ok from latest),
         (select error_text from latest),
         (select count(*) from recent),
         (select count(*) from recent where not ok),
         (select coalesce(sum(rows_affected), 0) from recent),
         coalesce((select ran_at from latest) < now() - interval '2 hours', true);
$$;

revoke all on function public.cron_health(text) from public, anon, authenticated;
grant execute on function public.cron_health(text) to service_role;

-- --------------------------------------------------------------- the schedule
-- Idempotent by construction: unschedule whatever is there under this name,
-- then schedule once. Applying this migration a second time leaves one job.
do $$
begin
  create extension if not exists pg_cron;

  begin
    perform cron.unschedule('event-content-purge');
  exception when others then
    -- No such job yet. That is the first-install case, not an error.
    null;
  end;

  perform cron.schedule(
    'event-content-purge',
    -- Hourly, on the hour. The shortest lease in §7.1 is fifteen minutes, so
    -- an hourly sweep means a row lives at most about an hour past its expiry
    -- — and is never *served* in that hour, because `event_content()` refuses
    -- anything expired regardless of whether it has been collected yet.
    '0 * * * *',
    'select app.purge_event_content_run()');
exception when others then
  raise notice 'pg_cron unavailable here; schedule event-content-purge on the host.';
end $$;

notify pgrst, 'reload schema';
