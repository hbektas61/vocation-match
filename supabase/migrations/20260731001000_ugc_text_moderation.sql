-- Vocation Match — Apple Guideline 1.2, first requirement
-- "A method for filtering objectionable content from being posted to the app."
--
-- Until now nothing filtered anything. A display name, a bio, a message and a
-- report's free text all went to the database exactly as typed; the only
-- limits were length checks. A client-side check would not have helped: the
-- client is a program somebody else is running, and `messages` is an ordinary
-- insert with an RLS policy, so anything that can get a session can write a
-- row. So the filter lives where the write does.
--
-- Three things this is, said plainly, because overstating a filter is its own
-- kind of failure:
--
--   * It is server-authoritative. Removing the client check changes nothing.
--   * It is a *mechanism* plus a small seed. The term list is operational data
--     a moderator extends without a deploy — not a code artifact, and not a
--     claim that twenty rows make an app safe.
--   * It is text only. Photographs are not filtered by anything here, and the
--     board records that as an open owner decision rather than pretending
--     otherwise.
--
-- What it refuses, it refuses without keeping: the raised error carries a
-- category and never the submitted text, so a refused string reaches neither a
-- table nor a log line.

-- --------------------------------------------------------------- normalising
--
-- Two normal forms, because one cannot do both jobs.
--
-- `moderation_text` keeps word boundaries, so a term can be matched as a word
-- and "Scunthorpe" survives. `moderation_key` throws the boundaries away, so
-- "b a d", "b.a.d" and "b‑a‑d" all land on the same string — which is how the
-- separator trick is beaten, and which is *only* safe for terms long and
-- specific enough that an accidental substring is not a real risk.
--
-- Both are immutable and take the same route: compatibility forms first, then
-- the characters that render as nothing, then case, then accents, then the
-- tired substitutions.

