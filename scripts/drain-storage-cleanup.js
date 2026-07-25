#!/usr/bin/env node
/**
 * The worker the storage cleanup queue has been waiting for.
 *
 * `public.storage_cleanup_queue` records objects whose metadata row is gone —
 * a replaced photo, a deleted account — but whose bytes are still in the object
 * store. The database cannot remove those; only the storage API can. So it does
 * its half and hands the rest here:
 *
 *     claim_storage_cleanup(n)  ->  delete each object  ->  mark_storage_cleanup_purged(ids)
 *
 * Until this ran, "your photo is deleted" meant "unreadable, and still there".
 *
 * ## Running it
 *
 *     SUPABASE_URL=https://<ref>.supabase.co \
 *     SUPABASE_SECRET_KEY=sb_secret_... \
 *     node scripts/drain-storage-cleanup.js
 *
 * The key is a service key and belongs in the scheduler's secret store, never
 * in this repository and never on a device. It is read from the environment and
 * never logged; the script refuses to start without it rather than silently
 * doing nothing.
 *
 * Exit code is 0 when the queue is empty or fully drained, 1 when anything was
 * left behind — so a scheduler notices rather than reporting green forever.
 *
 * ## What is verified here and what is not
 *
 * `scripts/verify-storage-drain.js` runs the loop below against the real
 * database with the object deletion stubbed, so the claiming, the marking, and
 * — the part that matters — the refusal to mark anything that did not actually
 * delete are all covered. The HTTP transport is not: there is no hosted project
 * in the checks. That is stated in `docs/hosted-setup.md` rather than implied.
 */

const BUCKETS = new Set(['profile-photos']);
const DEFAULT_BATCH = 100;

/**
 * One pass over the queue.
 *
 * `rpc` and `deleteObjects` are injected so the loop can be exercised against a
 * real database without a real object store. `deleteObjects` returns the names
 * it actually removed; anything missing from that list stays unpurged and comes
 * back on the next run, which is the whole point — marking a row purged is a
 * claim that the bytes are gone, and it must never be made on faith.
 */
async function drain({ rpc, deleteObjects, batchSize = DEFAULT_BATCH, log = () => {} }) {
  const claimed = await rpc('claim_storage_cleanup', { p_limit: batchSize });
  if (!claimed.length) {
    log('  nothing waiting');
    return { claimed: 0, purged: 0, left: 0 };
  }

  const byBucket = new Map();
  for (const row of claimed) {
    if (!BUCKETS.has(row.bucket_id)) {
      // A bucket this worker was not written for. Refusing is the safe
      // direction: the alternative is deleting from somewhere nobody meant.
      log(`  skipping ${row.bucket_id} — not a bucket this worker knows`);
      continue;
    }
    if (!byBucket.has(row.bucket_id)) byBucket.set(row.bucket_id, []);
    byBucket.get(row.bucket_id).push(row);
  }

  const purgedIds = [];
  for (const [bucket, rows] of byBucket) {
    const names = rows.map((row) => row.object_name);
    let removed;
    try {
      removed = new Set(await deleteObjects(bucket, names));
    } catch (error) {
      // A whole batch failing is a bad afternoon, not a reason to lose the
      // queue. Nothing is marked; every row comes back next time.
      log(`  ${bucket}: delete failed (${error.message}) — nothing marked`);
      continue;
    }
    for (const row of rows) {
      if (removed.has(row.object_name)) {
        purgedIds.push(row.id);
      }
    }
    log(`  ${bucket}: ${removed.size} of ${names.length} removed`);
  }

  if (purgedIds.length) {
    await rpc('mark_storage_cleanup_purged', { p_ids: purgedIds });
  }

  const left = claimed.length - purgedIds.length;
  return { claimed: claimed.length, purged: purgedIds.length, left };
}

/* ------------------------------------------------------------- the real one */

function httpRpc(url, key) {
  return async (name, args) => {
    const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });
    if (!response.ok) {
      throw new Error(`${name} answered ${response.status}`);
    }
    const body = await response.json();
    return Array.isArray(body) ? body : [];
  };
}

function httpDelete(url, key) {
  return async (bucket, names) => {
    const response = await fetch(`${url}/storage/v1/object/${bucket}`, {
      method: 'DELETE',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prefixes: names }),
    });
    if (!response.ok) {
      throw new Error(`storage answered ${response.status}`);
    }
    // The API reports what it removed. An object that was already gone is not
    // in the list, and does not need to be: the next run finds it, tries again,
    // and it stays on the queue until something says it is really gone.
    const removed = await response.json();
    return (Array.isArray(removed) ? removed : []).map((entry) => entry.name);
  };
}

async function main() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SECRET_KEY?.trim();

  if (!url || !key) {
    console.error(
      'SUPABASE_URL and SUPABASE_SECRET_KEY are required.\n' +
        'The key is a service key: keep it in the scheduler\'s secret store, not here.',
    );
    process.exit(2);
  }

  const result = await drain({
    rpc: httpRpc(url, key),
    deleteObjects: httpDelete(url, key),
    log: (line) => console.log(line),
  });

  console.log(
    `  claimed ${result.claimed}, purged ${result.purged}, left ${result.left}`,
  );
  process.exit(result.left === 0 ? 0 : 1);
}

module.exports = { drain, BUCKETS };

if (require.main === module) {
  main().catch((error) => {
    // Never the key, never a URL with one in it.
    console.error(`  drain failed: ${error.message}`);
    process.exit(1);
  });
}
