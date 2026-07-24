-- Vocation Match — N-007 and N-009 (behaviour)
-- Swiping, matching, blocking, reporting, and the moderation pipeline.

create or replace function app.blocked_between(p_one uuid, p_two uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks b
     where (b.blocker_id = p_one and b.blocked_id = p_two)
        or (b.blocker_id = p_two and b.blocked_id = p_one)
  );
$$;

revoke all on function app.blocked_between(uuid, uuid) from public, anon, authenticated;
grant execute on function app.blocked_between(uuid, uuid) to service_role;

-- Same pair, same lock, whichever way round the arguments arrive.
create or replace function app.pair_lock_key(p_one uuid, p_two uuid)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select hashtextextended(least(p_one, p_two)::text || greatest(p_one, p_two)::text, 0);
$$;

-- ------------------------------------------------------------ N-007 swipe
-- Safe to retry: the primary key on (actor, target) absorbs a repeat, and the
-- transaction-scoped pair lock means two simultaneous likes produce exactly
-- one match rather than none or two.
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
  if app.blocked_between(v_user, p_target_id) then
    raise exception 'That person is not available.' using errcode = '42501';
  end if;

  -- The target has to actually be in the same room of the same hotel, so the
  -- endpoint cannot be used to like arbitrary users by id.
  if not exists (
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
    insert into public.matches (user_a, user_b, hotel_id, room)
    values (v_a, v_b, v_hotel, p_room)
    on conflict on constraint matches_pair_unique do nothing
    returning id into v_match;

    if v_match is null then
      -- Another connection won the race; use the match it created.
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

create or replace function public.unmatch(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_user();
begin
  update public.matches m
     set unmatched_at = now(),
         unmatched_by = v_user
   where m.id = p_match_id
     and m.unmatched_at is null
     and (m.user_a = v_user or m.user_b = v_user);

  if not found then
    raise exception 'That match is not open.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.unmatch(uuid) from public, anon;
grant execute on function public.unmatch(uuid) to authenticated, service_role;

-- ------------------------------------------------------------ N-009 safety
-- Blocking is available before a match exists, from the discovery deck as well
-- as from a conversation (owner decision D-008).
create or replace function public.block_user(p_target_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_user();
begin
  if p_target_id = v_user then
    raise exception 'You cannot block yourself.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_target_id) then
    raise exception 'That person no longer exists.' using errcode = 'P0002';
  end if;

  insert into public.blocks (blocker_id, blocked_id)
  values (v_user, p_target_id)
  on conflict (blocker_id, blocked_id) do nothing;

  update public.matches m
     set unmatched_at = now(),
         unmatched_by = v_user
   where m.unmatched_at is null
     and m.user_a = least(v_user, p_target_id)
     and m.user_b = greatest(v_user, p_target_id);
end;
$$;

revoke all on function public.block_user(uuid) from public, anon;
grant execute on function public.block_user(uuid) to authenticated, service_role;

-- Reversible by design: an accidental block should not be a life sentence
-- (backlog R-002). Unblocking does not restore the match that blocking ended.
create or replace function public.unblock_user(p_target_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_user();
begin
  delete from public.blocks b
   where b.blocker_id = v_user and b.blocked_id = p_target_id;
end;
$$;

revoke all on function public.unblock_user(uuid) from public, anon;
grant execute on function public.unblock_user(uuid) to authenticated, service_role;

-- The blocked-users list for Settings: names the caller already blocked.
create or replace function public.my_blocks()
returns table (user_id uuid, display_name text, blocked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select b.blocked_id, p.display_name, b.created_at
    from public.blocks b
    join public.profiles p on p.id = b.blocked_id
   where b.blocker_id = app.current_user_id()
   order by b.created_at desc;
$$;

revoke all on function public.my_blocks() from public, anon;
grant execute on function public.my_blocks() to authenticated, service_role;

create or replace function public.report_user(
  p_target_id uuid,
  p_reason    text,
  p_details   text default null,
  p_also_block boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   uuid := app.require_user();
  v_target uuid := p_target_id;
  v_hotel  uuid;
  v_id     uuid;
begin
  if v_target = v_user then
    raise exception 'You cannot report yourself.' using errcode = '23514';
  end if;
  if p_reason not in ('HARASSMENT', 'SPAM', 'FAKE_PROFILE', 'UNDERAGE', 'SAFETY', 'OTHER') then
    raise exception 'Choose a reason for the report.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_target) then
    raise exception 'That person no longer exists.' using errcode = 'P0002';
  end if;

  select uah.hotel_id into v_hotel
    from public.user_active_hotel uah
   where uah.user_id = v_user;

  insert into public.reports (reporter_id, reported_id, hotel_id, reason, details)
  values (v_user, v_target, v_hotel, p_reason, nullif(btrim(coalesce(p_details, '')), ''))
  returning id into v_id;

  if p_also_block then
    perform public.block_user(v_target);
  end if;

  return v_id;
end;
$$;

revoke all on function public.report_user(uuid, text, text, boolean) from public, anon;
grant execute on function public.report_user(uuid, text, text, boolean) to authenticated, service_role;

-- Automatic escalation: three distinct reporters raise a flag once, so a
-- pile-on surfaces in the queue without a human watching every report.
create or replace function app.flag_repeatedly_reported()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reporters integer;
begin
  select count(distinct r.reporter_id) into v_reporters
    from public.reports r
   where r.reported_id = new.reported_id
     and r.status in ('OPEN', 'REVIEWING');

  if v_reporters >= 3 and not exists (
    select 1 from public.moderation_actions a
     where a.subject_id = new.reported_id
       and a.action = 'FLAGGED'
       and a.created_at > now() - interval '30 days'
  ) then
    insert into public.moderation_actions (subject_id, action, reason, report_id)
    values (new.reported_id, 'FLAGGED',
            v_reporters || ' distinct reporters within the open queue', new.id);
  end if;

  return new;
end;
$$;

create trigger reports_flag_repeats
  after insert on public.reports
  for each row execute function app.flag_repeatedly_reported();

-- Moderation runs as service_role. No client role can read this view.
-- The flag is a scalar subquery rather than a join: joining moderation_actions
-- would multiply the report rows and inflate the counts a moderator triages on.
create or replace view public.moderation_queue
with (security_invoker = true) as
  select r.reported_id,
         count(*) filter (where r.status = 'OPEN') as open_reports,
         count(distinct r.reporter_id)             as distinct_reporters,
         max(r.created_at)                         as last_reported_at,
         exists (
           select 1 from public.moderation_actions a
            where a.subject_id = r.reported_id and a.action = 'FLAGGED'
         )                                         as flagged,
         p.suspended_at
    from public.reports r
    left join public.profiles p on p.id = r.reported_id
   where r.status in ('OPEN', 'REVIEWING')
   group by r.reported_id, p.suspended_at;

revoke all on public.moderation_queue from public, anon, authenticated;
grant select on public.moderation_queue to service_role;

create or replace function public.resolve_report(
  p_report_id uuid,
  p_status    text,
  p_note      text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject uuid;
begin
  if p_status not in ('REVIEWING', 'ACTIONED', 'DISMISSED') then
    raise exception 'Unknown moderation status.' using errcode = '23514';
  end if;

  update public.reports r
     set status = p_status,
         reviewed_at = now(),
         review_note = p_note
   where r.id = p_report_id
  returning r.reported_id into v_subject;

  if v_subject is null then
    raise exception 'No such report.' using errcode = 'P0002';
  end if;

  if p_status = 'ACTIONED' then
    update public.profiles p set suspended_at = now() where p.id = v_subject;
    insert into public.moderation_actions (subject_id, action, reason, report_id)
    values (v_subject, 'SUSPENDED', p_note, p_report_id);
  elsif p_status = 'DISMISSED' then
    insert into public.moderation_actions (subject_id, action, reason, report_id)
    values (v_subject, 'DISMISSED', p_note, p_report_id);
  end if;
end;
$$;

revoke all on function public.resolve_report(uuid, text, text) from public, anon, authenticated;
grant execute on function public.resolve_report(uuid, text, text) to service_role;

-- ------------------------------------------------- discovery, final version
-- Same signature as migration 20260725000600; now that swipes, blocks and
-- suspensions exist, the feed also excludes people already decided on, people
-- either side has blocked, and suspended accounts.
create or replace function public.discovery_feed(p_room text, p_limit integer default 20)
returns table (
  user_id      uuid,
  display_name text,
  age          integer,
  bio          text,
  photo_url    text
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

  return query
    select p.id,
           p.display_name,
           app.age_years(p.birthdate),
           p.bio,
           p.photo_url
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
