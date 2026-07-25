-- Vocation Match — H-401/H-403, from the pilot-hardening security audit.
--
-- CRITICAL. `swipe()` decided whether to refuse by asking, live, whether the
-- *target* is eligible for the room right now — and it asked that before it
-- looked at whether the caller had already swiped on them. Two consequences,
-- from one line being in the wrong place:
--
-- 1. A presence oracle on a specific person. A user id is public to everyone
--    who has seen a card, so anyone can call `swipe(that_id, 'HERE_NOW', ...)`
--    on a loop. It answers "not in this room" while the target's proximity
--    check is stale and stops answering that the moment they check in near the
--    hotel. The deck deliberately removes someone once you have swiped on them;
--    this handed back a live feed on exactly those people, which is the
--    behaviour decision D-005 exists to prevent. Someone who has been passed
--    over is the last person who should get a notification that you have
--    arrived.
--
-- 2. It broke D-012. "A repeat swipe is a no-op that returns the existing
--    outcome rather than an error" is the whole reason the endpoint is safe to
--    retry over a flaky hotel connection. If the target's eligibility had
--    changed in between — and thirty minutes is all that takes — the retry
--    raised 42501 instead. The existing idempotency test never caught it,
--    because it keeps the target eligible throughout.
--
-- The fix is the same for both: answer from the stored decision first, and only
-- look at anybody else's current state when there is a new decision to make.
--
-- Also from the audit: `swipe` and `discovery_feed` had no rate limit at all,
-- which is what made polling practical rather than theoretical. Both get one,
-- generous enough that no person meets it and low enough that a script stops
-- being free — the same reasoning as S-002.

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

  v_a := least(v_user, p_target_id);
  v_b := greatest(v_user, p_target_id);

  -- Already decided. Answer from what is stored and touch nothing else: this
  -- makes a retry safe (D-012) and, just as importantly, means the answer
  -- carries no information about where the other person is right now.
  if exists (
    select 1 from public.swipes s
     where s.actor_id = v_user and s.target_id = p_target_id
  ) then
    select m.id, m.unmatched_at into v_match, v_unmatched
      from public.matches m
     where m.user_a = v_a and m.user_b = v_b;

    if v_match is not null and v_unmatched is null then
      return query select true, v_match;
    else
      return query select false, null::uuid;
    end if;
    return;
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

  -- Three hundred an hour is far more than a person swiping through a room
  -- ever reaches, and it is counted here rather than above so that a retry of
  -- a decision already made costs nothing.
  perform app.rate_limit(v_user, 'swipe', 300, interval '1 hour');

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

  select m.id, m.unmatched_at into v_match, v_unmatched
    from public.matches m
   where m.user_a = v_a and m.user_b = v_b;

  if v_match is not null then
    -- A pair that has been unmatched stays unmatched: it does not silently
    -- come back to life.
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

    return query select true, v_match;
    return;
  end if;

  return query select false, null::uuid;
end;
$$;

revoke all on function public.swipe(uuid, text, text) from public, anon;
grant execute on function public.swipe(uuid, text, text) to authenticated, service_role;

-- ------------------------------------------------------------ discovery reads
-- The deck is a read, so it costs nobody else anything directly — but it hands
-- back the whole room's roster, and an unthrottled read is a scraper's
-- entry point: names, bios, photo paths, and who is in the room right now,
-- sampled as fast as connections allow. The screen refetches on focus and on a
-- room switch; nobody reaches three hundred an hour by using the app.
create or replace function public.discovery_feed(p_room text, p_limit integer default 20)
returns table (
  user_id      uuid,
  display_name text,
  age          integer,
  bio          text,
  photo_path   text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := app.require_user();
  v_hotel uuid;
begin
  if p_room not in ('UPCOMING', 'HERE_NOW') then
    raise exception 'Unknown room.' using errcode = '23514';
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

  perform app.rate_limit(v_user, 'discovery_feed', 300, interval '1 hour');

  return query
    select p.id,
           p.display_name,
           app.age_years(p.birthdate),
           p.bio,
           p.photo_path
      from public.user_active_hotel other
      join public.profiles p on p.id = other.user_id
     where other.hotel_id = v_hotel
       and other.user_id <> v_user
       and p.suspended_at is null
       and app.room_eligible(other.user_id, v_hotel, p_room)
       and not exists (
         select 1 from public.swipes s
          where s.actor_id = v_user and s.target_id = other.user_id)
       and not app.blocked_between(v_user, other.user_id)
     order by p.created_at, p.id
     limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

revoke all on function public.discovery_feed(text, integer) from public, anon;
grant execute on function public.discovery_feed(text, integer) to authenticated, service_role;

comment on function public.swipe(uuid, text, text) is
  'One decision per pair, answered from storage on a repeat. A repeat never '
  'looks at the target''s current state, so it cannot be used to watch where '
  'somebody is (D-005, D-012).';
