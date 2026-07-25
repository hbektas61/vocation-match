-- Vocation Match — H-305 (backlog S-004)
-- A match's room and hotel come from the pair's *first* swipe.
--
-- `swipes` has no room in its primary key, and a match was created with the
-- room of whichever swipe closed it. So the same two people produce a different
-- label depending on who happened to swipe second: A likes B from Upcoming,
-- three weeks later B likes A from Here Now, and the match is labelled Here Now
-- — or the other way round, for the same pair, if the order had been reversed.
--
-- Cosmetic while nothing reads the label. It stops being cosmetic the moment
-- anything does, and the fix is cheap now and awkward later, which is why the
-- backlog said decide before it is used for anything.
--
-- The rule: the room and the hotel are the ones of the earliest swipe between
-- the pair. Both come from the same row, so they can never disagree.
--
-- "Earliest" cannot be `created_at`. That defaults to `now()`, which is the
-- *transaction* timestamp, so two swipes written in one transaction share it
-- exactly and the order between them is a coin flip — the same defect migration
-- 20260725001300 fixed for messages, found the same way: by a test that
-- disagreed with itself depending on how the rows happened to come back. An
-- identity column gives a total order that does not depend on clock resolution.

alter table public.swipes
  add column seq bigint generated always as identity;

comment on column public.swipes.seq is
  'Insertion order. `created_at` is the transaction timestamp and ties between '
  'swipes written together; this does not.';

-- Two consequences of adding a column, both from the review:
--
-- 1. `swipes` was granted SELECT table-wide, so `seq` became readable the
--    moment it existed. The counter is global, so the gap between two of your
--    own swipes tells you how many swipes everyone else made in between. Row
--    level security still hides the rows themselves, but that aggregate was
--    not on offer before and there is no reason to start. The grant becomes a
--    column list, the same shape `profiles` uses.
-- 2. Existing rows are numbered during the rewrite this ALTER performs, in
--    physical order. For an append-only table that has never been updated —
--    which `swipes` is, by its own `on conflict do nothing` — that matches
--    insertion order. It is an assumption rather than a guarantee, and it only
--    affects matches that already existed when this migration ran.
revoke select on table public.swipes from authenticated;
grant select (actor_id, target_id, hotel_id, room, decision, created_at)
  on table public.swipes to authenticated;

-- ------------------------------------------------------------ the attribution
create or replace function app.pair_first_swipe(p_one uuid, p_two uuid)
returns table (hotel_id uuid, room text)
language sql
stable
set search_path = ''
as $$
  select s.hotel_id, s.room
    from public.swipes s
   where (s.actor_id = p_one  and s.target_id = p_two)
      or (s.actor_id = p_two  and s.target_id = p_one)
   order by s.seq
   limit 1;
$$;

revoke all on function app.pair_first_swipe(uuid, uuid) from public, anon, authenticated;
grant execute on function app.pair_first_swipe(uuid, uuid) to service_role;

-- ------------------------------------------------------------------- backfill
-- Every match already in the table gets the same rule applied. `coalesce` keeps
-- a match whose swipes have since been removed exactly as it was rather than
-- nulling a NOT NULL column.
update public.matches m
   set room = coalesce((select f.room from app.pair_first_swipe(m.user_a, m.user_b) f), m.room),
       hotel_id = coalesce((select f.hotel_id from app.pair_first_swipe(m.user_a, m.user_b) f), m.hotel_id);

