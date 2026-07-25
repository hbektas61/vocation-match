#!/usr/bin/env bash
# Everything that has to pass before a checkpoint reaches `main`.
#
#   scripts/check.sh            # database + mobile
#   scripts/check.sh --mobile   # skip the database (no Docker needed)
#   scripts/check.sh --db       # database only
#
# Each step prints its own output; the summary at the end is the honest answer.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DB=1
RUN_MOBILE=1

for arg in "$@"; do
  case "$arg" in
    --mobile) RUN_DB=0 ;;
    --db) RUN_MOBILE=0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

results=()
failed=0

run() { # run <label> <command...>
  local label="$1"; shift
  printf '\n\033[1m▶ %s\033[0m\n' "$label"
  if "$@"; then
    results+=("PASS  $label")
  else
    results+=("FAIL  $label")
    failed=1
  fi
}

# Needs nothing at all, so it runs whichever half was asked for: the settings it
# checks live in a file no migration and no test would otherwise read.
run "auth configuration" node "$ROOT/scripts/verify-auth-config.js"
run "dependency health"   node "$ROOT/scripts/check-dependencies.js"

if [ "$RUN_DB" = "1" ]; then
  run "database — migrations, RLS, pgTAP, concurrency" bash "$ROOT/supabase/scripts/db-test.sh"
  # Cheap, and it catches the one class of break that every other check misses:
  # the client and the SQL drifting apart. Needs the container the step above
  # leaves running.
  run "client ↔ database contract" node "$ROOT/scripts/verify-api-contract.js"
  # Its own two containers, so it does not disturb the one above.
  run "migration replay — fresh vs stepped" bash "$ROOT/scripts/verify-migration-replay.sh"
  run "storage cleanup drain" node "$ROOT/scripts/verify-storage-drain.js"
fi

if [ "$RUN_MOBILE" = "1" ]; then
  cd "$ROOT/mobile"
  run "mobile — typecheck"  npx tsc --noEmit
  run "mobile — lint"       npx eslint . --max-warnings 0
  run "mobile — tests"      npx jest
  run "mobile — web bundle" npx expo export --platform web
fi

printf '\n\033[1m── summary ──\033[0m\n'
for line in "${results[@]}"; do
  printf '  %s\n' "$line"
done

if [ "$failed" != "0" ]; then
  printf '\n\033[31mchecks failed\033[0m\n'
  exit 1
fi
printf '\n\033[32mall checks passed\033[0m\n'
