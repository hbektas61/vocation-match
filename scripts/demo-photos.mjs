#!/usr/bin/env node
/**
 * Uploads photo sets for the investor-demo pool (D-064, 2026-08-04).
 *
 * Identity-safe on purpose: the portraits are AI-generated faces of people
 * who do not exist (xsgames randomusers set), and the second and third shots
 * are travel scenery (picsum). No real person's photograph is ever attached
 * to a demo profile.
 *
 * Auth: the service key, taken from SUPABASE_SERVICE_ROLE_KEY. Fetch it with
 *   npx supabase projects api-keys --project-ref <ref> -o json
 * It is used for this run and written nowhere.
 *
 * Idempotent: paths are stable per user, uploads use upsert, and the binding
 * RPC replaces the whole set — a rerun refreshes rather than duplicates.
 */
import { createClient } from '../mobile/node_modules/@supabase/supabase-js/dist/index.mjs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function envFromDotenv(name) {
  const raw = readFileSync(join(root, 'mobile', '.env.local'), 'utf8');
  const line = raw.split('\n').find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : null;
}

const url = process.env.SUPABASE_URL ?? envFromDotenv('EXPO_PUBLIC_SUPABASE_URL');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Need SUPABASE_URL (or mobile/.env.local) and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

/** The pool alternates W/M in creation order (20260804000300), so even
 * indices are women, odd are men — the portraits follow the same beat. */
const PORTRAIT = (index) =>
  index % 2 === 0
    ? `https://xsgames.co/randomusers/assets/avatars/female/${(10 + index) % 70}.jpg`
    : `https://xsgames.co/randomusers/assets/avatars/male/${(20 + index) % 70}.jpg`;

/** Stable scenery ids — beaches, water, terraces. */
const SCENERY = [1011, 1015, 1016, 1018, 1021, 1035, 1036, 1039, 1041, 1043, 1044, 1045];

async function fetchImage(target) {
  const response = await fetch(target, { redirect: 'follow' });
  if (!response.ok) throw new Error(`${target} -> ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

const { data: pool, error: poolError } = await admin.rpc('demo_pool_ids');
if (poolError) {
  console.error('demo_pool_ids failed:', poolError.message);
  process.exit(1);
}
if (!pool || pool.length === 0) {
  console.error('Demo pool is empty — open a deck once so it seeds, then rerun.');
  process.exit(1);
}

let done = 0;
for (const [index, userId] of pool.entries()) {
  const sources = [
    PORTRAIT(index),
    `https://picsum.photos/id/${SCENERY[index % SCENERY.length]}/900/1200`,
    `https://picsum.photos/id/${SCENERY[(index + 5) % SCENERY.length]}/900/1200`,
  ];
  const paths = [];
  for (const [slot, source] of sources.entries()) {
    const bytes = await fetchImage(source);
    // The path token must be 24-64 chars of [a-z0-9] (profiles_photo_path_shape).
    const path = `${userId}/demophoto00000000000000000${slot + 1}.jpg`;
    const { error } = await admin.storage
      .from('profile-photos')
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
    if (error) throw new Error(`upload ${path}: ${error.message}`);
    paths.push(path);
  }
  const { error: bindError } = await admin.rpc('demo_set_photos', {
    p_user: userId,
    p_paths: paths,
  });
  if (bindError) throw new Error(`bind ${userId}: ${bindError.message}`);
  done += 1;
  console.log(`ok ${userId} (${paths.length} photos)`);
}
console.log(`done: ${done}/${pool.length} demo profiles have photo sets`);
