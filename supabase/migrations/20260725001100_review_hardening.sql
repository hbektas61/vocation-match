-- Vocation Match — fixes from the independent code review and security audit.
--
-- 1. HIGH. A suspended account could still browse and swipe. `app.require_user`
--    never looked at `suspended_at`, and only the *target's* suspension was
--    filtered, so moderation stopped someone being seen without stopping them
--    acting. The gate is now suspension-aware by default; the few endpoints a
--    suspended person should still reach say so explicitly.
-- 2. MEDIUM. `set_active_hotel` was not race-safe on a user's *first*
--    activation: `select ... for update` locks nothing when there is no row
--    yet, so two concurrent first activations both reached the unconditional
--    insert into `hotel_activation_events` and one died on the partial unique
--    index with a raw duplicate-key error. Now serialised by an advisory lock,
--    the same pattern `swipe` already used.
-- 3. MEDIUM. `profiles.photo_url` accepted any https URL with no length bound.
--    A card is shown in discovery without any interaction, so a self-hosted
--    image URL is a passive beacon: whoever owns the profile learns the IP and
--    timing of everyone who merely saw them. For an app whose whole promise is
--    not revealing who is near whom, that is the wrong default.
-- 4. LOW. "Sign in to continue." raised 42501, which the client mapped to
--    FORBIDDEN rather than UNAUTHENTICATED.
-- 5. LOW. `hotels.address` had no length bound; `app.pair_lock_key` had no
--    explicit revoke.

-- --------------------------------------------------------------- 5, hardening
alter table public.hotels
  add constraint hotels_address_length
  check (address is null or char_length(address) <= 200);

revoke all on function app.pair_lock_key(uuid, uuid) from public, anon, authenticated;
grant execute on function app.pair_lock_key(uuid, uuid) to service_role;

-- ----------------------------------------------------------- 3, photo beacons
-- A length bound is the stop-gap. The real fix is to serve photos from our own
-- storage bucket so a viewer's client never contacts a URL the profile owner
-- controls; that is a product decision, recorded in .studio/decisions.md.
alter table public.profiles
  add constraint profiles_photo_url_length
  check (photo_url is null or char_length(photo_url) <= 2048);

-- ---------------------------------------------------------- 1 and 4, the gate
-- Suspension-aware by default: an endpoint has to opt out to be reachable by a
-- suspended account, rather than opt in to being protected.
create or replace function app.require_user()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.current_user_id();
  v_suspended timestamptz;
begin
  if v_user is null then
    -- 28000 maps to "sign in", not "forbidden": the caller is not
    -- authenticated, which is a different thing from not being allowed.
    raise exception 'Sign in to continue.' using errcode = '28000';
  end if;

  select p.suspended_at into v_suspended
    from public.profiles p
   where p.id = v_user;

  if not found then
    raise exception 'Finish your profile first.' using errcode = 'P0002';
  end if;
  if v_suspended is not null then
    raise exception 'Your account is suspended.' using errcode = '42501';
  end if;

  return v_user;
end;
$$;

revoke all on function app.require_user() from public, anon;
grant execute on function app.require_user() to authenticated, service_role;

-- Safety and self-service stay open to a suspended account. Someone who has
-- been suspended must still be able to block, report, unmatch, and read what
-- they already have — suspension is a limit on reaching other people, not a
-- reason to strip away the tools that protect them.
create or replace function app.require_any_user()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.current_user_id();
begin
  if v_user is null then
    raise exception 'Sign in to continue.' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_user) then
    raise exception 'Finish your profile first.' using errcode = 'P0002';
  end if;
  return v_user;
end;
$$;

revoke all on function app.require_any_user() from public, anon;
grant execute on function app.require_any_user() to authenticated, service_role;

