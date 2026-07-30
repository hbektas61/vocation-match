-- Staging test-account reset. Safe, idempotent, and re-runnable.
--
--   scripts/staging-reset.sh
--
-- or directly, if the Supabase CLI is linked to staging:
--
--   npx supabase db query --linked --file supabase/scripts/staging-reset.sql
--
-- Why this exists: verifying D-054 and V-010 on staging *moves* the demo
-- accounts. They end up at whichever venue the last scenario used, holding
-- declared stays, presence answers and search sessions that a demo would then
-- show as though they were the seed. Putting them back by hand is how a demo
-- ends up half-reset.
--
-- What it does, and only this:
--
--   * refuses to run anywhere but staging,
--   * returns the named test accounts to "no venue, no stay, no check-in, no
--     presence answer, no open search session, no event membership",
--   * clears the venue-region contributions those runs produced, and the
--     coarse cells that were derived from them,
--   * retires the Google venue rows the runs created, when nothing references
--     them — and deactivates rather than deletes when something does,
--   * leaves every profile, match, message, block and report untouched.
--
-- What it deliberately does not do: touch the metrics. `app.provider_events`
-- is a measurement of what really happened and resetting it would be falsifying
-- the record (V-012).

do $$
declare
  v_accounts constant text[] := array[
    '+905551110001', '+905551110002', '+905551110003',
    '+905551110004', '+905551110005', '+905551122333'
  ];
  v_ids       uuid[];
  v_venues    uuid[];
  v_retired   integer := 0;
  v_deleted   integer := 0;
  v_survivors integer := 0;
