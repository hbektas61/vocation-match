#!/usr/bin/env bash
# Vocation Match — reproducible database check.
#
#   supabase/scripts/db-test.sh              # fresh container, migrate, run every test
#   supabase/scripts/db-test.sh --keep       # reuse the container, apply only new migrations
#   supabase/scripts/db-test.sh --shell      # psql against the migrated test database
#
# Requires Docker. Uses the Postgres image Supabase runs locally, so extensions,
# roles (anon / authenticated / service_role) and the `auth` schema match a real
# Supabase project. No hosted project, API key, or secret is involved.
#
# The default run recreates the container, so results never depend on a previous
# run. `--keep` reuses it and applies only migrations that have not run yet,
# tracked in app.schema_migrations. Tests always roll back.
set -euo pipefail

IMAGE="${VOCATION_DB_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.147}"
CONTAINER="${VOCATION_DB_CONTAINER:-vocation_db_test}"
PORT="${VOCATION_DB_PORT:-54399}"
DB="${VOCATION_DB_NAME:-postgres}"
SUPA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

KEEP=0
SHELL_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --keep) KEEP=1 ;;
    --shell) KEEP=1; SHELL_ONLY=1 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

log() { printf '\n=== %s\n' "$*"; }

psql_db()   { docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d "$DB" -q "$@"; }

container_running() {
  [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || echo false)" = "true" ]
}

start_container() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker run -d --name "$CONTAINER" \
    -e POSTGRES_PASSWORD=postgres \
    -p "${PORT}:5432" \
    "$IMAGE" >/dev/null
  # `pg_isready` over the unix socket answers YES while the image is still
  # running its own init scripts, and DDL issued in that window trips the
  # pg_graphql event trigger. Wait for the TCP listener instead, which the
  # entrypoint only enables once init has finished.
  for _ in $(seq 1 90); do
    if docker exec "$CONTAINER" pg_isready -U postgres -h localhost >/dev/null 2>&1 &&
       docker exec "$CONTAINER" psql -U postgres -h localhost -qtAc 'select 1' >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "database did not become ready" >&2
  docker logs --tail 40 "$CONTAINER" >&2
  exit 1
}

if [ "$KEEP" = "1" ] && container_running; then
  log "reusing container ${CONTAINER}"
else
  log "starting ${CONTAINER} (${IMAGE}) on port ${PORT}"
  start_container
fi

log "applying migrations"
psql_db -c "create schema if not exists app;
            create table if not exists app.schema_migrations (
              version    text primary key,
              applied_at timestamptz not null default now());" >/dev/null
applied="$(docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -qtAc \
            'select version from app.schema_migrations')"
for f in "$SUPA_DIR"/migrations/*.sql; do
  version="$(basename "$f" .sql)"
  if printf '%s\n' "$applied" | grep -qxF "$version"; then
    printf '  .. %s (already applied)\n' "$version"
    continue
  fi
  {
    echo 'begin;'
    cat "$f"
    printf "\ninsert into app.schema_migrations (version) values (%s);\n" "'$version'"
    echo 'commit;'
  } | psql_db
  printf '  -> %s\n' "$version"
done

if [ "$SHELL_ONLY" = "1" ]; then
  psql_db -c "create extension if not exists pgtap with schema extensions;" >/dev/null
  psql_db < "$SUPA_DIR/tests/helpers.sql" >/dev/null
  exec docker exec -it "$CONTAINER" psql -U postgres -d "$DB"
fi

log "installing test tooling"
psql_db -c "create extension if not exists pgtap with schema extensions;"
psql_db < "$SUPA_DIR/tests/helpers.sql"

log "running tests"
failed=0
total=0
for f in "$SUPA_DIR"/tests/[0-9]*.sql; do
  name="$(basename "$f")"
  if out="$(docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d "$DB" -X -q -A -t -f - < "$f" 2>&1)"; then
    count="$(printf '%s\n' "$out" | grep -cE '^ok [0-9]+' || true)"
    if [ "$count" -lt 1 ]; then
      failed=1
      printf '  FAIL %-34s ran no assertions\n' "$name"
      continue
    fi
    total=$((total + count))
    printf '  PASS %-34s %s assertions\n' "$name" "$count"
  else
    failed=1
    printf '  FAIL %s\n' "$name"
    printf '%s\n' "$out" | sed 's/^/       /'
  fi
done

log "running concurrency checks"
if ! VOCATION_DB_CONTAINER="$CONTAINER" VOCATION_DB_NAME="$DB" bash "$SUPA_DIR/tests/concurrency.sh"; then
  failed=1
fi

if [ "$failed" != "0" ]; then
  log "DATABASE TESTS FAILED"
  exit 1
fi

log "all database tests passed (${total} SQL assertions plus the concurrency checks)"
