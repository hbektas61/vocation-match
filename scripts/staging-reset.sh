#!/usr/bin/env bash
# Puts the staging test accounts back to the seed state. Safe to re-run.
#
#   scripts/staging-reset.sh
#
# It goes through the Supabase CLI, which already knows the linked project and
# keeps its password in the OS keyring — so no connection string and no
# password is ever written down, passed on a command line, or committed.
#
# The SQL it runs refuses outright unless the staging test numbers are present,
# so pointing this at the wrong project is an error rather than an accident. It
# never touches profiles, matches, messages, blocks, reports, or the provider
# metrics: those are a record of what really happened.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SQL="$ROOT/supabase/scripts/staging-reset.sql"

if [ ! -f "$SQL" ]; then
  echo "missing $SQL" >&2
  exit 1
fi

cd "$ROOT"
echo "▶ resetting the staging test accounts"
npx --yes supabase db query --linked --file "$SQL"
echo "▶ done — the rows above are the state the accounts are now in"
