# Vocation Match — database

The product rules live here, not in the app. A client is treated as untrusted:
row level security decides what a row-level `select` may return, and every
write that carries a rule goes through a `SECURITY DEFINER` function that
derives the acting user from the JWT rather than from an argument.

## Run the checks

```bash
supabase/scripts/db-test.sh            # fresh container, migrate, run every test
supabase/scripts/db-test.sh --keep     # reuse the container, apply only new migrations
supabase/scripts/db-test.sh --shell    # psql against the migrated database
```

Only Docker is required. The script drives the same Postgres image Supabase
runs locally (`auth` schema, `anon` / `authenticated` / `service_role` roles,
PostGIS, pgTAP), so the checks describe behaviour a real project will show —
and no hosted project, API key, or secret is involved.

## Layout

| Path | What it is |
| --- | --- |
| `migrations/` | Applied in filename order; tracked in `app.schema_migrations`. |
| `tests/*.sql` | pgTAP suites, each wrapped in a transaction that rolls back. |
| `tests/helpers.sql` | Test-only helpers (`tests.create_member`, `tests.authenticate_as`). Never applied to a real project. |
| `tests/concurrency.sh` | Multi-connection races that a single session cannot express. |
| `config.toml` | Settings for `supabase start` once the CLI is available. |

## Things worth knowing before changing a migration

- **New tables are world-open by default.** This database template grants every
  privilege on new `public` tables to `anon` and `authenticated`. A migration
  that forgets `revoke` plus `enable row level security` ships an open table.
  `tests/000_security_baseline.sql` fails the build when that happens.
- **Coordinates never leave the server.** `hotels.location` is not granted to
  any client role, and the baseline test rejects any public function whose
  result mentions a location, a coordinate, or a distance. The proximity check
  takes a reading as an argument and stores only the boolean answer.
- **`app` is private.** PostgREST exposes `public` only, so helpers in `app`
  are unreachable over the API even though policies call them.
- **`SECURITY DEFINER` functions must pin `search_path`.** The baseline test
  enforces this; without it a caller could shadow a table name.
- **Never store proof.** There is no column anywhere for a reservation, a
  document, an ID, or a room number, and the baseline test keeps it that way.
