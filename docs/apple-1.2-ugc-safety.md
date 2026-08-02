# Apple Guideline 1.2 — user-generated content

Apple asks an app with user-generated content for five things. This page says,
for each, what exists today, what was added on 2026-07-31, and what is still
open. It is written to be checkable rather than reassuring: a claim here that
nobody can verify is worse than an admission.

## The five requirements, one by one

| # | Apple's requirement | Status |
|---|---|---|
| 1 | A method for filtering objectionable content from being posted | 🟡 **text yes, photographs no** |
| 2 | A mechanism to report offensive content | ✅ in the app since D-008 |
| 3 | The ability to block abusive users | ✅ and verified bidirectionally on staging |
| 4 | Published contact information so users can reach the developer | 🔴 **O-04 — no verified address exists** |
| 5 | Acting on reports and ejecting offenders in a timely manner | 🟡 mechanism yes, staffed process is an owner commitment |

## 1. Filtering — what was added

Before 2026-07-31 nothing filtered anything. A display name, a bio, a message
and a report's free text went to the database exactly as typed; the only limits
were length checks. The client could not have helped: `messages` is an ordinary
insert with an RLS policy, so anything holding a session can write a row.

`20260731001000_ugc_text_moderation.sql` puts the filter where the write is —
BEFORE INSERT/UPDATE triggers on `public.messages` and `public.profiles`
(display name and bio). Removing the client check changes nothing, which is
the test.

It also covered `reports.details` for one day, and that was a mistake worth
recording. A report's free text is where somebody types what was said to them;
filtering it refuses the report exactly when the abuse was worst, and silences
the person the feature exists for. `20260801000100` removed that trigger. What
keeps the field safe is not a filter: it is the 1000-character bound, the
single RPC write path, the rate limit, and the fact that only the reporter can
ever read it.

**Evasion is the part worth describing.** A filter that only catches the word
typed plainly catches nobody who is trying, so submissions are normalised
before matching: NFKC, then invisible characters removed outright (soft hyphen,
the zero-width family, bidi overrides, the BOM), then case folded, then accents
dropped, then the common substitutions resolved (`0`→`o`, `1`→`i`, `@`→`a`, and
so on). Two normal forms exist because one cannot do both jobs: `moderation_text`
keeps word boundaries so ordinary words survive, and `moderation_key` throws
them away so `b a d`, `b.a.d` and `b‑a‑d` land on one string. Terms choose which
they need. `supabase/tests/025_ugc_moderation.sql` asserts each trick.

**Refused text is not kept.** The raised error (`PC001`) carries a category and
never the submission, so nothing refused reaches a table or a Postgres log line.
The client turns `PC001` into its own sentence, in TR or EN, which is
deliberately not a telling-off: most people who see it made a mistake.

**What this is not.** The seed list is seven entries covering sexualisation of
minors and paid solicitation — things whose meaning does not turn on context.
Slurs and threats are real and are deliberately *not* frozen into a migration
by an engineer guessing at a word list; the categories exist so that work can
land from the moderation queue. `app.moderation_terms` is operational data a
moderator edits without a deploy, and retiring a term (`active = false`) is the
false-positive path — the row stays, so why it was once there stays readable.

Saying "all UGC is filtered" would be false. **Photographs are not filtered by
anything.** See the open decision below.

## 2–3. Reporting and blocking — what was already true

Both predate this work and both were verified against the staging backend with
two real accounts (`scripts/staging-e2e.mjs`, 32/32):

- Reporting is in the chat menu and in the report screen: six reasons, submit
  gated on choosing one, and blocking is offered in the same action.
- The reporter is never disclosed. RLS lets a reporter read their own reports
  and nobody read reports filed about them; `moderation_actions` is readable by
  no client role at all.
- A block is **bidirectional in effect**: each disappears from the other's deck,
  no new match can form, and neither side can write into an existing
  conversation. The blocked person is never told — they see no block row and no
  report row.

Added on 2026-07-31: **reporting the same person twice no longer multiplies the
report.** It returned a new row each time, which made one complaint look like a
pattern and lengthened the queue for nothing. A repeat now returns the report
already open (`20260731001100`). Once a report has been *reviewed*, a new one is
new information again and is accepted.

## 4. Contact information — open, and it is a submission blocker

Apple requires published contact information that reaches the developer. There
is **no verified support address or domain in this repository**, and inventing
one would be worse than leaving it blank: a support address that bounces is a
rejection with extra steps.

**There is no support row in Settings today.** An earlier draft of this page
said its place was ready, which was not true — nothing was added. Adding a row
that opens nothing, or that opens an address which bounces, is worse than the
gap: it turns "we have not done this yet" into "we did this badly". The row
goes in when there is an address to put behind it, and it is one screen's work
once there is.