create or replace function app.moderation_fold(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(
           regexp_replace(
             normalize(
               lower(
                 -- Zero-width joiners, bidi overrides and the soft hyphen are
                 -- invisible on screen. In a submitted string they are there
                 -- for one reason, so they are removed rather than folded.
                 --
                 -- Written as escapes, not as the characters themselves:
                 -- pasted literally this would be a line nobody could review.
                 -- Soft hyphen, the zero-width family and the direction marks,
                 -- the word joiner and its neighbours, and the BOM.
                 regexp_replace(
                   normalize(coalesce(p_text, ''), NFKC),
                   '[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]',
                   '', 'g')
               ),
               NFD),
             -- Combining marks, so an accent cannot hide a letter. Turkish
             -- dotted capitals lower-case to i plus a combining dot, which
             -- this same pass resolves back to a plain i.
             '[\u0300-\u036F]', '', 'g'),
           -- Digits and the two symbols people actually substitute. `!` and `|`
           -- were here and are gone: they read as `i` to a filter and as a
           -- full stop to everyone else, so they turned "WORLD!" into
           -- "worldi" and would have invented false positives out of ordinary
           -- punctuation. A weak evasion vector is not worth mangling every
           -- sentence that ends in an exclamation mark.
           '0134567@$', 'oieasgtas');
$$;

comment on function app.moderation_fold(text) is
  'Shared normalisation: NFKC, invisible characters stripped, case folded, accents dropped, common substitutions resolved.';

create or replace function app.moderation_text(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  -- Every run of anything that is not a letter or digit becomes one space, so
  -- word-boundary matching has boundaries to find.
  select btrim(regexp_replace(app.moderation_fold(p_text), '[^a-z0-9]+', ' ', 'g'));
$$;

create or replace function app.moderation_key(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(app.moderation_fold(p_text), '[^a-z0-9]+', '', 'g');
$$;

-- ------------------------------------------------------------- the term list
--
-- Deliberately in `app`, not `public`: no client role has any privilege on it,
-- so a member can neither read the list (which would be a map of how to evade
-- it) nor write to it.

create table app.moderation_terms (
  -- The normalised form, which is what matching actually compares against.
  term        text primary key,
  -- What a human typed when adding it. Kept so the list can be maintained by
  -- reading it, and so a false positive can be traced to its cause.
  source      text not null,
  category    text not null,
  match_mode  text not null default 'WORD',
  active      boolean not null default true,
  note        text,
  added_at    timestamptz not null default now(),

  constraint moderation_terms_category check (
    category in ('MINOR_SEXUALISATION', 'SOLICITATION', 'THREAT', 'SLUR')),
  constraint moderation_terms_mode check (match_mode in ('WORD', 'COLLAPSED')),
  constraint moderation_terms_not_blank check (btrim(term) <> '')
);

comment on table app.moderation_terms is
  'Operational data, not code: a moderator adds and retires terms without a deploy. '
  '`active = false` is the false-positive path — a term is retired, never deleted, so '
  'the reason it was once there stays readable.';

comment on column app.moderation_terms.match_mode is
  'WORD matches on word boundaries and is the default. COLLAPSED also matches across '
  'inserted separators, which defeats "b a d" but risks a substring hit — only for '
  'terms specific enough to carry that risk.';

alter table app.moderation_terms enable row level security;
alter table app.moderation_terms force row level security;
revoke all on table app.moderation_terms from anon, authenticated;
-- Moderation runs as service_role, and maintaining the list is the whole
-- false-positive path — without this grant a bad term could only be retired by
-- shipping a migration, which is the opposite of what the table is for.
grant select, insert, update on table app.moderation_terms to service_role;

create policy moderation_terms_service on app.moderation_terms
  for all to service_role
  using (true) with check (true);

-- ------------------------------------------------------------- the decision

create or replace function app.content_refusal(p_text text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  -- Returns the category that refused the text, or null. The *term* is never
  -- returned: a caller that learns which word tripped has been handed the
  -- means to work around the list.
  select t.category
    from app.moderation_terms t
   where t.active
     and (
       (t.match_mode = 'WORD'
         and app.moderation_text(p_text) ~ ('(^| )' || t.term || '( |$)'))
       or
       (t.match_mode = 'COLLAPSED'
         and strpos(app.moderation_key(p_text), t.term) > 0)
     )
   limit 1;
$$;

comment on function app.content_refusal(text) is
  'The category that refuses this text, or null. SECURITY DEFINER because no client '
  'role may read app.moderation_terms directly.';

revoke all on function app.content_refusal(text) from public, anon, authenticated;
grant execute on function app.content_refusal(text) to service_role;

create or replace function app.require_publishable(p_text text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_category text;
begin
  if p_text is null or btrim(p_text) = '' then
    return;
  end if;
  v_category := app.content_refusal(p_text);
  if v_category is not null then
    -- PC001 is the client's cue to show its own sentence, in the reader's own
    -- language. The category travels; the text does not. Postgres logs the
    -- message, so putting the submission in it would be the one place a
    -- refused string got written down.
    raise exception 'Content refused: %', v_category
      using errcode = 'PC001';
  end if;
end;
$$;

comment on function app.require_publishable(text) is
  'Raises PC001 when the text is refused. The exception carries a category and never '
  'the submission itself, so refused text is written to neither a table nor a log.';

revoke all on function app.require_publishable(text) from public, anon;
grant execute on function app.require_publishable(text) to authenticated, service_role;

-- ---------------------------------------------------------------- the gates
--
-- Triggers rather than RPCs, because the write paths that exist are inserts
-- and updates against tables. A trigger cannot be routed around by a client
-- that skips a function, which is the whole point.

create or replace function app.moderate_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_publishable(new.body);
  return new;
end;
$$;

create trigger messages_moderate_body
  before insert or update of body on public.messages
  for each row execute function app.moderate_message();

create or replace function app.moderate_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The two free-text fields a stranger reads before deciding anything.
  perform app.require_publishable(new.display_name);
  perform app.require_publishable(new.bio);
  return new;
end;
$$;

create trigger profiles_moderate_text
  before insert or update of display_name, bio on public.profiles
  for each row execute function app.moderate_profile();

-- A report's free text is read by a moderator, not by the person reported, so
-- the risk it carries is different — but it is still user-submitted text that
-- lands in a table, and Apple's requirement does not carve it out.
create or replace function app.moderate_report_details()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_publishable(new.details);
  return new;
end;
$$;

create trigger reports_moderate_details
  before insert or update of details on public.reports
  for each row execute function app.moderate_report_details();

-- ------------------------------------------------------------------- a seed
--
-- Small on purpose, and not the safety story. These are entries whose meaning
-- does not turn on context: sexualising a minor, and paid solicitation. Both
-- are things this product must refuse on sight and neither is a judgement call
-- a moderator needs to make later.
--
-- Slurs and harassment are deliberately *not* seeded here. They are real, they
-- matter, and they are also language whose boundaries move — which makes them
-- exactly the sort of list that belongs with the people who run moderation,
-- extended from the queue, rather than frozen into a migration by an engineer
-- guessing at a wordlist. The `SLUR` and `THREAT` categories exist so that
-- work has somewhere to land.

insert into app.moderation_terms (term, source, category, match_mode, note) values
  (app.moderation_text('child porn'),  'child porn',  'MINOR_SEXUALISATION', 'COLLAPSED', 'Unambiguous; collapsed so spacing tricks do not pass.'),
  (app.moderation_key('childporn'),    'childporn',   'MINOR_SEXUALISATION', 'COLLAPSED', null),
  (app.moderation_key('cp trade'),     'cp trade',    'MINOR_SEXUALISATION', 'COLLAPSED', 'Common euphemistic phrasing.'),
  (app.moderation_text('underage sex'),'underage sex','MINOR_SEXUALISATION', 'WORD',      null),
  (app.moderation_text('preteen'),     'preteen',     'MINOR_SEXUALISATION', 'WORD',      null),
  (app.moderation_text('escort service'), 'escort service', 'SOLICITATION',  'WORD',      'Paid solicitation, which this product does not host.'),
  (app.moderation_text('rate per night'), 'rate per night', 'SOLICITATION',  'WORD',      null)
on conflict (term) do nothing;

comment on column app.moderation_terms.source is
  'The human-readable form. The seed is a floor, not a claim of coverage — the '
  'operational list is expected to grow from the moderation queue.';