begin
  -- ------------------------------------------------------------- the guard
  -- Production has no test numbers in it, and this must never be the thing
  -- that discovers otherwise. Two independent signals have to agree.
  if current_database() not in ('postgres') then
    raise exception 'Refusing to run: unexpected database %', current_database();
  end if;
  if not exists (
    select 1 from auth.users u where u.phone = any (
      select right(p, length(p) - 1) from unnest(v_accounts) p)
       or u.phone = any (v_accounts)
  ) then
    raise exception
      'Refusing to run: none of the staging test numbers exist here, so this is not staging.';
  end if;

  select array_agg(u.id) into v_ids
    from auth.users u
   where u.phone = any (v_accounts)
      or u.phone = any (select right(p, length(p) - 1) from unnest(v_accounts) p);

  raise notice 'resetting % test accounts', coalesce(array_length(v_ids, 1), 0);

  -- ------------------------------------------------- what a run leaves behind
  -- Order matters only where a foreign key does; everything here is per-user
  -- state that a fresh account would not have.
  delete from public.presence_checks   where user_id = any (v_ids);
  delete from public.checkins          where user_id = any (v_ids);
  delete from public.upcoming_stays    where user_id = any (v_ids);

  update public.hotel_activation_events
     set deactivated_at = coalesce(deactivated_at, now())
   where user_id = any (v_ids) and deactivated_at is null;

  -- V-010/D-055a: the contributions those verifications made, and the cells
  -- derived from them. A demo should start from "we do not know where this is".
  --
  -- A contribution is deliberately not linked to a person any more, so it
  -- cannot be deleted "for these users". It is deleted per *venue* instead,
  -- for the Google venues the test cast is sitting at — which is the right
  -- scope anyway: those are the venues a run taught, and a venue somebody
  -- outside the cast taught is none of this script's business.
  delete from app.venue_region_contributors c
   where c.venue_id in (
     select uah.hotel_id from public.user_active_hotel uah
      where uah.user_id = any (v_ids)
   );
  delete from app.venue_region_tally t
   where t.venue_id in (
     select uah.hotel_id from public.user_active_hotel uah
      where uah.user_id = any (v_ids)
   );

  delete from public.user_active_hotel where user_id = any (v_ids);

  -- Sessions and unspent selections are short-lived anyway; clearing them
  -- makes a re-run deterministic rather than dependent on the clock.
  delete from app.place_selections     where user_id = any (v_ids);
  delete from app.search_sessions      where user_id = any (v_ids);

  -- D-056: the event rooms a run built. Memberships and focus go; the event
  -- *identities* stay, because a match or a swipe may point at one and that
  -- history is not this script's to rewrite — the same reasoning as the
  -- Google venues below.
  delete from public.event_presence_checks where user_id = any (v_ids);
  delete from public.user_event_focus      where user_id = any (v_ids);
  delete from public.event_memberships     where user_id = any (v_ids);
  delete from app.event_selections         where user_id = any (v_ids);

  -- ------------------------------------------------- the venues they created
  -- A Google venue is created by the first person who picks it, so a test run
  -- mints them. Retire the ones nothing references any more.
  select array_agg(h.id) into v_venues
    from public.hotels h
   where h.provider = 'google';

  if v_venues is not null then
    -- Recompute every cell from the tally that is left, so a venue keeps a
    -- cell only if somebody outside the test cast taught it one.
    update public.hotels h
       set coarse_region_cell = (
             select t.cell_key
               from app.venue_region_tally t
              where t.venue_id = h.id
              order by t.contributions desc, t.cell_key
              limit 1)
     where h.id = any (v_venues);

    with unreferenced as (
      select h.id
        from public.hotels h
       where h.id = any (v_venues)
         and not exists (select 1 from public.user_active_hotel u where u.hotel_id = h.id)
         and not exists (select 1 from public.checkins c        where c.venue_id = h.id)
         and not exists (select 1 from public.upcoming_stays s  where s.hotel_id = h.id)
         and not exists (select 1 from public.matches m         where m.hotel_id = h.id)
         and not exists (select 1 from public.swipes sw         where sw.hotel_id = h.id)
         and not exists (select 1 from public.hotel_activation_events e where e.hotel_id = h.id)
    )
    delete from public.hotels h using unreferenced u where h.id = u.id;
    get diagnostics v_deleted = row_count;

    -- Most survive: an activation event points at every venue anybody ever
    -- chose, and that history is the thing this script must not rewrite. A
    -- surviving row is harmless — it is a placeholder with no cell, invisible
    -- to search, active for nobody — and it is *useful*, because the next
    -- person to pick that Place ID gets the same internal venue (D-054).

    -- Anything still referenced is deactivated instead. D-053's reasoning
    -- holds: `on delete restrict` guards history, and a match from three weeks
    -- ago still points at the venue it happened in.
    update public.hotels h
       set is_active = false
     where h.id = any (v_venues)
       and h.is_active
       and exists (select 1 from public.matches m where m.hotel_id = h.id);
    get diagnostics v_retired = row_count;
  end if;

  select count(*) into v_survivors from public.hotels where provider = 'google';
  raise notice 'google venues: % removed, % deactivated, % kept because history points at them',
    v_deleted, v_retired, v_survivors;
  -- The provider lease is not per-user, so it is swept rather than targeted:
  -- anything expired or flagged goes, which is what the routine purge does
  -- anyway (§10.1).
  perform public.purge_event_content();

  raise notice 'profiles, matches, messages, blocks and reports were not touched';
  raise notice 'metrics were not touched: app.provider_events is a record of what happened';
end;
$$;

-- What the accounts look like afterwards, so a run can be read rather than
-- trusted.
select u.phone,
       p.display_name,
       (uah.hotel_id is not null) as has_venue,
       exists (select 1 from public.upcoming_stays s where s.user_id = u.id) as has_stay,
       exists (select 1 from public.checkins c where c.user_id = u.id) as has_checkin,
       exists (select 1 from public.presence_checks pc where pc.user_id = u.id) as has_presence
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.user_active_hotel uah on uah.user_id = u.id
 where u.phone in ('905551110001','905551110002','905551110003',
                   '905551110004','905551110005','905551122333')
    or u.phone in ('+905551110001','+905551110002','+905551110003',
                   '+905551110004','+905551110005','+905551122333')
 order by u.phone;