-- -------------------------------------------------------------------- swipe
-- Identical to the version in 20260725000800_matching_and_safety_functions.sql
-- apart from the two lines that decide the match's room and hotel.
create or replace function public.swipe(p_target_id uuid, p_room text, p_decision text)
returns table (matched boolean, match_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := app.require_user();
  v_hotel    uuid;
  v_match    uuid;
  v_a        uuid;
  v_b        uuid;
  v_unmatched  timestamptz;
  v_reciprocal boolean;
  v_first    record;
begin
  if p_room not in ('UPCOMING', 'HERE_NOW') then
    raise exception 'Unknown room.' using errcode = '23514';
  end if;
  if p_decision not in ('LIKE', 'PASS') then
    raise exception 'Unknown decision.' using errcode = '23514';
  end if;
  if p_target_id = v_user then
    raise exception 'You cannot swipe on yourself.' using errcode = '23514';
  end if;

  select uah.hotel_id into v_hotel
    from public.user_active_hotel uah
   where uah.user_id = v_user;

  if v_hotel is null then
    raise exception 'Choose a hotel first.' using errcode = 'P0002';
  end if;
  if not app.room_eligible(v_user, v_hotel, p_room) then
    raise exception 'You do not have access to this room yet.' using errcode = '42501';
  end if;
  -- The target has to actually be in the same room of the same hotel, so the
  -- endpoint cannot be used to like arbitrary users by id.
  --
  -- A block is folded into this same check on purpose. Answering "that person
  -- is not available" for a block and "not in this room" for everything else
  -- would tell someone they had been blocked, which is exactly what the
  -- blocks table is careful never to reveal.
  if app.blocked_between(v_user, p_target_id)
     or not exists (
       select 1
         from public.user_active_hotel other
         join public.profiles p on p.id = other.user_id
        where other.user_id = p_target_id
          and other.hotel_id = v_hotel
          and p.suspended_at is null
          and app.room_eligible(p_target_id, v_hotel, p_room)
     ) then
    raise exception 'That person is not in this room.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(app.pair_lock_key(v_user, p_target_id));

  insert into public.swipes (actor_id, target_id, hotel_id, room, decision)
  values (v_user, p_target_id, v_hotel, p_room, p_decision)
  on conflict (actor_id, target_id) do nothing;

  v_a := least(v_user, p_target_id);
  v_b := greatest(v_user, p_target_id);

  select m.id, m.unmatched_at into v_match, v_unmatched
    from public.matches m
   where m.user_a = v_a and m.user_b = v_b;

  if v_match is not null then
    -- An existing match is returned as-is, which is what makes a retried swipe
    -- idempotent. A pair that has been unmatched stays unmatched: it does not
    -- silently come back to life.
    if v_unmatched is null then
      return query select true, v_match;
    else
      return query select false, null::uuid;
    end if;
    return;
  end if;

  select exists (
    select 1 from public.swipes s
     where s.actor_id = p_target_id
       and s.target_id = v_user
       and s.decision = 'LIKE'
  ) into v_reciprocal;

  -- Only a like that is answered by a like makes a match. The caller's own
  -- stored decision is read back rather than trusted from the argument, so a
  -- retried PASS cannot be turned into a match.
  if v_reciprocal and exists (
    select 1 from public.swipes s
     where s.actor_id = v_user and s.target_id = p_target_id and s.decision = 'LIKE'
  ) then
    -- Read back rather than using `p_room` and `v_hotel`, which belong to
    -- whoever happened to swipe second. Both swipe rows exist by now — the
    -- caller's was written above and the other side's is what made this a
    -- match — so this always finds one.
    select f.hotel_id, f.room into v_first from app.pair_first_swipe(v_a, v_b) f;

    insert into public.matches (user_a, user_b, hotel_id, room)
    values (v_a, v_b, v_first.hotel_id, v_first.room)
    on conflict on constraint matches_pair_unique do nothing
    returning id into v_match;

    if v_match is null then
      -- Another connection won the race; use the match it created. It applied
      -- the same rule to the same two rows, so the label agrees either way.
      select m.id into v_match
        from public.matches m
       where m.user_a = v_a and m.user_b = v_b;
    end if;

    return query select true, v_match;
    return;
  end if;

  return query select false, null::uuid;
end;
$$;

revoke all on function public.swipe(uuid, text, text) from public, anon;
grant execute on function public.swipe(uuid, text, text) to authenticated, service_role;

comment on column public.matches.room is
  'The room of the pair''s first swipe, not of the swipe that closed the match. '
  'Deterministic for a pair regardless of who swiped second (backlog S-004).';
