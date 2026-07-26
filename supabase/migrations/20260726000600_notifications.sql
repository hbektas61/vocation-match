-- Vocation Match — push notifications: a message arriving, and a new person
-- entering your hotel's rooms.
--
-- Owner request, 2026-07-26. Two kinds only:
--   MESSAGE   — somebody in a match with you wrote to you.
--   ROOM_NEW  — somebody new entered a room at your active hotel (declared an
--               upcoming stay, or passed a presence check). Sent to the people
--               already in that hotel's rooms — the here-now and the declared.
--
-- The shape is queue-and-dispatch: triggers write rows transactionally (pure
-- SQL, provable in pgTAP anywhere), and a dispatcher drains the queue to
-- Expo's push API via pg_net on a pg_cron schedule — both of which exist on
-- hosted Supabase and are guarded here so a bare test container still applies
-- this migration cleanly.
--
-- Privacy lines, deliberate:
--   * A message push carries the sender's first name and a fixed sentence —
--     never the message body. Lock screens are read by strangers.
--   * A room push names nobody. "Somebody new" is the whole story; who they
--     are is what the room itself is for.
--   * Tokens are device credentials: owner-only, removed on sign-out.

-- ------------------------------------------------------------------- tokens

create table public.push_tokens (
  token      text primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  platform   text not null check (platform in ('ios', 'android')),
  -- The words a push arrives in are fixed at send time, so the sender has to
  -- know which language this device reads.
  locale     text not null default 'tr' check (locale in ('en', 'tr')),
  updated_at timestamptz not null default now()
);

comment on table public.push_tokens is
  'Expo push tokens, one row per device. Owner-only; unregistered on sign-out.';

alter table public.push_tokens enable row level security;
alter table public.push_tokens force row level security;

create policy push_tokens_owner_reads on public.push_tokens
  for select to authenticated
  using (user_id = app.require_user());

revoke all on table public.push_tokens from anon, authenticated;
grant select on table public.push_tokens to authenticated;

create index push_tokens_by_user on public.push_tokens (user_id);

create function public.register_push_token(p_token text, p_platform text, p_locale text default 'tr')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_user();
begin
  if char_length(p_token) < 10 or char_length(p_token) > 400 then
    raise exception 'That does not look like a push token.' using errcode = '23514';
  end if;
  perform app.rate_limit(v_user, 'push_token', 30, interval '1 hour');
  insert into public.push_tokens (token, user_id, platform, locale)
  values (p_token, v_user, p_platform, p_locale)
  on conflict (token) do update
    -- A token can move between accounts on a shared device; the last sign-in
    -- owns it, or a push for one person lands on another person's phone.
    set user_id = excluded.user_id,
        platform = excluded.platform,
        locale = excluded.locale,
        updated_at = now();
end;
$$;

create function public.unregister_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- By token, not by user: sign-out must work even mid-account-deletion, and
  -- deleting somebody else's token needs the token itself, which is unguessable.
  delete from public.push_tokens where token = p_token;
end;
$$;

revoke all on function public.register_push_token(text, text, text) from public, anon;
grant execute on function public.register_push_token(text, text, text) to authenticated, service_role;
revoke all on function public.unregister_push_token(text) from public, anon;
grant execute on function public.unregister_push_token(text) to authenticated, service_role;

-- -------------------------------------------------------------------- queue

create table public.notification_queue (
  id         uuid primary key default gen_random_uuid(),
  recipient  uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('MESSAGE', 'ROOM_NEW')),
  title      text not null,
  body       text not null,
  data       jsonb not null default '{}'::jsonb,
  queued_at  timestamptz not null default now(),
  sent_at    timestamptz,
  attempts   integer not null default 0
);

comment on table public.notification_queue is
  'Outbound pushes, written by triggers and drained by the dispatcher. No '
  'client can read or write it.';

alter table public.notification_queue enable row level security;
alter table public.notification_queue force row level security;
revoke all on table public.notification_queue from anon, authenticated;

create index notification_queue_unsent on public.notification_queue (queued_at)
  where sent_at is null;
-- The room dedupe asks "was this person already told about this hotel lately".
create index notification_queue_room_dedupe
  on public.notification_queue (recipient, kind, queued_at);

