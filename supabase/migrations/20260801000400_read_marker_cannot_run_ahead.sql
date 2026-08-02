-- `mark_match_read` took any sequence it was given.
--
-- Passing a number larger than anything in the conversation marked messages
-- read that had not been written yet — and because the marker is monotonic and
-- never moves backwards, that conversation could never show unread again. One
-- call with a big enough integer and the badge is off for good.
--
-- It only damages the caller's own inbox, which is why it is a defect rather
-- than a vulnerability. But "you can only break your own" is a poor reason to
-- accept a value the server knows to be impossible, and it was found the
-- honest way: an end-to-end run passed 999999 to test something else and the
-- next assertion, about a reply being unread, quietly went green when it
-- should have been red.
--
-- The fix is to clamp rather than to reject. A client that says "I have read
-- everything" by sending a large number is not misbehaving, it is being
-- imprecise, and refusing it would turn a harmless imprecision into an error
-- somebody has to handle. Read-up-to is capped at what actually exists.

create or replace function public.mark_match_read(p_match_id uuid, p_seq bigint default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   uuid := app.require_any_user();
  v_latest bigint;
  v_seq    bigint;
begin
  if not app.is_match_participant(p_match_id, v_user) then
    raise exception 'That conversation is not yours.' using errcode = '42501';
  end if;

  select coalesce(max(msg.seq), 0) into v_latest
    from public.messages msg
   where msg.match_id = p_match_id;

  -- Null still means "everything currently in it", which is what opening a
  -- conversation means. A number means "up to here" — and here cannot be
  -- somewhere the conversation has not reached.
  v_seq := least(coalesce(p_seq, v_latest), v_latest);

  insert into public.match_reads (match_id, user_id, last_read_seq)
  values (p_match_id, v_user, v_seq)
  on conflict (match_id, user_id) do update
    set last_read_seq = greatest(public.match_reads.last_read_seq, excluded.last_read_seq),
        updated_at = now();

  return (select r.last_read_seq from public.match_reads r
           where r.match_id = p_match_id and r.user_id = v_user);
end;
$$;

comment on function public.mark_match_read(uuid, bigint) is
  'Marks a conversation read up to a sequence, or up to its latest message. Monotonic, '
  'idempotent, and clamped to what the conversation actually contains — a marker cannot '
  'be pushed past the last message and silence future ones.';

revoke all on function public.mark_match_read(uuid, bigint) from public, anon;
grant execute on function public.mark_match_read(uuid, bigint) to authenticated, service_role;
