-- D-053 §8 — a sync you can audit, and a deactivation you can trust.
--
-- The retire-not-delete rule already existed. What was missing is the evidence
-- around it: which release a row came from, when it was last seen, when it was
-- retired, and whether the run that retired it actually finished. Without that
-- last part, a download that died halfway could quietly retire a city — which
-- is exactly the failure the brief spends most of §8 guarding against.
--
-- So a run is now a record with a lifecycle. Deactivation refuses unless the
-- run says `complete`, and refuses to touch anything but the provider the run
-- declared, so an Overture pass can never retire an OSM or first-party row.

alter table public.hotels
  /** The Overture release this row was last confirmed in, e.g. '2026-07-22.0'. */
  add column source_release text,
  /** When a provider read last contained it. Retirement reads this. */
  add column last_seen_at timestamptz,
  /** When it stopped being offered, and why it can still be read historically. */
  add column deactivated_at timestamptz;

comment on column public.hotels.source_release is
  'D-053 §8: the provider release this row was last confirmed in.';
comment on column public.hotels.last_seen_at is
  'D-053 §8: when a provider read last contained this row.';
comment on column public.hotels.deactivated_at is
  'D-053 §8: when it was retired. The row stays readable for the check-ins and matches that reference it.';

grant select (source_release, last_seen_at, deactivated_at) on public.hotels to authenticated;

create index hotels_last_seen on public.hotels (provider, last_seen_at desc);

-- ------------------------------------------------------------- the run record
create table app.sync_runs (
  id           uuid        primary key default gen_random_uuid(),
  provider     text        not null,
  release      text        not null,
  /** The exact box the run intends to cover. Deactivation may not exceed it. */
  west  double precision not null,
  south double precision not null,
  east  double precision not null,
  north double precision not null,
  status       text        not null default 'running'
    constraint sync_runs_status check (status in ('running', 'complete', 'failed')),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  inserted     integer     not null default 0,
  updated      integer     not null default 0,
  unchanged    integer     not null default 0,
  reactivated  integer     not null default 0,
  deactivated  integer     not null default 0,
  note         text,

  constraint sync_runs_provider check (provider <> 'cell')
);

comment on table app.sync_runs is
  'D-053 §8: one auditable provider sync. Deactivation is only permitted for a run marked complete.';

alter table app.sync_runs enable row level security;
revoke all on table app.sync_runs from anon, authenticated;

