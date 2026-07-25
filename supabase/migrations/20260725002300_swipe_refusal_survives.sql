-- Vocation Match — H-403, from the verification pass on D-016.
--
-- The rate limit added to `swipe()` did nothing on the path that needed it.
--
-- `app.rate_limit` writes a counter row. The check that follows it raises when
-- the target is not in the room. Both are in one function call, so one
-- transaction — and the raise rolls the counter back with everything else. A
-- probe that fails therefore costs nothing at all, which was demonstrated: five
-- refused swipes in a row, and `public.rate_limits` had no `swipe` row
-- afterwards.
--
-- What that leaves is narrower than the original oracle but still real. Once a
-- decision exists the endpoint stops looking at the target for good, so arrival
-- can be watched for and departure cannot — but "did this named person just
-- become reachable" is exactly the signal D-005 is about, and it was free.
--
-- The fix is that the refusal stops being an exception. The function returns
-- it, the statement commits, and the counter with it. Nothing changes for
-- anyone using the app: the client turns `refused` back into the same error it
-- has always shown, with the same words.
--
-- Worth stating because it generalises: any rate limit placed before a `raise`
-- in the same function is not a rate limit. The other three
-- (`report_user`, `record_presence_check`, `discovery_feed`) were checked and
-- are counted after the last statement that can raise, so they commit.

drop function if exists public.swipe(uuid, text, text);

create function public.swipe(p_target_id uuid, p_room text, p_decision text)
returns table (matched boolean, match_id uuid, refused text)
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

  v_a := least(v_user, p_target_id);
  v_b := greatest(v_user, p_target_id);

  -- Already decided. Answer from what is stored and touch nothing else: this
  -- makes a retry safe (D-012) and means the answer carries no information
  -- about where the other person is right now (D-016).
  if exists (
    select 1 from public.swipes s
     where s.actor_id = v_user and s.target_id = p_target_id
  ) then
    select m.id, m.unmatched_at into v_match, v_unmatched
      from public.matches m
     where m.user_a = v_a and m.user_b = v_b;

    if v_match is not null and v_unmatched is null then
      return query select true, v_match, null::text;
    else
      return query select false, null::uuid, null::text;
    end if;
    return;
  end if;

  select uah.hotel_id into v_hotel
    from public.user_active_hotel uah
   where uah.user_id = v_user;

  -- These two are about the caller's own state, so they say nothing about
  -- anybody else and stay exceptions.
  if v_hotel is null then
    raise exception 'Choose a hotel first.' using errcode = 'P0002';
  end if;
  if not app.room_eligible(v_user, v_hotel, p_room) then
    raise exception 'You do not have access to this room yet.' using errcode = '42501';
  end if;

  perform app.rate_limit(v_user, 'swipe', 300, interval '1 hour');

  -- The target has to actually be in the same room of the same hotel, so the
  -- endpoint cannot be used to like arbitrary users by id.
  --
  -- A block is folded into this same check on purpose. Answering "that person
  -- is not available" for a block and "not in this room" for everything else
  -- would tell someone they had been blocked, which is exactly what the blocks
  -- table is careful never to reveal.
  --
  -- Returned rather than raised, so the rate-limit row above survives. That is
  -- the whole point: this is the one branch whose answer depends on somebody
  -- else, so it is the one that has to be counted.
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
    return query select false, null::uuid, 'NOT_IN_ROOM'::text;
    return;
  end if;

  perform pg_advisory_xact_lock(app.pair_lock_key(v_user, p_target_id));

  insert into public.swipes (actor_id, target_id, hotel_id, room, decision)
  values (v_user, p_target_id, v_hotel, p_room, p_decision)
  on conflict (actor_id, target_id) do nothing;

  select m.id, m.unmatched_at into v_match, v_unmatched
    from public.matches m
   where m.user_a = v_a and m.user_b = v_b;

  if v_match is not null then
    -- A pair that has been unmatched stays unmatched: it does not silently
    -- come back to life.
    if v_unmatched is null then
      return query select true, v_match, null::text;
    else
      return query select false, null::uuid, null::text;
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
    -- The pair's first swipe decides the label, not whoever closed it (S-004).
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

    return query select true, v_match, null::text;
    return;
  end if;

  return query select false, null::uuid, null::text;
end;
$$;

revoke all on function public.swipe(uuid, text, text) from public, anon;
grant execute on function public.swipe(uuid, text, text) to authenticated, service_role;

comment on function public.swipe(uuid, text, text) is
  'One decision per pair, answered from storage on a repeat. The one branch '
  'whose answer depends on somebody else returns `refused` instead of raising, '
  'so the rate-limit row it just wrote survives the statement — a limit placed '
  'before a raise is not a limit (D-016).';
