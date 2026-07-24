-- Vocation Match — N-008
-- Persistent chat between matched users, delivered over Supabase Realtime.
--
-- Messages are written straight to the table rather than through an RPC: the
-- insert policy carries every rule (you are in this match, the match is still
-- open, neither side has blocked the other, you are not suspended), and it is
-- the same policy Realtime applies when deciding what to stream to a
-- subscriber. One rule, one place, both paths.

create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references public.matches (id) on delete cascade,
  sender_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),

  constraint messages_body_length check (char_length(btrim(body)) between 1 and 2000)
);

create index messages_match_idx on public.messages (match_id, created_at);

create or replace function app.is_match_participant(p_match_id uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.matches m
     where m.id = p_match_id
       and (m.user_a = p_user or m.user_b = p_user)
  );
$$;

-- Sending has more conditions than reading: history stays visible after an
-- unmatch, but nothing new can be added to it.
--
-- SECURITY DEFINER matters here. A block is only visible to the person who made
-- it, so a policy evaluated with the sender's own privileges would not see that
-- the *other* side blocked them, and would let the message through.
create or replace function app.can_send_message(p_match_id uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.matches m
      join public.profiles me on me.id = p_user
     where m.id = p_match_id
       and m.unmatched_at is null
       and (m.user_a = p_user or m.user_b = p_user)
       and me.suspended_at is null
       and not exists (
         select 1 from public.blocks b
          where (b.blocker_id = m.user_a and b.blocked_id = m.user_b)
             or (b.blocker_id = m.user_b and b.blocked_id = m.user_a)
       )
  );
$$;

revoke all on function app.is_match_participant(uuid, uuid) from public, anon;
revoke all on function app.can_send_message(uuid, uuid) from public, anon;
grant execute on function app.is_match_participant(uuid, uuid) to authenticated, service_role;
grant execute on function app.can_send_message(uuid, uuid) to authenticated, service_role;

alter table public.messages enable row level security;
alter table public.messages force row level security;
revoke all on table public.messages from anon, authenticated;
grant select on table public.messages to authenticated;
-- `created_at` is not in the list: a sender who could choose it could reorder
-- someone else's conversation.
grant insert (match_id, sender_id, body) on table public.messages to authenticated;

create policy messages_select_participants on public.messages
  for select to authenticated
  using (app.is_match_participant(match_id, app.current_user_id()));

create policy messages_insert_own on public.messages
  for insert to authenticated
  with check (
    sender_id = app.current_user_id()
    and app.can_send_message(match_id, app.current_user_id())
  );

-- Realtime streams inserts to subscribers, filtered by the select policy above.
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.matches;

-- The inbox: one row per conversation with the other person's card.
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
  with me as (select app.current_user_id() as id)
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