-- ------------------------------------------------------------- 2, the race
create or replace function public.set_active_hotel(p_hotel_id uuid)
returns table (
  hotel_id            uuid,
  activated_at        timestamptz,
  previous_hotel_id   uuid,
  presence_cleared    boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := app.require_user();
  v_previous uuid;
  v_cleared  boolean := false;
  v_now      timestamptz := now();
begin
  if not exists (select 1 from public.hotels h where h.id = p_hotel_id and h.is_active) then
    raise exception 'That hotel is not available.' using errcode = 'P0002';
  end if;

  -- Serialise this user's activations. A row lock is not enough: on a first
  -- activation there is no row to lock, and two concurrent calls would both
  -- reach the activation-event insert and collide on the partial unique index.
  perform pg_advisory_xact_lock(app.pair_lock_key(v_user, v_user));

  select uah.hotel_id into v_previous
    from public.user_active_hotel uah
   where uah.user_id = v_user
     for update;

  if v_previous = p_hotel_id then
    -- Idempotent: re-activating the current hotel changes nothing.
    return query
      select uah.hotel_id, uah.activated_at, v_previous, false
        from public.user_active_hotel uah
       where uah.user_id = v_user;
    return;
  end if;

  if v_previous is not null then
    -- Discovery in the previous hotel closes immediately (D-004).
    update public.hotel_activation_events e
       set deactivated_at = v_now
     where e.user_id = v_user
       and e.deactivated_at is null;

    delete from public.presence_checks pc where pc.user_id = v_user;
    v_cleared := true;
  end if;

  insert into public.user_active_hotel as uah (user_id, hotel_id, activated_at)
  values (v_user, p_hotel_id, v_now)
  on conflict (user_id) do update
     set hotel_id = excluded.hotel_id,
         activated_at = excluded.activated_at;

  insert into public.hotel_activation_events (user_id, hotel_id, activated_at)
  values (v_user, p_hotel_id, v_now);

  return query select p_hotel_id, v_now, v_previous, v_cleared;
end;
$$;

revoke all on function public.set_active_hotel(uuid) from public, anon;
grant execute on function public.set_active_hotel(uuid) to authenticated, service_role;

-- ------------------------------------------- 1, endpoints a suspended user keeps
create or replace function public.unmatch(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_any_user();
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

create or replace function public.block_user(p_target_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_any_user();
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

create or replace function public.unblock_user(p_target_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_any_user();
begin
  delete from public.blocks b
   where b.blocker_id = v_user and b.blocked_id = p_target_id;
end;
$$;

revoke all on function public.unblock_user(uuid) from public, anon;
grant execute on function public.unblock_user(uuid) to authenticated, service_role;

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
  v_user   uuid := app.require_any_user();
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

create or replace function public.my_matches()
returns table (
  match_id          uuid,
  other_user_id     uuid,
  display_name      text,
  age               integer,
  photo_url         text,
  room              text,
  created_at        timestamptz,
  unmatched_at      timestamptz,
  last_message_at   timestamptz,
  last_message_body text
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select app.require_any_user() as id)
  select m.id,
         other.id,
         other.display_name,
         app.age_years(other.birthdate),
         other.photo_url,
         m.room,
         m.created_at,
         m.unmatched_at,
         last_message.created_at,
         last_message.body
    from public.matches m
    join me on me.id = m.user_a or me.id = m.user_b
    join public.profiles other
      on other.id = case when m.user_a = me.id then m.user_b else m.user_a end
    left join lateral (
      select msg.created_at, msg.body
        from public.messages msg
       where msg.match_id = m.id
       order by msg.created_at desc
       limit 1
    ) as last_message on true
   where not app.blocked_between(me.id, other.id)
   order by coalesce(last_message.created_at, m.created_at) desc;
$$;

revoke all on function public.my_matches() from public, anon;
grant execute on function public.my_matches() to authenticated, service_role;

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
   where b.blocker_id = app.require_any_user()
   order by b.created_at desc;
$$;

revoke all on function public.my_blocks() from public, anon;
grant execute on function public.my_blocks() to authenticated, service_role;
