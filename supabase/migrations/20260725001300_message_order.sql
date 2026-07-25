-- Vocation Match — deterministic message order.
--
-- `messages.created_at` defaults to `now()`, which is the *transaction*
-- timestamp, not the wall clock. Two messages written in one transaction get
-- the identical value, so "the last message" was a coin flip between them.
-- In production each message is its own request and the tie is rare, which is
-- exactly what makes it the sort of bug that shows up once, in front of
-- someone, and cannot be reproduced.
--
-- Found by the rate-limit trigger changing insert order in a test that had
-- been passing on luck.
--
-- An identity column gives a total order that does not depend on clock
-- resolution or on how many statements share a transaction.

alter table public.messages
  add column seq bigint generated always as identity;

create index messages_match_seq_idx on public.messages (match_id, seq);

grant select (id, match_id, sender_id, body, created_at, seq)
  on table public.messages to authenticated;

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
       order by msg.seq desc
       limit 1
    ) as last_message on true
   where not app.blocked_between(me.id, other.id)
   order by coalesce(last_message.created_at, m.created_at) desc, m.id;
$$;

revoke all on function public.my_matches() from public, anon;
grant execute on function public.my_matches() to authenticated, service_role;
