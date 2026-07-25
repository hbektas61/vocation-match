# Vocation Match

A mobile app for meeting people connected to one hotel. You pick a hotel, and
you get into a room one of two ways:

- **Upcoming** — you say you are staying there. That is all: no reservation
  number, no document, no confirmation from anyone.
- **Here Now** — the app checks once, while you have it open, whether you are
  within 500 metres of that hotel.

Neither room is a precondition for the other, and you can only be in one hotel
at a time. Switching hotels closes the previous hotel's rooms immediately.

## What the app deliberately does not do

These are owner decisions, recorded in `.studio/decisions.md`, and the schema
is built so that breaking them requires changing the database, not just a
screen:

- It never asks for a reservation number, a booking document, a passport, an
  ID, a hotel confirmation, or a room number. No column for any of it exists,
  and a test fails the build if one appears.
- It never shows anyone your coordinates or how far away you are. The
  proximity check sends one reading to the server, which answers `yes` or `no`
  and throws the reading away. There is no endpoint that returns a distance,
  so there is nothing to turn into a tracker.
- It never tracks you in the background. Background location is blocked in
  `app.json`; there is exactly one code path that reads the device's position
  and it runs in the foreground, on demand.
- It keeps no location history. One row per person holds the latest answer and
  when it expires.
- It has no payments, no paywall, and no premium tier yet.
- Your photo is not on the open internet. It lives in a private bucket under a
  path beginning with your own user id; there is no public URL for it, no way
  to guess the path, and it is readable only by you, by someone matched with
  you, or by someone in a room with you right now. There is no field anywhere
  that takes a URL — an earlier version had one, and a card that loads an image
  from a host the profile owner controls tells them the IP address and the
  timing of everyone who merely saw them.
- EXIF is stripped before a photo is uploaded. A picture taken at the hotel
  carries the exact position it was taken from, which is the one thing this
  product promises never to expose.
- You can delete your account from inside the app, and the deletion is done by
  the server from your own token. It takes your profile, photo, hotel, stay,
  likes, matches and conversations with it. Reports filed about you, or by you,
  survive with your name removed: deleting an account is not a way to erase the
  record that a report was made.

## Layout

| Path | What it is |
| --- | --- |
| `mobile/` | Expo React Native app. `src/domain/` is the pure rule layer, `src/data/` is the typed backend boundary. |
| `supabase/` | Migrations, row level security, and the pgTAP suites that prove the rules. See `supabase/README.md`. |
| `scripts/check.sh` | Everything that has to pass before a change ships. |
| `docs/hosted-setup.md` | The settings that live in the Supabase dashboard and do **not** travel with the migrations. Nothing here can check them. |
| `.studio/` | Durable project state: decisions, backlog, architecture record, handoffs. |
| `outputs/` | Owner-facing planning notes. Not application source. |

## Running the checks

```bash
scripts/check.sh              # database + mobile
scripts/check.sh --mobile     # skip the database (no Docker needed)
scripts/check.sh --db         # database only
```

The database checks start a throwaway Postgres container matching the one
Supabase runs locally, apply the migrations in order, and run the SQL suites, a
multi-connection concurrency script, and a performance smoke check that seeds a
pilot's worth of people and fails if a query's plan stops being bounded by the
size of the room. A second pair of containers applies the same migrations one
at a time, with rows written in between, and compares the resulting schema,
grants and policies against the all-at-once run — a migration that only works
when applied to an empty database fails there rather than in production.

Two of the checks need neither Docker nor the network:

- `scripts/verify-auth-config.js` reads `supabase/config.toml` and fails if
  email confirmation is off, if the endpoints that send mail are unbounded, or
  if the private `app` schema is exposed over the API. Those settings are not
  in any migration, so nothing else in the suite would ever look at them.
- `scripts/check-dependencies.js` fails on any high or critical advisory that
  is not on an explicit list with a written reason.

No hosted project, key, or secret is involved in any of it.

## Running the app

```bash
cd mobile && npm install && npx expo start
```

With no `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` set, the
app runs against the in-memory implementation in `src/data/fakeApi.ts` — every
flow works, nothing leaves the device, and no credential is needed. Copy
`mobile/.env.example` to `mobile/.env.local` and fill it in to point at a real
Supabase project.

## Where the rules actually live

In SQL. The client is treated as untrusted: row level security decides what a
read returns, and every write that carries a rule goes through a function that
takes the acting user from the JWT rather than from an argument. The
TypeScript in `mobile/src/domain/` mirrors those rules only so the UI can give
immediate feedback — it is never the enforcement point.

Where a constraint can express a rule, it does, because a constraint cannot be
forgotten by a future code path. The primary key on `user_active_hotel.user_id`
*is* the one-hotel rule. The primary key on `swipes(actor_id, target_id)` is
what makes swiping safe to retry. `.studio/architecture.md` records the rest.
