#!/usr/bin/env node
/**
 * Exercises the storage-cleanup worker against the real database.
 *
 * The object store is stubbed, because there isn't one in the checks. What is
 * real: the queue, `claim_storage_cleanup`, `mark_storage_cleanup_purged`, and
 * the loop in `drain-storage-cleanup.js` that decides what to mark.
 *
 * The case worth writing a check for is the third one. Marking a row purged is
 * a claim that the bytes are gone, and a worker that marks everything it
 * claimed — rather than everything it actually deleted — turns a queue of real
 * work into a queue of lies, quietly, on the first bad afternoon.
 *
 * Usage: node scripts/verify-storage-drain.js
 * Requires the container from supabase/scripts/db-test.sh.
 */
const { execFileSync } = require('node:child_process');
const { drain } = require('./drain-storage-cleanup');

const CONTAINER = process.env.VOCATION_DB_CONTAINER || 'vocation_db_test';
const DB = process.env.VOCATION_DB_NAME || 'postgres';
const OWNER = '00000000-0000-0000-0000-0000000000f1';

function sql(text) {
  return execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', DB, '-qtA', '-c', text],
    { encoding: 'utf8' },
  ).trim();
}

/**
 * The same two RPCs the worker calls over HTTP in production, reached through
 * psql instead. What is under test is the loop's decisions, not the transport —
 * and the transport is the part `docs/hosted-setup.md` says is unverified.
 */
async function rpc(name, args) {
  if (name === 'claim_storage_cleanup') {
    const rows = sql(`
      select coalesce(json_agg(row_to_json(c)), '[]')
        from public.claim_storage_cleanup(${Number(args.p_limit)}) c
    `);
    return JSON.parse(rows);
  }
  if (name === 'mark_storage_cleanup_purged') {
    const ids = args.p_ids.map((id) => `'${id}'::uuid`).join(',');
    sql(`select public.mark_storage_cleanup_purged(array[${ids}])`);
    return [];
  }
  throw new Error(`unexpected rpc ${name}`);
}

const problems = [];
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`    ok   ${label}`);
  } else {
    problems.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`    FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  // A clean slate that belongs to this check and nothing else.
  sql(`delete from public.storage_cleanup_queue where object_name like '${OWNER}/%'`);

  const names = ['aaa', 'bbb', 'ccc'].map((n) => `${OWNER}/${n.repeat(8)}.jpg`);
  sql(`
    insert into public.storage_cleanup_queue (bucket_id, object_name, reason)
    values ${names.map((n) => `('profile-photos', '${n}', 'REMOVED')`).join(',')}
  `);

  const pending = () =>
    Number(sql(`
      select count(*) from public.storage_cleanup_queue
       where purged_at is null and object_name like '${OWNER}/%'
    `));

  check('the queue has work to do', pending() === 3, `saw ${pending()}`);

  // 1. The object store refuses everything. Nothing may be marked.
  const refusing = await drain({
    rpc,
    deleteObjects: async () => {
      throw new Error('storage answered 503');
    },
  });
  check('a failed batch marks nothing', refusing.purged === 0);
  check('and leaves every row for the next run', pending() === 3, `saw ${pending()}`);

  // 2. The object store removes some of them. Only those may be marked — this
  //    is the one that turns a queue of work into a queue of lies if it is
  //    wrong.
  const partial = await drain({
    rpc,
    deleteObjects: async (_bucket, requested) => requested.slice(0, 2),
  });
  check('a partial delete marks exactly what came back', partial.purged === 2);
  check('and reports what it could not finish', partial.left === 1);
  check('leaving the rest queued', pending() === 1, `saw ${pending()}`);

  // 3. The rest succeeds.
  const rest = await drain({ rpc, deleteObjects: async (_b, requested) => requested });
  check('the remainder drains', rest.purged === 1 && rest.left === 0);
  check('and the queue is empty', pending() === 0, `saw ${pending()}`);

  // 4. An empty queue is not an error, and does no work.
  const empty = await drain({ rpc, deleteObjects: async () => [] });
  check('an empty queue is a no-op', empty.claimed === 0 && empty.left === 0);

  // 5. A bucket this worker was not written for is left alone rather than
  //    guessed at.
  sql(`
    insert into public.storage_cleanup_queue (bucket_id, object_name, reason)
    values ('some-other-bucket', '${OWNER}/dddddddd.jpg', 'REMOVED')
  `);
  let asked = false;
  const foreign = await drain({
    rpc,
    deleteObjects: async () => {
      asked = true;
      return [];
    },
  });
  check('an unknown bucket is never deleted from', asked === false);
  check('and its row stays queued', foreign.left === 1);

  sql(`delete from public.storage_cleanup_queue where object_name like '${OWNER}/%'`);

  if (problems.length) {
    console.error('\nstorage drain is wrong:\n');
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error('');
    process.exit(1);
  }
  console.log('  the drain marks only what was really deleted');
}

main().catch((error) => {
  console.error(`  storage drain check failed: ${error.message}`);
  process.exit(1);
});
