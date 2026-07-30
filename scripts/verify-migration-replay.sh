#!/usr/bin/env bash
# H-407 — a fresh database reaches the same schema as one migrated in steps.
#
# Every migration in this project has only ever been applied one way: all of
# them, in order, into an empty container, which is what `db-test.sh` does on
# every run. A real project is not like that. It is migrated in steps, weeks
# apart, with data in it — and a migration that quietly depends on running in
# the same transaction as the one before it, or on a table being empty, works
# perfectly in the first case and breaks in the second.
#
# This applies the same files two ways and compares the resulting schemas:
#
#   A  every migration in one batch, into an empty database
#   B  the same migrations one statement-batch at a time, each committed on its
#      own, with rows written in between so nothing is applied to an empty table
#
# A difference between the two dumps is the bug this exists to find.
#
#   scripts/verify-migration-replay.sh
#
# Requires Docker. Uses its own container and port so it never touches the one
# the test suite leaves running.
set -euo pipefail

IMAGE="${VOCATION_DB_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.147}"
FRESH_CONTAINER="${VOCATION_REPLAY_FRESH:-vocation_db_replay_fresh}"
STEPPED_CONTAINER="${VOCATION_REPLAY_STEPPED:-vocation_db_replay_stepped}"
FRESH_PORT="${VOCATION_REPLAY_FRESH_PORT:-54397}"
STEPPED_PORT="${VOCATION_REPLAY_STEPPED_PORT:-54398}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SUPA_DIR="$ROOT/supabase"
WORK="$(mktemp -d)"

