# Setting up the hosted Supabase project

Everything in `supabase/migrations/` travels with the repository. Everything on
this page does not: these are project settings that live in the Supabase
dashboard, and nothing in `scripts/check.sh` can see them. That is exactly why
they need writing down — a project missing any of them passes every test we have
and is still wrong.

This is owner work. No credential, key, or password belongs in this repository,
and none of the steps here should be automated with one.

## Current staging status — 2026-07-26

The hosted staging project is `vocation-match-staging`
(`ftdqkhkeluokpdghzubp`, Frankfurt). All migrations through
`20260726000400` are applied and match the local migration history.

One thing `supabase db push` does not do: seed data. `supabase/seed.sql` (the
five pilot hotels) has to be applied to the hosted project separately — the
first pilot run surfaced this as every hotel search answering "no results",
because the schema was there and the catalogue was empty. It is idempotent;
running it again is safe — though since the `hotel-search` edge function
landed, the seed only matters as a starting point: the catalogue now grows on
its own from OpenStreetMap as people search (D-029). The function deploys with

```bash
npx supabase functions deploy hotel-search
```

Without `psql` on the machine, the management API runs the seed:

```bash
curl -s -X POST \
  "https://api.supabase.com/v1/projects/ftdqkhkeluokpdghzubp/database/query" \
  -H "Authorization: Bearer $(cat ~/.supabase/access-token)" \
  -H "Content-Type: application/json" \
  -d "$(python3 -c 'import json,pathlib;print(json.dumps({"query":pathlib.Path("supabase/seed.sql").read_text()}))')"
```

- The app now uses phone OTP only. Email/password entry has been removed and
  the repository configuration disables email sign-up.
- **Staging SMS is deliberately gated.** The native CAPTCHA token flow is not
  integrated yet, so no SMS provider may be enabled. An owner must first add
  and device-test CAPTCHA, then choose/fund a provider, add its dashboard
  secrets, and apply the limits below. Until then, a real phone cannot receive
  a code.
- CAPTCHA is still off because it requires an owner-controlled CAPTCHA provider
  account and secret.
- The mobile app uses the project's public `sb_publishable_...` key from the
  ignored `mobile/.env.local`. No backend key is stored in the repository.
- Legacy JWT-based `anon` and `service_role` API keys are disabled. New work
  must use publishable keys in clients and independently rotatable secret keys
  in backend workers.
- The storage cleanup worker and real-device checks remain outstanding.

## 1. Enable phone OTP and disable email sign-up

Do these in order. Do not enable Phone or an SMS provider as a shortcut around
the first step.

1. Integrate an Expo-compatible hCaptcha or Cloudflare Turnstile challenge in
   the phone screen. Pass the resulting single-use token as
   `options.captchaToken` on the initial `signInWithOtp` request and every
   resend, then reset the challenge.
2. Enable the same CAPTCHA provider in **Authentication → Bot and Abuse
   Protection**, using its secret only in the dashboard.
3. Verify the challenge and token exchange on both iOS and Android against
   staging.
4. Only then, in **Authentication → Providers**:

- Turn **Phone** on and allow phone sign-ups.
- Choose a supported SMS provider and enter its credentials in the dashboard's
  secret fields. Do not copy them into `supabase/config.toml`, an Expo
  environment variable, a shell transcript, or this repository.
- Turn **Email sign-ups** off. The mobile app has no email or password screen.
- Keep refresh-token rotation on.

The app calls `signInWithOtp({ phone })` for both new and returning people and
then `verifyOtp({ phone, token, type: 'sms' })`. A successful SMS code is the
only point at which the app receives a session. There are deliberately no
separate sign-up/sign-in buttons and no account-existence error: the visible
flow must not disclose whether a number is already registered.

`supabase/config.toml` expresses the same intended state and
`scripts/verify-auth-config.js` fails if email sign-up is re-enabled, phone
sign-up/confirmation is disabled, SMS limits are loosened, a fixed test OTP is
committed, or a built-in provider/Send SMS Hook is enabled before CAPTCHA. The
hosted project keeps its own settings; the repository cannot prove that the
dashboard matches.

Existing email-only Auth users are not automatically converted into phone
users. Before a real user migration, link and verify phone identities through a
separately reviewed administrative process; do not ask people to create a
second profile and do not copy phone numbers into `public.profiles`.

## 1b. Bound SMS cost and abuse

In **Dashboard → Authentication → Rate Limits**:

- SMS sends: no higher than **30/hour** project-wide; the repository uses 10.
- Sign-ins/sign-ups: no higher than **60 per five minutes per IP**; the
  repository uses 30.
- Token verifications: no higher than **60 per five minutes per IP**; the
  repository uses 30.
- Per-number SMS frequency: at least **60 seconds** between sends.

Set the hosted SMS OTP expiry to **600 seconds (10 minutes)**. The CLI config
does not expose an SMS-expiry key, so this is a dashboard-only value and must be
checked manually. Supabase defaults to one hour, which is too long for a
six-digit proof.

SMS endpoints are public and every accepted request can spend money, harass a
third party, or exhaust the global send quota and lock everyone out. Rate
limits bound one source; CAPTCHA addresses distributed automation. Provider
spend caps and country allow-lists are additional safeguards, not replacements.

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

With them absent the app fails closed. The in-memory implementation is enabled
only by the explicit `npm run start:preview` command; a pilot/store build must
never set `EXPO_PUBLIC_USE_FAKE_API`.

## 6. What still needs a real device

`.studio/device-readiness.md` lists it. The short version: nothing in this
repository has ever run on a phone or a simulator, so the keychain, the
permission dialogs, backgrounding, the screen reader, and whether the image
encoder really strips EXIF are all unverified. That is decision D-015, and it
should be closed before a pilot with real people rather than before the next
code milestone.