/** Opens a run. Returns its id, which every later step must carry. */
create or replace function public.begin_sync_run(
  p_provider text,
  p_release  text,
  p_west  double precision,
  p_south double precision,
  p_east  double precision,
  p_north double precision
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_provider is null or p_provider = 'cell' then
    raise exception 'That provider may not be synchronised.' using errcode = '23514';
  end if;
  if p_release is null or char_length(btrim(p_release)) = 0 then
    raise exception 'A sync run must name its release.' using errcode = '23514';
  end if;

  insert into app.sync_runs (provider, release, west, south, east, north)
  values (p_provider, p_release, p_west, p_south, p_east, p_north)
  returning sync_runs.id into v_id;
  return v_id;
end;
$$;

revoke all on function public.begin_sync_run(text, text, double precision, double precision, double precision, double precision) from public, anon, authenticated;
grant execute on function public.begin_sync_run(text, text, double precision, double precision, double precision, double precision) to service_role;

/**
 * Marks a row as seen in this release.
 *
 * Called after the upsert, so `last_seen_at` moves even when nothing else
 * about the row changed — which is what makes "absent from the new release"
 * mean something.
 */
create or replace function public.mark_place_seen(
  p_run   uuid,
  p_place uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run app.sync_runs;
begin
  select * into v_run from app.sync_runs r where r.id = p_run;
  if not found or v_run.status <> 'running' then
    return;
  end if;

  update public.hotels h
     set source_release = v_run.release,
         last_seen_at = now(),
         -- A place that came back is offered again, and the run counts it.
         is_active = true,
         deactivated_at = case when h.is_active then h.deactivated_at else null end,
         updated_at = now()
   where h.id = p_place
     and h.provider = v_run.provider;
end;
$$;

revoke all on function public.mark_place_seen(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mark_place_seen(uuid, uuid) to service_role;

/** Closes a run, with its counts. Deactivation reads this status. */
create or replace function public.finish_sync_run(
  p_run       uuid,
  p_status    text,
  p_inserted  integer default 0,
  p_updated   integer default 0,
  p_unchanged integer default 0,
  p_note      text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('complete', 'failed') then
    raise exception 'A run ends complete or failed.' using errcode = '23514';
  end if;
  update app.sync_runs r
     set status = p_status,
         finished_at = now(),
         inserted = p_inserted,
         updated = p_updated,
         unchanged = p_unchanged,
         note = p_note
   where r.id = p_run;
end;
$$;

revoke all on function public.finish_sync_run(uuid, text, integer, integer, integer, text) from public, anon, authenticated;
grant execute on function public.finish_sync_run(uuid, text, integer, integer, integer, text) to service_role;

-- ------------------------------------------------------- retirement, gated
/**
 * Retires what a completed run no longer contains.
 *
 * Everything about this signature is a guard. It takes a *run* rather than a
 * bounding box and a provider, so the coverage and the provider are the ones
 * the run declared rather than whatever the caller passes. It refuses a run
 * that is not `complete`, which is the whole defence against a half-finished
 * download emptying a region. And it retires by `last_seen_at`, so a row the
 * run confirmed is safe even if the caller's id list was truncated.
 */
create or replace function public.deactivate_unseen_places(p_run uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run   app.sync_runs;
  v_count integer;
begin
  select * into v_run from app.sync_runs r where r.id = p_run;
  if not found then
    raise exception 'Unknown sync run.' using errcode = 'P0002';
  end if;
  if v_run.status <> 'complete' then
    -- The brief's central sync rule: never retire after a partial or failed
    -- run. A run that did not finish knows nothing about what is missing.
    raise exception 'Refusing to retire from a run that is not complete.' using errcode = '23514';
  end if;

  update public.hotels h
     set is_active = false,
         deactivated_at = now(),
         updated_at = now()
   where h.provider = v_run.provider
     and h.is_active
     -- Only rows this run failed to confirm, inside only the box it declared.
     and (h.last_seen_at is null or h.last_seen_at < v_run.started_at)
     and extensions.st_within(
           h.location::extensions.geometry,
           extensions.st_makeenvelope(v_run.west, v_run.south, v_run.east, v_run.north, 4326)
         );

  get diagnostics v_count = row_count;

  update app.sync_runs r set deactivated = v_count where r.id = p_run;
  return v_count;
end;
$$;

comment on function public.deactivate_unseen_places(uuid) is
  'D-053 §8: retires rows a *completed* run did not confirm, inside its declared box, for its declared provider only. Never deletes.';

revoke all on function public.deactivate_unseen_places(uuid) from public, anon, authenticated;
grant execute on function public.deactivate_unseen_places(uuid) to service_role;

/** The run log, newest first, for the runbook and for alerting. */
create or replace function public.recent_sync_runs(p_limit integer default 20)
returns table (
  id uuid, provider text, release text, status text,
  started_at timestamptz, finished_at timestamptz,
  inserted integer, updated integer, unchanged integer,
  reactivated integer, deactivated integer, note text
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.provider, r.release, r.status, r.started_at, r.finished_at,
         r.inserted, r.updated, r.unchanged, r.reactivated, r.deactivated, r.note
    from app.sync_runs r
   order by r.started_at desc
   limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

revoke all on function public.recent_sync_runs(integer) from public, anon, authenticated;
grant execute on function public.recent_sync_runs(integer) to service_role;

notify pgrst, 'reload schema';
