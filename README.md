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

## Layout

| Path | What it is |
| --- | --- |
| `mobile/` | Expo React Native app. `src/domain/` is the pure rule layer, `src/data/` is the typed backend boundary. |
| `supabase/` | Migrations, row level security, and the pgTAP suites that prove the rules. See `supabase/README.md`. |
| `scripts/check.sh` | Everything that has to pass before a change ships. |
| `.studio/` | Durable project state: decisions, backlog, architecture record, handoffs. |
| `outputs/` | Owner-facing planning notes. Not application source. |

## Running the checks

```bash
scripts/check.sh              # database + mobile
scripts/check.sh --mobile     # skip the database (no Docker needed)
scripts/check.sh --db         # database only
```

The database checks start a throwaway Postgres container matching the one
Supabase runs locally, apply the migrations in order, and run the SQL suites
plus a multi-connection concurrency script. No hosted project, key, or secret
is involved.

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
