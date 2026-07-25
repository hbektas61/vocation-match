#!/usr/bin/env bash
# Concurrency checks that a single-session pgTAP file cannot express.
#
# Run by supabase/scripts/db-test.sh after the SQL suites. Every section opens
# several real connections at once and then asserts the end state, because
# "one active hotel" and "one match per pair" are claims about what happens
# when two devices race, not about what happens in a tidy transaction.
set -euo pipefail

CONTAINER="${VOCATION_DB_CONTAINER:-vocation_db_test}"
DB="${VOCATION_DB_NAME:-postgres}"
FANOUT="${VOCATION_CONCURRENCY_FANOUT:-8}"

q() { docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d "$DB" -X -q -A -t "$@"; }

failures=0
check() { # check <label> <actual> <expected>
  if [ "$2" = "$3" ]; then
    printf '    ok   %s\n' "$1"
  else
    printf '    FAIL %s (got %s, want %s)\n' "$1" "$2" "$3"
    failures=$((failures + 1))
  fi
}

USER_ID='00000000-0000-0000-0000-00000000cc01'

cleanup() {
  q -c "delete from auth.users where id = '${USER_ID}';
        delete from public.hotels where provider = 'concurrency';" >/dev/null
}

cleanup
q -c "select tests.create_member('concurrency@example.test', '${USER_ID}');" >/dev/null
HOTEL_A="$(q -c "select tests.create_hotel('conc-a', 41.0369, 28.9850);")"
HOTEL_B="$(q -c "select tests.create_hotel('conc-b', 41.0256, 28.9744);")"
q -c "update public.hotels set provider = 'concurrency' where name in ('conc-a','conc-b');" >/dev/null

printf '  racing %s activations between two hotels\n' "$FANOUT"
succeeded=0
for i in $(seq 1 "$FANOUT"); do
  if [ $((i % 2)) -eq 0 ]; then target="$HOTEL_A"; else target="$HOTEL_B"; fi
  (
    q -c "begin;
          select tests.authenticate_as('${USER_ID}');
          select public.set_active_hotel('${target}');
          commit;" >/dev/null 2>&1 && echo ok >> "/tmp/vocation-conc.$$"
  ) &
done
wait
succeeded="$(wc -l < "/tmp/vocation-conc.$$" 2>/dev/null | tr -d ' ' || echo 0)"
rm -f "/tmp/vocation-conc.$$"

check "at least one activation committed" "$([ "${succeeded:-0}" -ge 1 ] && echo yes || echo no)" "yes"
check "the user has exactly one active hotel" \
  "$(q -c "select count(*) from public.user_active_hotel where user_id = '${USER_ID}';")" "1"
check "exactly one activation event is open" \
  "$(q -c "select count(*) from public.hotel_activation_events where user_id = '${USER_ID}' and deactivated_at is null;")" "1"
check "the open event matches the active hotel" \
  "$(q -c "select count(*) from public.user_active_hotel uah
             join public.hotel_activation_events e
               on e.user_id = uah.user_id and e.hotel_id = uah.hotel_id and e.deactivated_at is null
            where uah.user_id = '${USER_ID}';")" "1"
check "no presence answer survived the switches" \
  "$(q -c "select count(*) from public.presence_checks where user_id = '${USER_ID}';")" "0"

cleanup

# ---------------------------------------------------------------- matching
# Two people liking each other at the same instant is the race that decides
# whether matching is correct: without the pair lock this either produces two
# match rows or none.
MATCH_A='00000000-0000-0000-0000-00000000cc02'
MATCH_B='00000000-0000-0000-0000-00000000cc03'

cleanup_match() {
  q -c "delete from auth.users where id in ('${MATCH_A}', '${MATCH_B}');
        delete from public.hotels where provider = 'concurrency';" >/dev/null
}

cleanup_match
q -c "select tests.create_member('conc-a@example.test', '${MATCH_A}');
      select tests.create_member('conc-b@example.test', '${MATCH_B}');" >/dev/null