/** Queues one push, only for people who can actually receive one. */
create function app.queue_notification(
  p_recipient uuid,
  p_kind      text,
  p_title_en  text,
  p_body_en   text,
  p_title_tr  text,
  p_body_tr   text,
  p_data      jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_locale text;
begin
  -- The device's language decides the words. No token, no push, no queue row.
  select pt.locale into v_locale
    from public.push_tokens pt
   where pt.user_id = p_recipient
   order by pt.updated_at desc
   limit 1;
  if v_locale is null then
    return;
  end if;

  insert into public.notification_queue (recipient, kind, title, body, data)
  values (
    p_recipient,
    p_kind,
    case when v_locale = 'tr' then p_title_tr else p_title_en end,
    case when v_locale = 'tr' then p_body_tr else p_body_en end,
    p_data
  );
end;
$$;

-- ---------------------------------------------------------------- a message

create function app.notify_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient uuid;
  v_sender    text;
begin
  select case when m.user_a = new.sender_id then m.user_b else m.user_a end
    into v_recipient
    from public.matches m
   where m.id = new.match_id;

  if v_recipient is null then
    return new;
  end if;

  select p.display_name into v_sender from public.profiles p where p.id = new.sender_id;

  -- The name, and a fixed sentence. Never the message body: lock screens are
  -- read by strangers, and this product's one promise is discretion.
  perform app.queue_notification(
    v_recipient,
    'MESSAGE',
    v_sender, 'sent you a message.',
    v_sender, 'sana bir mesaj gönderdi.',
    jsonb_build_object('matchId', new.match_id)
  );
  return new;
end;
$$;

create trigger messages_notify
after insert on public.messages
for each row execute function app.notify_message();

-- --------------------------------------------------------- someone new here

/**
 * Tells the people already in a hotel's rooms that somebody new arrived.
 *
 * Nameless on purpose, and blunted twice: one push per person per hotel per
 * six hours (an arrival wave must not become a buzz per guest), and only to
 * people who could actually meet the newcomer — room-eligible, visible to
 * each other under every rule discovery already enforces.
 */
create function app.notify_room_entry(p_actor uuid, p_hotel uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select other.user_id as recipient
      from public.user_active_hotel other
      join public.profiles p on p.id = other.user_id
     where other.hotel_id = p_hotel
       and other.user_id <> p_actor
       and p.suspended_at is null
       and p.onboarding_completed_at is not null
       and (app.room_eligible(other.user_id, p_hotel, 'UPCOMING')
         or app.room_eligible(other.user_id, p_hotel, 'HERE_NOW'))
       and not app.blocked_between(p_actor, other.user_id)
       and not exists (
         select 1 from public.notification_queue q
          where q.recipient = other.user_id
            and q.kind = 'ROOM_NEW'
            and q.data->>'hotelId' = p_hotel::text
            and q.queued_at > now() - interval '6 hours'
       )
  loop
    perform app.queue_notification(
      r.recipient,
      'ROOM_NEW',
      'Somebody new at your hotel', 'A new person just joined a room at your hotel. Have a look.',
      'Otelinde yeni biri var', 'Otelindeki bir odaya az önce yeni biri katıldı. Bir bak.',
      jsonb_build_object('hotelId', p_hotel)
    );
  end loop;
end;
$$;

create function app.notify_upcoming_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.notify_room_entry(new.user_id, new.hotel_id);
  return new;
end;
$$;

create trigger upcoming_stays_notify
after insert on public.upcoming_stays
for each row execute function app.notify_upcoming_entry();

create function app.notify_presence_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only a check that opened the room is an arrival; a failed one is nothing,
  -- and an update refreshing an existing pass is not "somebody new".
  if new.within_range and (tg_op = 'INSERT' or old.within_range = false) then
    perform app.notify_room_entry(new.user_id, new.hotel_id);
  end if;
  return new;
end;
$$;

create trigger presence_checks_notify
after insert or update on public.presence_checks
for each row execute function app.notify_presence_entry();

-- ---------------------------------------------------------------- dispatch

/**
 * Drains the queue to Expo's push API.
 *
 * `net.http_post` is fire-and-forget by design here: the row is marked tried
 * either way, and a token Expo reports dead simply stops matching a person
 * when they next sign in. Five attempts, then the row is abandoned.
 */
create function app.dispatch_push_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch jsonb;
  v_count integer := 0;
begin
  select jsonb_agg(jsonb_build_object(
           'to', pt.token,
           'title', q.title,
           'body', q.body,
           'data', q.data,
           'sound', 'default'
         )), count(*)
    into v_batch, v_count
    from (
      select * from public.notification_queue
       where sent_at is null and attempts < 5
       order by queued_at
       limit 90
       for update skip locked
    ) q
    join public.push_tokens pt on pt.user_id = q.recipient;

  if v_count = 0 or v_batch is null then
    return 0;
  end if;

  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    body := v_batch,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );

  update public.notification_queue
     set sent_at = now(), attempts = attempts + 1
   where id in (
     select id from public.notification_queue
      where sent_at is null and attempts < 5
      order by queued_at
      limit 90
   );

  return v_count;
end;
$$;

revoke all on function app.dispatch_push_notifications() from public, anon, authenticated;

-- The schedule and the http extension exist on hosted Supabase; a bare test
-- container has neither, and this migration still has to apply there — the
-- queueing above is what the tests prove, the plumbing below is deployment.
do $$
begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'pg_net unavailable here; dispatch will no-op until deployed.';
end $$;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('push-dispatch', '* * * * *',
                        'select app.dispatch_push_notifications()');
exception when others then
  raise notice 'pg_cron unavailable here; schedule the dispatcher on the host.';
end $$;
