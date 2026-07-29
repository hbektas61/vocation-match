-- D-053: a monthly sync has to be able to retire a place, and must not delete.
--
-- Overture publishes monthly, so a one-off load is stale within a quarter: a
-- café closes, another moves, a third is added. Updates and moves already ride
-- the upsert, because Overture's id is stable. Retirement is the missing verb —
-- and it cannot be a delete. `checkins` and `user_active_hotel` reference a
-- venue with `on delete restrict`, and a match points at one for months, so
-- deleting would take history with it. `is_active = false` is enough: every
-- read path already filters on it, so the place stops being offered while
-- everything that already happened there stays intact.
--
-- Given the ids a fresh release does contain for a region, this retires the
-- ones it does not. Scoped to one provider so a sync can never reach across
-- into another's rows, or into the cells.

create or replace function public.deactivate_missing_places(
  p_provider   text,
  p_present_ids text[],
  -- The bounding box the caller actually read, so a partial sync cannot
  -- retire a city it never looked at.
  p_west  double precision,
  p_south double precision,
  p_east  double precision,
  p_north double precision
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_provider is null or p_provider = 'cell' then
    raise exception 'That provider may not be swept.' using errcode = '23514';
  end if;
  if p_present_ids is null or array_length(p_present_ids, 1) is null then
    -- An empty read is far more likely to be a failed download than a region
    -- that lost every venue, and acting on it would empty a city.
    raise exception 'Refusing to retire a region from an empty read.' using errcode = '23514';
  end if;

  update public.hotels h
     set is_active = false,
         updated_at = now()
   where h.provider = p_provider
     and h.is_active
     and not (h.provider_hotel_id = any (p_present_ids))
     and extensions.st_within(
           h.location::extensions.geometry,
           extensions.st_makeenvelope(p_west, p_south, p_east, p_north, 4326)
         );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.deactivate_missing_places(text, text[], double precision, double precision, double precision, double precision) is
  'D-053: retires places a fresh provider read no longer contains, inside the box that was read. Never deletes.';

revoke all on function public.deactivate_missing_places(text, text[], double precision, double precision, double precision, double precision) from public, anon, authenticated;
grant execute on function public.deactivate_missing_places(text, text[], double precision, double precision, double precision, double precision) to service_role;
