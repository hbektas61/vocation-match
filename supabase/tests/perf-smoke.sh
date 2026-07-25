#!/usr/bin/env bash
# H-410 — the queries a pilot actually runs, at a density a pilot actually has.
#
# A smoke check, not a benchmark. It exists to catch one class of mistake: a
# query whose cost grows with something other than the number of people in the
# room. A single-hotel pilot cannot tell "small table" from "well indexed", so
# the seed deliberately puts people at *other* hotels too — a query bounded by
# the right thing does not notice them at all.
#
# It fails on plan shape, never on wall-clock time. Timings from Docker on a
# laptop are not evidence about a hosted project, and a check that asserts on
# them fails for the weather. They are printed because they are still worth
# reading.
#
#   VOCATION_DB_CONTAINER=vocation_db_test supabase/tests/perf-smoke.sh
#
# Everything it writes is rolled back, so it can run against the same container
# the test suite leaves behind.
set -uo pipefail

CONTAINER="${VOCATION_DB_CONTAINER:-vocation_db_test}"
DB="${VOCATION_DB_NAME:-postgres}"
ROOM="${VOCATION_PERF_ROOM:-200}"
ELSEWHERE="${VOCATION_PERF_ELSEWHERE:-5000}"

report="$(docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d "$DB" -qtA <<SQL 2>&1
begin;

-- The room: everyone here is eligible, so the deck has real work to do.
select tests.create_hotel('perf-pilot', 41.0369, 28.9850);

do \$do\$
declare
  v_hotel uuid := (select id from public.hotels where name = 'perf-pilot');
  v_other uuid;
  v_id    uuid;
begin
  for i in 1..${ROOM} loop
    v_id := tests.create_member('perf-' || i || '@example.test');
    insert into public.user_active_hotel (user_id, hotel_id) values (v_id, v_hotel);
    insert into public.upcoming_stays (user_id, hotel_id, start_date, end_date)
    values (v_id, v_hotel, current_date + 1, current_date + 4);
  end loop;

  -- Everyone else, at hotels this room knows nothing about.
  for h in 1..25 loop
    v_other := tests.create_hotel('perf-away-' || h, 40.0 + h * 0.01, 29.0);
    for i in 1..(${ELSEWHERE} / 25) loop
      v_id := tests.create_member('perf-away-' || h || '-' || i || '@example.test');
      insert into public.user_active_hotel (user_id, hotel_id) values (v_id, v_other);
    end loop;
  end loop;
end
\$do\$;

analyze public.user_active_hotel;
analyze public.upcoming_stays;
analyze public.profiles;

select tests.authenticate_as(
  (select uah.user_id from public.user_active_hotel uah
     join public.hotels h on h.id = uah.hotel_id
    where h.name = 'perf-pilot' limit 1));

-- Warm the plan cache and load PostGIS before measuring; the first call in a
-- backend pays for extension loading and JIT, which is a one-time cost in
-- production too and not what this is looking at.
select count(*) from public.discovery_feed('UPCOMING', 20);
select count(*) from public.my_rooms();

\echo ===discovery_feed
explain (analyze, buffers, costs off) select * from public.discovery_feed('UPCOMING', 20);
\echo ===my_rooms
explain (analyze, buffers, costs off) select * from public.my_rooms();
\echo ===my_matches
explain (analyze, buffers, costs off) select * from public.my_matches();
\echo ===search_hotels
explain (analyze, buffers, costs off) select * from public.search_hotels('perf');

\echo ===discovery_plan
select tests.clear_auth();
explain (costs off)
  select p.id
    from public.user_active_hotel other
    join public.profiles p on p.id = other.user_id
   where other.hotel_id = (select id from public.hotels where name = 'perf-pilot');

rollback;
SQL
)"

if printf '%s\n' "$report" | grep -qiE '^(ERROR|psql:)'; then
  printf '  the performance seed did not run:\n'
  printf '%s\n' "$report" | sed 's/^/    /' | head -20
  exit 1
fi

printf '  %s people in one room, %s at 25 other hotels\n' "$ROOM" "$ELSEWHERE"
printf '%s\n' "$report" \
  | grep -E '^===|Execution Time|Planning Time' \
  | sed -e 's/^===/  /' -e 's/^ *Execution Time/      time:/' -e 's/^ *Planning Time/      plan:/'

# The regression this exists to catch. `user_active_hotel` holds one row per
# user forever — a hotel switch updates it in place and nothing deletes it — so
# its size is lifetime signups across every hotel, not the occupancy of this
# one. Discovery filtering it sequentially means the deck gets slower for
# reasons that have nothing to do with the room anyone is standing in.
plan="$(printf '%s\n' "$report" | sed -n '/===discovery_plan/,$p')"
if printf '%s\n' "$plan" | grep -q 'Seq Scan on user_active_hotel'; then
  printf '  FAIL discovery scans user_active_hotel sequentially — the hotel_id index is missing or unused\n'
  exit 1
fi

printf '  ok  discovery reaches user_active_hotel by index, so it is bounded by the room rather than by lifetime signups\n'
