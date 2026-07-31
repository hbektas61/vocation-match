-- Vocation Match — two writes that a dropped response could double.
--
-- Both were found by running the two-account journey against staging rather
-- than by reading the code: four concurrent sends of one message stored four
-- rows, and reporting the same person twice stored two reports.
--
-- The pattern is the same in each. The client cannot tell "the request failed"
-- apart from "the response was lost", so the honest thing for it to do on an
-- uncertain send is to retry — and the honest thing for the server to do is to
-- make that retry cost nothing. Everything else in this schema already works
-- this way: `swipes` is keyed on the pair, `matches` is a normalised unique
-- pair, `complete_onboarding` returns the existing timestamp. These two were
-- the exceptions.

-- ------------------------------------------------------ a message, sent once
--
-- The identity of a message is not its text: two people may well send "yes"
-- twice on purpose, and a schema that refused the second one would be worse
-- than the problem. So the sender names the attempt, and a retry of that
-- attempt carries the same name.

alter table public.messages
  add column client_token uuid;

comment on column public.messages.client_token is
  'Names one composed message so a retry can be recognised as the same send. '
  'Null is allowed: a client that does not supply one keeps the old behaviour, '
  'and no existing row has to be rewritten.';

-- Partial, because null tokens must not collide with each other.
create unique index messages_client_token_unique
  on public.messages (match_id, sender_id, client_token)
  where client_token is not null;

grant insert (match_id, sender_id, body, client_token) on table public.messages to authenticated;

-- ------------------------------------------------------- a report, filed once
--
-- An open report is a thing already in a queue. Filing it again does not tell a
-- moderator anything new; it makes the queue longer and the same complaint look
-- like a pattern. Once it has been reviewed, a *new* report is real information
-- again — the same person did something again — so the constraint deliberately
-- only covers reports that are still open.

-- Duplicates that already exist have to be resolved before the index can be
-- built, and this is a moderation record — so nothing is deleted. The earliest
-- open report per pair stays open and keeps its place in the queue; the later
-- ones are dismissed *as duplicates*, with the reason written into the row, so
-- the trail still explains itself to whoever reads it next.
--
-- Without this the migration fails on the first project that has ever taken a
-- repeat report, which is every project that has run for a while.
update public.reports r
   set status = 'DISMISSED',
       reviewed_at = coalesce(r.reviewed_at, now()),
       review_note = coalesce(r.review_note, 'Closed automatically: duplicate of an earlier open report from the same reporter about the same person.')
 where r.status = 'OPEN'
   and r.reporter_id is not null
   and r.reported_id is not null
   and exists (
     select 1 from public.reports earlier
      where earlier.status = 'OPEN'
        and earlier.reporter_id = r.reporter_id
        and earlier.reported_id = r.reported_id
        and (earlier.created_at, earlier.id) < (r.created_at, r.id)
   );

create unique index reports_one_open_per_pair
  on public.reports (reporter_id, reported_id)
  where status = 'OPEN';

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
  -- `require_any_user`, not `require_user`: a suspended account must still be
  -- able to report and block. Taking someone's safety tools away because they
  -- are under review is exactly backwards.
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

  -- Unchanged, and deliberately still charged on a repeat: the limit is there
  -- to stop the endpoint being hammered, and a repeat is still a request.
  perform app.rate_limit(v_user, 'report_user', 10, interval '1 hour');

  select uah.hotel_id into v_hotel
    from public.user_active_hotel uah
   where uah.user_id = v_user;

  -- An open report about this person by this reporter already exists: hand
  -- back the one already in the queue. The caller cannot tell a first report
  -- from a repeat, which is right — the answer to both is "reported".
  select r.id into v_id
    from public.reports r
   where r.reporter_id = v_user
     and r.reported_id = v_target
     and r.status = 'OPEN'
   limit 1;

  if v_id is null then
    insert into public.reports (reporter_id, reported_id, hotel_id, reason, details)
    values (v_user, v_target, v_hotel, p_reason, nullif(btrim(coalesce(p_details, '')), ''))
    returning id into v_id;
  end if;

  -- Outside the branch: somebody who reported, did not block, and has come
  -- back to do it properly must still end up blocked.
  if p_also_block then
    perform public.block_user(v_target);
  end if;

  return v_id;
end;
$$;

comment on function public.report_user(uuid, text, text, boolean) is
  'Files a report and, by default, blocks. Idempotent while the report is open: '
  'a second call returns the report already in the queue rather than lengthening it. '
  'Once a report has been reviewed, a new one is a new fact and is accepted.';

revoke all on function public.report_user(uuid, text, text, boolean) from public, anon;
grant execute on function public.report_user(uuid, text, text, boolean) to authenticated, service_role;
