-- Read state, which the product has never had.
--
-- The inbox could show that a conversation existed and what its last line was,
-- and nothing else: there was no read receipt, no last-read marker, no unread
-- count anywhere in the schema. The client said so in its own comment — "no
-- unread dot on the inbox tab (no read-state exists)" — which was honest, and
-- also meant somebody could open the app and have no way to tell which of five
-- conversations had something new in it.
--
-- The model is one row per (match, reader) holding the highest message
-- sequence that reader has seen. `messages.seq` is a generated identity, so it
-- is monotonic per table and totally ordered within a match, which makes "seen
-- up to here" a single number rather than a set. No per-message receipt, and
-- deliberately no *delivered* or *seen-by-them* state: this is for the reader's
-- own inbox, not a signal sent to the other person.

create table public.match_reads (
  match_id      uuid   not null references public.matches (id) on delete cascade,
  user_id       uuid   not null references public.profiles (id) on delete cascade,
  last_read_seq bigint not null default 0,
  updated_at    timestamptz not null default now(),

  primary key (match_id, user_id)
);

comment on table public.match_reads is
  'How far one person has read one conversation. Written only through mark_match_read, '
  'which derives the reader from the JWT — so nobody can mark somebody else''s '
  'conversation read, or unread.';

alter table public.match_reads enable row level security;
alter table public.match_reads force row level security;
revoke all on table public.match_reads from anon, authenticated;
-- Select only. Every write goes through the function below, so the monotonic
-- rule cannot be skipped by writing the row directly.
grant select on table public.match_reads to authenticated;

create policy match_reads_select_own on public.match_reads
  for select to authenticated
  using (user_id = app.current_user_id());

-- ------------------------------------------------------------ marking read

create or replace function public.mark_match_read(p_match_id uuid, p_seq bigint default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_any_user();
  v_seq  bigint;
begin
  if not app.is_match_participant(p_match_id, v_user) then
    raise exception 'That conversation is not yours.' using errcode = '42501';
  end if;

  -- Null means "everything currently in it", which is what opening a
  -- conversation means. A caller may pass a specific sequence instead, which
  -- is what a client does when it knows what was actually on screen.
  v_seq := coalesce(p_seq, (select max(msg.seq) from public.messages msg where msg.match_id = p_match_id), 0);

  insert into public.match_reads (match_id, user_id, last_read_seq)
  values (p_match_id, v_user, v_seq)
  on conflict (match_id, user_id) do update
    -- Never backwards. Two devices, or a retry arriving late, must not be able
    -- to turn a read conversation unread again.
    set last_read_seq = greatest(public.match_reads.last_read_seq, excluded.last_read_seq),
        updated_at = now();

  return (select r.last_read_seq from public.match_reads r
           where r.match_id = p_match_id and r.user_id = v_user);
end;
$$;

comment on function public.mark_match_read(uuid, bigint) is
  'Marks a conversation read up to a sequence, or up to its latest message. Idempotent '
  'and monotonic: calling it twice, or late, changes nothing.';

revoke all on function public.mark_match_read(uuid, bigint) from public, anon;
grant execute on function public.mark_match_read(uuid, bigint) to authenticated, service_role;

-- --------------------------------------------------- the inbox, with counts
--
-- The return type changes, so this is a drop rather than a replace.

drop function if exists public.my_matches();

create or replace function public.my_matches()
returns table (
  match_id          uuid,
  other_user_id     uuid,
  display_name      text,
  age               integer,
  photo_path        text,
  room              text,
  created_at        timestamptz,
  unmatched_at      timestamptz,
  last_message_at   timestamptz,
  last_message_body text,
  unread_count      integer
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
         other.photo_path,
         m.room,
         m.created_at,
         m.unmatched_at,
         last_message.created_at,
         last_message.body,
         coalesce(unread.n, 0)::integer
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
    left join lateral (
      -- Only the other person's messages count. Your own are read by
      -- definition, and counting them would make every conversation you spoke
      -- in look unanswered.
      select count(*) as n
        from public.messages msg
       where msg.match_id = m.id
         and msg.sender_id <> me.id
         and msg.seq > coalesce(
               (select r.last_read_seq from public.match_reads r
                 where r.match_id = m.id and r.user_id = me.id), 0)
    ) as unread on true
   where not app.blocked_between(me.id, other.id)
   order by coalesce(last_message.created_at, m.created_at) desc, m.id;
$$;

revoke all on function public.my_matches() from public, anon;
grant execute on function public.my_matches() to authenticated, service_role;

-- ------------------------------------------------------------- the tab mark

create or replace function public.unread_total()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  -- Blocked conversations are already excluded by my_matches, and they stay
  -- excluded here: a block should not leave a badge somebody cannot clear
  -- without going back into a conversation they left.
  select coalesce(sum(t.unread_count), 0)::integer from public.my_matches() t;
$$;

comment on function public.unread_total() is
  'One number for the tab: how many messages are waiting across every conversation.';

revoke all on function public.unread_total() from public, anon;
grant execute on function public.unread_total() to authenticated, service_role;
