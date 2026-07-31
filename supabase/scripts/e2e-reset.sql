-- Clears the interaction state between the two end-to-end test accounts.
--
--   npx supabase db query --linked --file supabase/scripts/e2e-reset.sql
--
-- Separate from `staging-reset.sql` on purpose. That script deliberately keeps
-- every profile, match, message, block and report, because on the demo
-- accounts those are a record of something that really happened and erasing
-- them would be falsifying it. This one has the opposite job for two synthetic
-- accounts: a swipe is a permanent decision, so without a way to clear it the
-- two-account end-to-end run is a test that can only ever pass once.
--
-- The blast radius is two rows in `auth.users` and only what passes *between*
-- them. Nothing here touches a third account, and a match between one of these
-- accounts and anybody else is left exactly where it is.

do $$
declare
  -- The two accounts `scripts/staging-e2e.mjs` drives, and nothing else.
  v_accounts constant text[] := array['+905551110001', '+905551110002'];
  v_ids      uuid[];
  v_matches  uuid[];
  v_messages integer := 0;
begin
  -- The same guard staging-reset.sql uses: a project without these numbers in
  -- it is not staging, and this must be the thing that refuses rather than the
  -- thing that discovers otherwise.
  if not exists (
    select 1 from auth.users u
     where u.phone = any (v_accounts)
        or u.phone = any (select right(p, length(p) - 1) from unnest(v_accounts) p)
  ) then
    raise exception
      'Refusing to run: neither end-to-end test number exists here, so this is not staging.';
  end if;

  select array_agg(u.id) into v_ids
    from auth.users u
   where u.phone = any (v_accounts)
      or u.phone = any (select right(p, length(p) - 1) from unnest(v_accounts) p);

  if array_length(v_ids, 1) is distinct from 2 then
    raise exception
      'Refusing to run: expected exactly 2 end-to-end accounts, found %.', coalesce(array_length(v_ids, 1), 0);
  end if;

  -- Only matches where *both* sides are the test pair. A match one of them has
  -- with a real staging profile is somebody else's data.
  select array_agg(m.id) into v_matches
    from public.matches m
   where m.user_a = any (v_ids) and m.user_b = any (v_ids);

  if v_matches is not null then
    delete from public.messages where match_id = any (v_matches);
    get diagnostics v_messages = row_count;
    delete from public.matches where id = any (v_matches);
  end if;

  delete from public.swipes
   where actor_id = any (v_ids) and target_id = any (v_ids);

  delete from public.blocks
   where blocker_id = any (v_ids) and blocked_id = any (v_ids);

  -- Reports between the two synthetic accounts are synthetic too. A report
  -- either of them filed about a real profile is moderation history and stays.
  delete from public.reports
   where reporter_id = any (v_ids) and reported_id = any (v_ids);

  raise notice 'e2e pair reset: % match(es), % message(s), swipes/blocks/reports between the pair cleared',
    coalesce(array_length(v_matches, 1), 0), v_messages;
end;
$$;

select
  (select count(*) from public.swipes  s where s.actor_id in (select id from auth.users where phone in ('+905551110001','+905551110002'))
                                          and s.target_id in (select id from auth.users where phone in ('+905551110001','+905551110002'))) as swipes_between_pair,
  (select count(*) from public.matches m where m.user_a in (select id from auth.users where phone in ('+905551110001','+905551110002'))
                                          and m.user_b in (select id from auth.users where phone in ('+905551110001','+905551110002'))) as matches_between_pair;