cleanup() {
  rm -rf "$WORK"
  docker rm -f "$FRESH_CONTAINER" "$STEPPED_CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

psql_as() { # psql_as <container> <user> [args...]
  local container="$1" user="$2"; shift 2
  PGOPTIONS='--client-min-messages=warning' \
    docker exec -i -e PGOPTIONS='--client-min-messages=warning' "$container" \
    psql -v ON_ERROR_STOP=1 -U "$user" -d postgres -q "$@"
}

# Two containers rather than two databases in one: `auth`, `storage` and
# `extensions` are created by the image's own init, which runs per container
# and only for the default database. A second `create database` would start
# without any of them and prove nothing.
start_container() { # start_container <name> <port>
  local container="$1" port="$2" ready=0
  docker rm -f "$container" >/dev/null 2>&1 || true
  docker run -d --name "$container" \
    -e POSTGRES_PASSWORD=postgres \
    -p "${port}:5432" \
    "$IMAGE" >/dev/null
  for _ in $(seq 1 90); do
    if docker exec "$container" pg_isready -U postgres -h localhost >/dev/null 2>&1 &&
       docker exec "$container" psql -U postgres -h localhost -qtAc 'select 1' >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 1
  done
  if [ "$ready" != "1" ]; then
    echo "  replay database ${container} did not become ready" >&2
    docker logs --tail 40 "$container" >&2
    exit 1
  fi
  psql_as "$container" supabase_admin < "$SUPA_DIR/scripts/storage-bootstrap.sql" >/dev/null
  psql_as "$container" postgres -c "create schema if not exists app;" >/dev/null
}

# Applies one migration file inside its own transaction.
apply_one() { # apply_one <container> <file>
  local container="$1" file="$2"
  {
    echo 'begin;'
    cat "$file"
    echo 'commit;'
  } | psql_as "$container" postgres >/dev/null
}

start_container "$FRESH_CONTAINER" "$FRESH_PORT"
start_container "$STEPPED_CONTAINER" "$STEPPED_PORT"

# ------------------------------------------------------------------- A: fresh
# One batch, empty database — the arrangement every existing check uses.
{
  echo 'begin;'
  for f in "$SUPA_DIR"/migrations/*.sql; do cat "$f"; echo; done
  echo 'commit;'
} | psql_as "$FRESH_CONTAINER" postgres >/dev/null

# ----------------------------------------------------------------- B: stepped
# One at a time, each committed on its own. After the migration that creates
# profiles, a member and a hotel are written, so every later migration is
# applied to a database with rows in it rather than to an empty one — which is
# the case a backfill or a new constraint can fail on and nothing here would
# otherwise notice.
seeded=0
for f in "$SUPA_DIR"/migrations/*.sql; do
  apply_one "$STEPPED_CONTAINER" "$f"
  if [ "$seeded" = "0" ] && [ "$(basename "$f")" \> "20260725000900" ]; then
    psql_as "$STEPPED_CONTAINER" postgres < "$SUPA_DIR/tests/helpers.sql" >/dev/null
    psql_as "$STEPPED_CONTAINER" postgres -c "
      select tests.create_member('replay-a@example.test', '00000000-0000-0000-0000-0000000000e1');
      select tests.create_member('replay-b@example.test', '00000000-0000-0000-0000-0000000000e2');
      -- The write boundary directly, and positionally, rather than through
      -- tests.create_hotel: the helper tracks today's signature, while this
      -- runs at a point in history where the function had fewer arguments.
      select public.upsert_hotel_from_provider(
        'replay', 'replay', 'replay', 'Istanbul', 'Turkiye', 41.0369, 28.9850);
    " >/dev/null
    seeded=1
  fi
done

# The seeding above created a `tests` schema in one container and not the
# other, so it is dropped before the comparison. What is under test is the
# migrations, not the helpers.
psql_as "$STEPPED_CONTAINER" postgres -c "drop schema if exists tests cascade;" >/dev/null

# ---------------------------------------------------------------- compare
dump() { # dump <container> <out>
  docker exec -i "$1" pg_dump -U postgres -d postgres \
    --schema-only --no-owner --no-privileges --no-comments \
    --schema=public --schema=app \
  | grep -v '^--' | grep -v '^$' \
  | grep -v -E '^.(un)?restrict ' > "$2"
  # `\restrict` / `\unrestrict` carry a per-invocation nonce, so they differ
  # between two dumps of identical schemas. Dropping them is not hiding a
  # difference; keeping them would hide every real one behind noise.
}

grants() { # grants <container> <out>
  docker exec -i "$1" psql -U postgres -d postgres -qtA -c "
    select table_name || ' ' || grantee || ' ' || privilege_type || ' ' ||
           coalesce(column_name, '*')
      from (
        select table_name, grantee, privilege_type, null::text as column_name
          from information_schema.role_table_grants
         where table_schema = 'public' and grantee in ('anon','authenticated')
        union all
        select table_name, grantee, privilege_type, column_name
          from information_schema.column_privileges
         where table_schema = 'public' and grantee in ('anon','authenticated')
      ) g
     order by 1;" | sort > "$2"
}

policies() { # policies <container> <out>
  docker exec -i "$1" psql -U postgres -d postgres -qtA -c "
    select schemaname || '.' || tablename || ' ' || policyname || ' ' ||
           cmd || ' ' || roles::text || ' ' || coalesce(qual, '-') || ' ' ||
           coalesce(with_check, '-')
      from pg_policies
     where schemaname in ('public', 'storage')
     order by 1;" | sort > "$2"
}

dump "$FRESH_CONTAINER" "$WORK/fresh.sql"
dump "$STEPPED_CONTAINER" "$WORK/stepped.sql"
grants "$FRESH_CONTAINER" "$WORK/fresh.grants"
grants "$STEPPED_CONTAINER" "$WORK/stepped.grants"
policies "$FRESH_CONTAINER" "$WORK/fresh.policies"
policies "$STEPPED_CONTAINER" "$WORK/stepped.policies"

failed=0
compare() { # compare <label> <a> <b>
  if diff -u "$2" "$3" > "$WORK/diff.txt"; then
    printf '  ok   %s\n' "$1"
  else
    failed=1
    printf '  FAIL %s\n' "$1"
    sed 's/^/       /' "$WORK/diff.txt" | head -60
  fi
}

compare "the schema is the same either way"   "$WORK/fresh.sql"      "$WORK/stepped.sql"
compare "and so are the client-facing grants" "$WORK/fresh.grants"   "$WORK/stepped.grants"
compare "and so are the row level policies"   "$WORK/fresh.policies" "$WORK/stepped.policies"

if [ "$failed" != "0" ]; then
  echo "  a database migrated in steps is not the same as a fresh one" >&2
  exit 1
fi

printf '  a stepped migration reaches the same schema, grants and policies as a fresh one\n'