**What Hami has to supply (O-04):**

1. A support email address that a person actually reads.
2. An HTTPS support URL on a domain you control (a single page is enough; it
   must state how to report a problem and how long a reply takes).

Both go in App Store Connect *and* in the app's Settings. Neither can be
generated here.

## 5. Timely action — the operational checklist

The mechanism exists: reports carry `OPEN → REVIEWING → ACTIONED → DISMISSED`,
`moderation_actions` is an append-only trail, three distinct reporters raise a
`FLAGGED` row automatically, and `resolve_report` is the only way a status
moves. What Apple asks for beyond the mechanism is that somebody is actually
looking. That is a commitment, not a feature.

**Daily, while the pilot is live:**

```sql
-- the queue, oldest first
select id, reason, created_at from public.reports where status = 'OPEN' order by created_at;
-- anyone the system has flagged for a pile-on
select subject_id, count(*) from public.moderation_actions where action = 'FLAGGED' group by 1;
```

- Anything reported as `UNDERAGE` or `SAFETY` is looked at **first and same
  day**, ahead of the queue order.
- Everything else: acknowledged within 24 hours of arriving.
- Acting on a report means calling `resolve_report`, which writes the decision
  and the trail together. Editing `reports.status` by hand loses the trail.
- Suspending sets `profiles.suspended_at`: the account leaves every room and can
  no longer send, but keeps its own safety tools — a suspended member can still
  block and report, which is deliberate.

**What we cannot do, said plainly.** A suspension is per-account. Somebody who
is ejected can obtain a new phone number and sign up again, and nothing here
prevents that; phone verification raises the cost of a second account, it does
not make one impossible. There is no device-level or carrier-level ban, and
claiming otherwise to a reviewer would be false.

## Why this is not an anonymous chat app

Worth stating for Review Notes, without overclaiming:

- Every account is a phone-verified `auth.users` row, and identity persists
  across sessions and reinstalls — which is what makes a suspension mean
  anything.
- A profile must be completed before discovery: name, birthdate, an 18+ check
  the server enforces, and the identity answers.
- **Conversation requires a mutual match.** There is no public room, no
  directory, no message to a stranger, and no paid "message anyone" — v1 has no
  premium DM at all.
- Everybody in a room shares a real-world context: the same vacation venue with
  overlapping dates, the same neighbourhood check-in, or the same event.

The first of those is now enforced by the database rather than asserted.
`20260801000200` added `app.current_user_has_verified_phone()`, read from
`auth.users.phone_confirmed_at` — never from the JWT or user metadata, both of
which the user can write — and a profile cannot be created without it.

⚠️ Two things remain true and belong here rather than in a footnote:

- The gate is on **creating** a profile. Existing rows are not revalidated,
  because locking real people out of accounts they already have is not a
  migration's decision. Staging carries **9 profiles whose account never proved
  a phone**, from before phone-only sign-in. They are inert with respect to new
  signups and they are still there. The safe cleanup is: list them, confirm
  none has a match or a message, and delete the accounts through
  `delete_my_account` semantics rather than by hand — an owner decision,
  because a wrong deletion is not reversible.
- The hosted project still accepts **email sign-in**, so a session without a
  phone is still obtainable. It can no longer become a profile, which was the
  hole that mattered, but the setting should still be off.
  `scripts/verify-hosted-auth.mjs` reports it and O-12 stays open.

## Draft for App Store Review Notes

> Vacation Match connects adults who are staying at, or travelling to, the same
> vacation venue. Accounts are created with phone verification and a completed
> profile; the app is 18+ and the age check is enforced on the server.
>
> Messaging requires a mutual match. There are no public chat rooms, no
> directory of members, and no way to message someone who has not matched with
> you.
>
> User-submitted text is filtered server-side before it is stored. Every profile
> and conversation has Report and Block; reporting also blocks by default.
> Blocking is bidirectional and immediate. Reports enter a moderation queue with
> an auditable status trail, reviewed daily.
>
> Profile photographs are reviewed on report rather than automatically at upload;
> this is stated rather than implied.

## Open owner decisions

| # | Decision | Why it is yours |
|---|---|---|
| O-04 | Support email + HTTPS support URL | Apple requirement 4. Cannot be invented. |
| O-11 | **Photo moderation.** Automatic image classification needs a third-party provider with an account and a bill. The alternatives are (a) review-on-report only, stated plainly, or (b) fund a provider. | New paid third party, and a policy choice about what gets reviewed before it is seen. |
| O-12 | **Hosted auth drift.** Turn email sign-in off, and either enforce CAPTCHA or disable the SMS provider. | Dashboard settings; no migration reaches them. |