MATCH_HOTEL="$(q -c "select tests.create_hotel('conc-match', 41.0369, 28.9850);")"
q -c "update public.hotels set provider = 'concurrency' where name = 'conc-match';" >/dev/null

for member in "$MATCH_A" "$MATCH_B"; do
  q -c "begin;
        select tests.authenticate_as('${member}');
        select public.set_active_hotel('${MATCH_HOTEL}');
        select public.declare_upcoming_stay(current_date + 1, current_date + 4);
        commit;" >/dev/null
done

printf '  racing %s simultaneous likes in both directions\n' "$FANOUT"
for i in $(seq 1 "$FANOUT"); do
  if [ $((i % 2)) -eq 0 ]; then actor="$MATCH_A"; target="$MATCH_B"; else actor="$MATCH_B"; target="$MATCH_A"; fi
  (
    q -c "begin;
          select tests.authenticate_as('${actor}');
          select public.swipe('${target}', 'UPCOMING', 'LIKE');
          commit;" >/dev/null 2>&1
  ) &
done
wait

check "exactly one match exists for the pair" \
  "$(q -c "select count(*) from public.matches
            where user_a = least('${MATCH_A}'::uuid, '${MATCH_B}'::uuid)
              and user_b = greatest('${MATCH_A}'::uuid, '${MATCH_B}'::uuid);")" "1"
check "the pair matched rather than deadlocking into nothing" \
  "$(q -c "select count(*) from public.matches
            where unmatched_at is null
              and user_a = least('${MATCH_A}'::uuid, '${MATCH_B}'::uuid)
              and user_b = greatest('${MATCH_A}'::uuid, '${MATCH_B}'::uuid);")" "1"
check "each direction stored exactly one swipe" \
  "$(q -c "select count(*) from public.swipes
            where (actor_id = '${MATCH_A}' and target_id = '${MATCH_B}')
               or (actor_id = '${MATCH_B}' and target_id = '${MATCH_A}');")" "2"

cleanup_match

# ------------------------------------------------- first activation, raced
# The row lock in set_active_hotel locks nothing when the user has no row yet,
# so before the advisory lock two concurrent *first* activations both reached
# the activation-event insert and one died on the partial unique index with a
# raw duplicate-key error. Every racer should now succeed.
FIRST_USER='00000000-0000-0000-0000-00000000cc04'

cleanup_first() {
  q -c "delete from auth.users where id = '${FIRST_USER}';
        delete from public.hotels where provider = 'concurrency';" >/dev/null
}

cleanup_first
q -c "select tests.create_member('conc-first@example.test', '${FIRST_USER}');" >/dev/null
FIRST_HOTEL="$(q -c "select tests.create_hotel('conc-first', 41.0369, 28.9850);")"
q -c "update public.hotels set provider = 'concurrency' where name = 'conc-first';" >/dev/null

printf '  racing %s simultaneous first activations for one user
' "$FANOUT"
first_ok="/tmp/vocation-first.$$"
: > "$first_ok"
for _ in $(seq 1 "$FANOUT"); do
  (
    q -c "begin;
          select tests.authenticate_as('${FIRST_USER}');
          select public.set_active_hotel('${FIRST_HOTEL}');
          commit;" >/dev/null 2>&1 && echo ok >> "$first_ok"
  ) &
done
wait
first_count="$(wc -l < "$first_ok" | tr -d ' ')"
rm -f "$first_ok"

check "every racer committed rather than dying on a duplicate key" "$first_count" "$FANOUT"
check "the user still has exactly one active hotel"   "$(q -c "select count(*) from public.user_active_hotel where user_id = '${FIRST_USER}';")" "1"
check "and exactly one activation event was opened"   "$(q -c "select count(*) from public.hotel_activation_events where user_id = '${FIRST_USER}';")" "1"

cleanup_first

if [ "$failures" != "0" ]; then
  printf '  %s concurrency check(s) failed\n' "$failures"
  exit 1
fi
printf '  all concurrency checks passed\n'
