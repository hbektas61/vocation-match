-- Apple Guideline 1.2, first requirement: objectionable content is filtered
-- *before* it is posted, by the server, on every surface that takes free text.
--
-- The evasion cases are the point of this file. A filter that only catches the
-- word typed plainly is a filter that catches nobody who is trying, so each
-- trick gets its own assertion: spacing, punctuation, case, accents, digits
-- standing in for letters, and the invisible characters that exist for no
-- other purpose.
--
-- Two negative controls live at the bottom. They fail if the filter is turned
-- off or routed around, which is the only way this file keeps meaning as the
-- schema changes under it.
begin;
set search_path = extensions, public, tests, pg_catalog;
select no_plan();

select tests.create_member('ada@example.test', '00000000-0000-0000-0000-0000000000a1', 'Ada');
select tests.create_member('bo@example.test',  '00000000-0000-0000-0000-0000000000b1', 'Bo');

create temp table h as select tests.create_hotel('Bosphorus Grand', 41.0369, 28.9850) as one;
grant select on h to anon, authenticated;

-- A real conversation to write into: the message gate is on the table, so it
-- needs a match that genuinely exists.
create or replace function tests.join_upcoming(p_user uuid) returns void
language plpgsql as $$
begin
  perform tests.authenticate_as(p_user);
  perform public.set_active_hotel((select id from public.hotels limit 1));
  perform public.declare_upcoming_stay(current_date + 1, current_date + 4);
end;
$$;
grant execute on function tests.join_upcoming(uuid) to anon, authenticated;

select tests.join_upcoming('00000000-0000-0000-0000-0000000000a1');
select tests.join_upcoming('00000000-0000-0000-0000-0000000000b1');
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');
select public.swipe('00000000-0000-0000-0000-0000000000b1', 'UPCOMING', 'LIKE');
select tests.authenticate_as('00000000-0000-0000-0000-0000000000b1');
select public.swipe('00000000-0000-0000-0000-0000000000a1', 'UPCOMING', 'LIKE');

create temp table m as select id from public.matches limit 1;
grant select on m to anon, authenticated;

-- ------------------------------------------------------- normalisation itself

select is(
  app.moderation_text('  Héllo,   WÖRLD!  '),
  'hello world',
  'case, accents and punctuation all fold into one plain form'
);

select is(
  app.moderation_key('c.h.i.l.d p o r n'),
  'childporn',
  'the collapsed key throws away every separator somebody might insert'
);

select is(
  app.moderation_key('ch' || chr(8203) || 'ildporn'),
  'childporn',
  'a zero-width space is removed rather than treated as a boundary'
);

select is(
  app.moderation_key('CH1LDP0RN'),
  'childporn',
  'digits standing in for letters resolve to the letters'
);

-- ------------------------------------------------------------- the message gate

select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');

select throws_ok(
  $$insert into public.messages (match_id, sender_id, body)
    values ((select id from m), '00000000-0000-0000-0000-0000000000a1', 'want some child porn')$$,
  'PC001',
  null,
  'a refused message is refused at the table, not by the client'
);

select throws_ok(
  $$insert into public.messages (match_id, sender_id, body)
    values ((select id from m), '00000000-0000-0000-0000-0000000000a1', 'c h i l d   p o r n ?')$$,
  'PC001',
  null,
  'spacing it out does not get it through'
);

select throws_ok(
  $$insert into public.messages (match_id, sender_id, body)
    values ((select id from m), '00000000-0000-0000-0000-0000000000a1', 'CH1LD-P0RN')$$,
  'PC001',
  null,
  'nor do digits and a hyphen'
);

select lives_ok(
  $$insert into public.messages (match_id, sender_id, body)
    values ((select id from m), '00000000-0000-0000-0000-0000000000a1', 'Shall we meet by the pool at six?')$$,
  'an ordinary message is untouched'
);

-- Scunthorpe. A WORD term sitting inside a longer word must not fire: that is
-- what the WORD/COLLAPSED split is for, and getting it wrong is the most
-- common way a content filter turns into a bug report.
-- Asserted through the write path rather than by calling the decision
-- function: a member has no privilege on it, and that is deliberate — being
-- able to ask "is this refused?" is being able to enumerate the list.
select lives_ok(
  $$insert into public.messages (match_id, sender_id, body)
    values ((select id from m), '00000000-0000-0000-0000-0000000000a1', 'The supreteenagers played well!')$$,
  'a WORD term buried inside a longer word does not refuse the message, and an '
  'exclamation mark is still punctuation — this line once folded to "welli"'
);

select is(
  (select count(*)::int from public.messages),
  2,
  'exactly the two allowed messages are stored — nothing refused reached the table'
);

-- ------------------------------------------------------------- the profile gate

select throws_ok(
  $$update public.profiles set display_name = 'preteen fan'
     where id = '00000000-0000-0000-0000-0000000000a1'$$,
  'PC001',
  null,
  'a display name goes through the same gate'
);

select throws_ok(
  $$update public.profiles set bio = 'escort service, ask me'
     where id = '00000000-0000-0000-0000-0000000000a1'$$,
  'PC001',
  null,
  'and so does a bio'
);

select is(
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'),
  'Ada',
  'the refused name never replaced the stored one'
);

-- --------------------------------------------------------------- report details

select throws_ok(
  $$select public.report_user('00000000-0000-0000-0000-0000000000b1', 'HARASSMENT', 'preteen')$$,
  'PC001',
  null,
  'a report is a write of user text too, and is gated the same way'
);

select lives_ok(
  $$select public.report_user('00000000-0000-0000-0000-0000000000b1', 'HARASSMENT', 'Sent me something I did not ask for.')$$,
  'an ordinary report goes through'
);

-- ------------------------------------------------------- the maintenance path

select tests.authenticate_as_service();

select lives_ok(
  $$update app.moderation_terms set active = false where source = 'preteen'$$,
  'a false positive can be retired without a deploy'
);

select ok(
  app.content_refusal('preteen') is null,
  'and the retired term stops refusing immediately'
);

select ok(
  (select count(*) from app.moderation_terms where source = 'preteen') = 1,
  'retiring keeps the row, so why it was once there stays readable'
);

-- ----------------------------------------------------------- negative controls
--
-- These two assert that the guard is load-bearing. If somebody drops the
-- trigger or empties the list, the suite goes red here rather than silently
-- passing an app with no filter in it.

select ok(
  exists (
    select 1 from pg_trigger
     where tgrelid = 'public.messages'::regclass
       and tgname = 'messages_moderate_body'
       and not tgisinternal
  ),
  'the message gate is a trigger on the table — removing it must fail this test'
);

select ok(
  exists (
    select 1 from pg_trigger
     where tgrelid = 'public.profiles'::regclass
       and tgname = 'profiles_moderate_text'
       and not tgisinternal
  ),
  'and so is the profile gate'
);

-- The list is not readable by a member: knowing it is knowing how to walk
-- around it.
select tests.authenticate_as('00000000-0000-0000-0000-0000000000a1');

select throws_ok(
  $$select count(*) from app.moderation_terms$$,
  '42501',
  null,
  'a member cannot read the term list'
);

select throws_ok(
  $$insert into app.moderation_terms (term, source, category) values ('x', 'x', 'SLUR')$$,
  '42501',
  null,
  'nor write to it'
);

select * from finish();
rollback;
