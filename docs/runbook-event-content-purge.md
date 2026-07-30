# Runbook — the event-content sweep

**Job:** `event-content-purge` · hourly, on the hour · pg_cron
**Runs:** `select app.purge_event_content_run()`
**Owner-facing question it answers:** is Ticketmaster Event Content still being
collected when its lease ends?

## What it does, and what it cannot do

It removes rows from `app.event_content` that have **expired** or that a
takedown has **flagged** (`purge_requested_at`). That is all it can reach.

It has no path to an event identity, a membership, a swipe, a match, a message,
a block or a report — `purge_event_content()` deletes from one table and joins
to `public.events` only to find rows by provider id. `supabase/tests/024_events.sql`
counts all seven of those tables across a sweep and fails if any number moves.

Expired content is never *served* whether or not it has been collected:
`public.event_content()` filters on `expires_at > now()` and
`purge_requested_at is null`. So a missed sweep is untidiness, not a disclosure.

## Is it healthy?

```sql
select * from public.cron_health('event_content_purge');
```

| column | what it means |
| --- | --- |
| `last_run_at` | when it last ran at all |
| `last_ok` | whether that run succeeded |
| `last_error` | the message, when it did not |
| `runs_24h` | how many times it ran in the last day (expect ~24) |
| `failures_24h` | how many of those failed (expect 0) |
| `rows_purged_24h` | how much it collected |
| `overdue` | **true** when the last run is more than two hours old |

`overdue` is the one to alert on. It is deliberately true for a job that has
never run, so "the schedule was never installed" and "the schedule stopped" look
the same to whoever is checking — because they need the same response.

`runs_24h` distinguishes the two failure modes that look identical from the
data alone: **it stopped running** (`runs_24h` near zero) versus **it ran and
found nothing** (`runs_24h` ≈ 24, `rows_purged_24h` = 0). The second is normal.

## When it is overdue

1. **Is the schedule there at all?**

   ```sql
   select jobid, jobname, schedule, active
     from cron.job where jobname = 'event-content-purge';
   ```

   Absent means the migration applied somewhere without `pg_cron` — the
   migration says so in a notice rather than failing, because the test
   container has no scheduler and must still be able to apply it. Re-create it:

   ```sql
   select cron.schedule('event-content-purge', '0 * * * *',
                        'select app.purge_event_content_run()');
   ```

   Safe to run repeatedly: the name is the key.

2. **Is it running and failing?**

   ```sql
   select ran_at, ok, rows_affected, error_text
     from app.cron_runs
    where job = 'event_content_purge'
    order by ran_at desc limit 20;
   ```

   The function never raises — a scheduled job that throws is one pg_cron
   retries into the same failure — so a failure is a row with `ok = false` and
   the message. If `app.cron_runs` is empty while `cron.job` has the entry, the
   job is failing *before* the function body: check `cron.job_run_details`.

3. **Run it by hand.** It is idempotent; running it out of band is safe.

   ```sql
   select app.purge_event_content_run();
   ```

## Turning it off

Deliberately not a feature flag: there is no product reason to stop collecting
a lease. If it must be paused for an incident,

```sql
update cron.job set active = false where jobname = 'event-content-purge';
```

and put it back the same way. While it is off, expired content accumulates and
is still never served; nothing else changes.

## Applying the migration twice

It unschedules by name before it schedules, so a second application leaves one
job rather than two. `supabase/scripts/verify-migration-replay.sh` applies every
migration two ways on every run, so a change that broke this would fail the
gate.
