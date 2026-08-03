-- Vocation Match — leaving a venue without choosing another (owner, 2026-08-03).
--
-- Choosing was a one-way door: the only exit `set_active_hotel` offered was a
-- different venue. Cancelling a trip is an ordinary thing to do, so leaving
-- gets the same teardown a switch performs — rooms close (D-004), presence
-- clears, the declared stay goes with the trip it described — and then no new
-- venue is put in the old one's place. Idempotent: leaving nothing is not an
-- error, so two devices pressing it at once both succeed.
create or replace function public.leave_active_venue()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := app.require_user();
  v_previous uuid;
  v_now      timestamptz := now();
begin
  -- The same lock set_active_hotel takes, so a leave and a switch racing
  -- each other serialise instead of interleaving their teardowns.
  select uah.hotel_id into v_previous
    from public.user_active_hotel uah
   where uah.user_id = v_user
     for update;

  if v_previous is null then
    return false;
  end if;

  update public.hotel_activation_events e
     set deactivated_at = v_now
   where e.user_id = v_user
     and e.deactivated_at is null;

  delete from public.presence_checks pc where pc.user_id = v_user;
  delete from public.upcoming_stays us where us.user_id = v_user;
  delete from public.user_active_hotel uah where uah.user_id = v_user;

  return true;
end;
$$;

comment on function public.leave_active_venue() is
  'Deactivates the caller''s venue with the switch''s full teardown and replaces it with nothing (owner decision, 2026-08-03).';

revoke all on function public.leave_active_venue() from public, anon;
grant execute on function public.leave_active_venue() to authenticated, service_role;
