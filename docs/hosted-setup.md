# Setting up the hosted Supabase project

Everything in `supabase/migrations/` travels with the repository. Everything on
this page does not: these are project settings that live in the Supabase
dashboard, and nothing in `scripts/check.sh` can see them. That is exactly why
they need writing down — a project missing any of them passes every test we have
and is still wrong.

This is owner work. No credential, key, or password belongs in this repository,
and none of the steps here should be automated with one.

## Current staging status — 2026-07-25

The hosted staging project is `vocation-match-staging`
(`ftdqkhkeluokpdghzubp`, Frankfurt). All migrations through
`20260725002300` are applied and match the local migration history.

- Email confirmation is on; the site and redirect URL are
  `vocationmatch://`; passwords require at least 8 characters; refresh-token
  rotation and secure password changes are on.
- Hosted email sending is limited to 2 per hour. CAPTCHA is still off because
  it requires an owner-controlled CAPTCHA provider account and secret.
- The mobile app uses the project's public `sb_publishable_...` key from the
  ignored `mobile/.env.local`. No backend key is stored in the repository.
- Legacy JWT-based `anon` and `service_role` API keys are disabled. New work
  must use publishable keys in clients and independently rotatable secret keys
  in backend workers.
- The storage cleanup worker and real-device checks remain outstanding.

## 1. Turn on email confirmation

**Dashboard → Authentication → Providers → Email → "Confirm email": on.**

This is the setting backlog item S-003 is about. With it off:

- anyone can sign up as any address, including one that is not theirs;
- a sign-up returns a session immediately, so nobody ever confirms anything.

`supabase/config.toml` has it on, and `scripts/verify-auth-config.js` fails the
build if that changes — but `config.toml` is only read by the local CLI. The
hosted project keeps its own copy of this setting, and turning it off there is
silent.

The app expects confirmation to be on. `signUp()` returns
`{ status: 'CONFIRMATION_REQUIRED' }` rather than a session, and the sign-in
screen has a "check your email" state with a resend button
(`mobile/src/screens/AuthScreen.tsx`). If confirmation is off, that state simply
never appears.

While you are on that page:

- **Site URL**: `vocationmatch://`
- **Redirect URLs**: `vocationmatch://`
- **Minimum password length**: 8 or more.
- **Refresh token rotation**: on.

## 1b. Bound the mail, and put a CAPTCHA in front of sign-up

**Dashboard → Authentication → Rate Limits**, and **→ Attack Protection →
CAPTCHA**.

Confirmation email is the one thing this configuration lets a stranger make the
server do to somebody else. Both endpoints that send it — sign-up and resend —
are public, because the anon key is meant to ship in a client. Without a bound,
a script can point them at a real person's inbox and keep going; it needs no
account and tells the attacker nothing, which is exactly what makes it cheap.

- **Rate limit for sending emails**: no higher than 30 per hour. `config.toml`
  uses 10 locally and `scripts/verify-auth-config.js` fails the build above 30,
  but the hosted project keeps its own number.
- **Rate limit for sign-ups and sign-ins**: no higher than 60 per five minutes
  per IP.
- **CAPTCHA**: on, for sign-up. A rate limit slows one source down; a CAPTCHA is
  what stops a distributed one.

Nothing in this repository can check any of these. They are the reason this
page exists.

## 2. Create the profile-photos bucket

The migration `20260725001400_profile_photos.sql` creates it by inserting into
`storage.buckets`, so applying the migrations is enough. Confirm afterwards, in
**Storage → Buckets**, that `profile-photos` is:

- **not public** — a public bucket hands out a permanent URL for every object in
  it, which is the beacon decision D-014 exists to close;
- limited to 5 MB;
- limited to `image/jpeg`, `image/png`, `image/webp`.

And in **Storage → Policies**, that the four policies on `storage.objects` are
present and none of them is granted to `anon`.

## 3. Run something that drains the storage cleanup queue

`public.storage_cleanup_queue` records objects whose metadata row has been
removed — a replaced photo, a deleted account — but whose bytes are still in the
object store. The database cannot delete those; only the storage API can. So the
database does its half and hands the rest to a worker:

```
-- as service_role, on a schedule
select * from claim_storage_cleanup(100);       -- a batch nobody else holds
-- ... delete each object_name from its bucket via the storage API ...
select mark_storage_cleanup_purged(array[...]); -- record what was reported gone
```

`claim_storage_cleanup` uses `for update skip locked`, so two workers never hand
the same object to the storage API at once, and running it twice for the same
object is harmless anyway.

The worker itself is `scripts/drain-storage-cleanup.js`. It is plain Node with
no dependencies, so it runs anywhere a schedule can run it — GitHub Actions, a
cron box, or wrapped in an Edge Function:

```sh
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SECRET_KEY=sb_secret_... \
node scripts/drain-storage-cleanup.js
```

The key is a service key. It belongs in the scheduler's secret store, never in
this repository and never on a device. The script refuses to start without it
rather than silently doing nothing, and exits non-zero if anything was left
behind, so a schedule that reports green is telling the truth.

**What is verified and what is not.** `scripts/verify-storage-drain.js` runs the
drain loop against the real database with the object store stubbed, and is part
of `scripts/check.sh`. It covers the case that matters: a row is marked purged
only when the storage API actually says it removed that object — a worker that
marked everything it claimed would turn a queue of real work into a queue of
lies on the first bad afternoon. What it does not cover is the HTTP transport,
because there is no object store in the checks. **Run it once by hand against
staging and confirm a queued object really disappears before trusting a
schedule with it.**

**Until it is running**, the honest statement is: a deleted photo becomes
unreadable immediately, and its bytes are still there. Do not describe deletion
as more complete than that in any user-facing copy beyond what
`COPY.deleteAccount` already says.

## 4. Apply the migrations in order

```sh
supabase link --project-ref <ref>
supabase db push
```

They are ordered by filename and are meant to be applied from an empty database
in that order. `supabase/scripts/db-test.sh` does exactly that against a
throwaway container on every run, so a replay failure shows up locally first.

## 5. Point the app at the project

Copy `mobile/.env.example` to `mobile/.env.local` and fill in:

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

Both are public client credentials — the anon key is designed to ship in a
client, and row level security is what protects the data. Neither belongs in
git; `.env.local` is ignored.

With them absent the app runs on the in-memory implementation instead, which is
how every test and the credential-free build work.

## 6. What still needs a real device

`.studio/device-readiness.md` lists it. The short version: nothing in this
repository has ever run on a phone or a simulator, so the keychain, the
permission dialogs, backgrounding, the screen reader, and whether the image
encoder really strips EXIF are all unverified. That is decision D-015, and it
should be closed before a pilot with real people rather than before the next
code milestone.
