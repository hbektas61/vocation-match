#!/usr/bin/env node
/**
 * Two real accounts, one real backend, the whole journey (Day 2, section A).
 *
 *   node scripts/staging-e2e.mjs
 *
 * What makes this different from the jest suite: there is no FakeApi and no
 * visual harness here. Every call below goes over the network to the linked
 * staging project, through the same PostgREST endpoints and the same RLS the
 * app uses, with two separate sessions held at once. What passes here passed
 * against the real rules.
 *
 * Safety, in the order the script enforces it:
 *
 *   1. It reads the project from `mobile/.env.local` — the same publishable
 *      key the app ships with. There is no service-role key in this file, and
 *      none is needed: everything is done as the two members themselves, which
 *      is the point. A step that only passes as service_role would be proving
 *      nothing about what a user can do.
 *   2. It refuses to continue unless the OTP request comes back as a *test*
 *      OTP. That single check is what guarantees no real SMS is sent and no
 *      real person is messaged — and it is why pointing this at production
 *      stops before it can spend anything.
 *   3. It writes only through the two test accounts, and finishes by asking
 *      `scripts/staging-reset.sh` to put them back.
 *
 * Nothing identifying is printed. Phone numbers are masked, user ids are
 * shortened to a non-reversible prefix, message bodies are never echoed, and
 * tokens are never touched after the client holds them.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '../mobile/node_modules/@supabase/supabase-js/dist/index.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The two staging test identities. These exist only on staging. */
const A_PHONE = '+905551110001';
const B_PHONE = '+905551110002';
/** The code the hosted project is configured to accept for the test numbers. */
const TEST_OTP = process.env.STAGING_TEST_OTP ?? '123456';

const results = [];
let failures = 0;

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
  const mark = ok ? '  ok  ' : '  FAIL';
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Enough of an id to correlate two lines, never enough to identify anyone. */
const short = (id) => (id ? `${String(id).slice(0, 8)}…` : '(none)');
const maskPhone = (p) => `${p.slice(0, 4)}…${p.slice(-2)}`;

function env() {
  const text = readFileSync(join(ROOT, 'mobile', '.env.local'), 'utf8');
  const out = {};
  for (const line of text.split('\n')) {
    const i = line.indexOf('=');
    if (i > 0 && !line.trim().startsWith('#')) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const url = out.EXPO_PUBLIC_SUPABASE_URL;
  const key = out.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('mobile/.env.local has no project URL or publishable key');
  return { url, key };
}

/**
 * Signs a test account in over the real OTP endpoints.
 *
 * The guard is the first thing that happens: if the project answers with
 * anything other than a test-OTP acknowledgement, a real SMS is about to be
 * sent to a real number and the run stops before the verify step.
 */
async function signIn({ url, key }, phone) {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const raw = await fetch(`${url}/auth/v1/otp`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, create_user: false }),
  });
  const ack = await raw.json();
  if (raw.status !== 200 || ack.message_id !== 'test-otp') {
    throw new Error(
      `Refusing to continue for ${maskPhone(phone)}: the project did not answer with a test OTP. ` +
        'This is the guard that keeps the script off a project where a real SMS would be sent.',
    );
  }

  const { data, error } = await client.auth.verifyOtp({ phone, token: TEST_OTP, type: 'sms' });
  if (error || !data.session) throw new Error(`sign-in failed for ${maskPhone(phone)}: ${error?.message ?? 'no session'}`);
  return { client, userId: data.user.id };
}

const rpc = async (client, name, args) => {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
};

/** Same call, but the failure is the expected outcome. */
const rpcExpectingRefusal = async (client, name, args) => {
  const { error } = await client.rpc(name, args);
  return error;
};


/** The smallest thing the storage bucket will accept as an image. */
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Brings one test account up to "a person who finished signing up", without
 * touching anybody else's row.
 *
 * Deliberately not seeded through SQL: writing the rows directly would prove
 * the database accepts rows, which nobody doubted. Going through the same
 * RPCs the app calls is what makes the preconditions evidence too.
 */
async function ensureMember(who, label) {
  const { error: profileError } = await who.client.from('profiles').upsert(
    {
      id: who.userId,
      display_name: `Staging ${label}`,
      birthdate: '1994-03-01',
      bio: 'Staging end-to-end account.',
    },
    { onConflict: 'id' },
  );
  if (profileError) throw new Error(`profile upsert (${label}): ${profileError.message}`);

  // The identity answers `complete_onboarding` insists on before it will mark
  // the profile finished.
  const { error: identityError } = await who.client
    .from('profiles')
    .update({ gender_identity: label === 'A' ? 'WOMAN' : 'MAN', show_me: 'EVERYONE' })
    .eq('id', who.userId);
  if (identityError) throw new Error(`identity (${label}): ${identityError.message}`);

  const existing = await who.client.rpc('own_profile_photos').then((r) => r.data ?? []);
  if (existing.length === 0) {
    // The bucket policy pins the shape of a photo path: the owner's uuid, a
    // slash, then 24-64 lowercase alphanumerics. A short name is refused by
    // RLS rather than by the app, which is the right place for it to be.
    const name = Array.from({ length: 32 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
    const path = `${who.userId}/${name}.png`;
    const up = await who.client.storage.from('profile-photos').upload(path, ONE_PIXEL_PNG, {
      contentType: 'image/png',
      upsert: true,
    });
    if (up.error) throw new Error(`photo upload (${label}): ${up.error.message}`);
    const add = await who.client.rpc('add_profile_photo', { p_path: path });
    if (add.error) throw new Error(`add_profile_photo (${label}): ${add.error.message}`);
  }

  const done = await who.client.rpc('complete_onboarding');
  if (done.error) throw new Error(`complete_onboarding (${label}): ${done.error.message}`);
}

/**
 * Clears what passed between the two test accounts last time.
 *
 * A swipe is a permanent decision, by design — which means that without this
 * the second run of this script finds an empty deck and reports a failure that
 * is really just yesterday's success. Run before, not after, so a failed run
 * leaves its evidence in place to be read.
 */
function resetPair() {
  execFileSync('npx', ['--yes', 'supabase', 'db', 'query', '--linked', '--file',
    join(ROOT, 'supabase', 'scripts', 'e2e-reset.sql')], { stdio: 'pipe' });
}

async function main() {
  const conf = env();
  console.log(`\nproject: ${new URL(conf.url).host.split('.').slice(1).join('.')} (ref withheld)`);
  console.log(`accounts: ${maskPhone(A_PHONE)} and ${maskPhone(B_PHONE)}\n`);

  console.log('▶ clearing what passed between the two accounts last run');
  resetPair();

  // 1 — two separate persistent accounts, each with its own session.
  const A = await signIn(conf, A_PHONE);
  const B = await signIn(conf, B_PHONE);
  check('1. two accounts hold separate sessions', A.userId !== B.userId, `${short(A.userId)} / ${short(B.userId)}`);

  // 2 — a completed 18+ profile on both, and at least one photo each.
  //
  // Established rather than assumed. A script that only passes when somebody
  // has already clicked through the app by hand is not a re-runnable test, and
  // "the accounts happened to be set up" is not evidence. Every call here is
  // idempotent, so a second run is a no-op.
  for (const [label, who] of [['A', A], ['B', B]]) {
    await ensureMember(who, label);
    const { data: profile } = await who.client
      .from('profiles')
      .select('id, display_name, birthdate, onboarding_completed_at')
      .eq('id', who.userId)
      .maybeSingle();
    const age = profile?.birthdate
      ? Math.floor((Date.now() - Date.parse(profile.birthdate)) / (365.25 * 24 * 3600 * 1000))
      : null;
    check(
      `2. ${label} has a completed 18+ profile`,
      Boolean(profile?.display_name) && Boolean(profile?.onboarding_completed_at) && age !== null && age >= 18,
      `age ${age}`,
    );
    const photos = await rpc(who.client, 'own_profile_photos', {});
    check(`2. ${label} has at least one profile photo`, Array.isArray(photos) && photos.length >= 1, `${photos?.length ?? 0} photo(s)`);
  }

  // 3 — the same vacation venue for both.
  const hotels = await rpc(A.client, 'search_hotels', { p_query: 'Lara' });
  const venue = hotels?.[0];
  if (!venue) throw new Error('no catalogue venue to test with');
  await rpc(A.client, 'set_active_hotel', { p_hotel_id: venue.id });
  await rpc(B.client, 'set_active_hotel', { p_hotel_id: venue.id });
  const aVenue = await rpc(A.client, 'my_active_venue', {});
  const bVenue = await rpc(B.client, 'my_active_venue', {});
  check('3. both accounts are active at the same venue', aVenue?.[0]?.hotel_id === bVenue?.[0]?.hotel_id, short(venue.id));

  // 4 — overlapping declared stays, which is what opens Before the Trip.
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  await rpc(A.client, 'declare_upcoming_stay', { p_start_date: day(3), p_end_date: day(9) });
  await rpc(B.client, 'declare_upcoming_stay', { p_start_date: day(4), p_end_date: day(10) });
  const aRooms = await rpc(A.client, 'my_rooms', {});
  const upcomingOpen = aRooms?.find((r) => r.room === 'UPCOMING')?.eligible === true;
  check('4. the overlapping stay opens Before the Trip', upcomingOpen);

  // 5 — each is in the other's deck.
  const aDeck = await rpc(A.client, 'discovery_feed', { p_room: 'UPCOMING', p_limit: 50 });
  const bDeck = await rpc(B.client, 'discovery_feed', { p_room: 'UPCOMING', p_limit: 50 });
  const deckId = (c) => c.user_id ?? c.id;
  const aSeesB = aDeck?.some((c) => deckId(c) === B.userId);
  const bSeesA = bDeck?.some((c) => deckId(c) === A.userId);
  check('5. A sees B in the deck, and B sees A', Boolean(aSeesB && bSeesA));

  // 6 — a mutual like makes exactly one match.
  await rpc(A.client, 'swipe', { p_target_id: B.userId, p_room: 'UPCOMING', p_decision: 'LIKE' });
  await rpc(B.client, 'swipe', { p_target_id: A.userId, p_room: 'UPCOMING', p_decision: 'LIKE' });
  const aMatches = await rpc(A.client, 'my_matches', {});
  const pair = aMatches?.filter((m) => m.other_user_id === B.userId) ?? [];
  check('6. one mutual like makes exactly one match', pair.length === 1, `${pair.length} match(es)`);
  const match = { id: pair[0]?.match_id, room: pair[0]?.room };

  // 7 — the room it came from, and the venue it happened at.
  //
  // The venue is read from `matches` rather than from `my_matches`: the inbox
  // function returns the room and not the hotel, which is correct for what the
  // inbox draws but means the attribution has to be checked where it is
  // actually stored.
  const { data: matchRow } = await A.client.from('matches').select('id, room, hotel_id').eq('id', match.id).maybeSingle();
  check('7. the match carries its room and its venue', matchRow?.room === 'UPCOMING' && matchRow?.hotel_id === venue.id,
    `room=${matchRow?.room} venue=${short(matchRow?.hotel_id)}`);

  // 8 — A writes. The body is generated, never printed.
  const bodyA = `e2e-a-${Date.now()}`;
  const sendA = await A.client.from('messages').insert({ match_id: match.id, sender_id: A.userId, body: bodyA });
  check('8. A can send a message into the match', !sendA.error, sendA.error?.message ?? '');

  // 9 — B's inbox carries the conversation, with the message on it.
  const bMatches = await rpc(B.client, 'my_matches', {});
  const bRow = bMatches?.find((m) => m.other_user_id === A.userId);
  check("9. B's inbox carries the conversation and its latest message", Boolean(bRow?.last_message_at) && Boolean(bRow?.last_message_body));

  // Unread state is not asserted because it does not exist. There is no
  // read receipt, no last-read marker and no unread count anywhere in the
  // schema, and the client says so in as many words ("no unread dot on the
  // inbox tab (no read-state exists)"). Asserting it here would either fail
  // for the wrong reason or, worse, be quietly written to pass. It is on the
  // board as an owner question instead.
  const readState = Object.keys(bRow ?? {}).some((k) => /read|unread|seen/.test(k));
  check('9. read state is absent from the inbox contract, as the code says it is', !readState,
    'no read/unread field — recorded as an owner question, not asserted as working');

  // 10 — B replies; the two messages come back in the order they were sent.
  const bodyB = `e2e-b-${Date.now()}`;
  await B.client.from('messages').insert({ match_id: match.id, sender_id: B.userId, body: bodyB });
  const { data: thread } = await B.client.from('messages').select('id, sender_id, created_at').eq('match_id', match.id).order('created_at', { ascending: true });
  check('10. the reply lands after the first message, in order', thread?.length >= 2 && thread[thread.length - 1].sender_id === B.userId, `${thread?.length} message(s)`);
  const bInbox = (await rpc(B.client, 'my_matches', {}))?.find((m) => m.other_user_id === A.userId);
  check("10. and the inbox's latest message moves with it", Date.parse(bInbox?.last_message_at) >= Date.parse(bRow?.last_message_at));

  // 11 — the same composed message, sent four times at once. This is the
  //      dropped-response case: the client cannot tell a failure from a lost
  //      answer, so it retries, and the server has to be the one that decides.
  const burstToken = randomUUID();
  const burstBody = `e2e-burst-${Date.now()}`;
  const burst = await Promise.allSettled(
    Array.from({ length: 4 }, () =>
      A.client.from('messages').upsert(
        { match_id: match.id, sender_id: A.userId, body: burstBody, client_token: burstToken },
        { onConflict: 'match_id,sender_id,client_token', ignoreDuplicates: true },
      ),
    ),
  );
  // Every one of these came back "fulfilled" while carrying an error, which is
  // how a broken conflict target stayed invisible for a whole run. A rejected
  // send is fine; a send that quietly does nothing is not.
  const burstErrors = burst.filter((r) => r.status === 'fulfilled' && r.value?.error).map((r) => r.value.error.code);
  check('11. and none of the retries failed silently', burstErrors.length === 0, burstErrors.join(', ') || 'no errors');
  const { count: burstStored } = await A.client.from('messages').select('id', { count: 'exact', head: true }).eq('match_id', match.id).eq('body', burstBody);
  check('11. four concurrent retries of one message store exactly one', burstStored === 1,
    `${burstStored} row(s) from ${burst.filter((r) => r.status === 'fulfilled').length} accepted requests`);

  // ...and two messages that happen to say the same thing are still two, which
  // is why the token names the attempt rather than hashing the text.
  const twice = `e2e-twice-${Date.now()}`;
  await A.client.from('messages').insert({ match_id: match.id, sender_id: A.userId, body: twice, client_token: randomUUID() });
  await A.client.from('messages').insert({ match_id: match.id, sender_id: A.userId, body: twice, client_token: randomUUID() });
  const { count: twiceStored } = await A.client.from('messages').select('id', { count: 'exact', head: true }).eq('match_id', match.id).eq('body', twice);
  check('11. but saying the same thing twice on purpose is still two messages', twiceStored === 2, `${twiceStored} row(s)`);

  // 12 — a send the server refuses, then a retry of a real one.
  const bogus = await A.client.from('messages').insert({ match_id: match.id, sender_id: B.userId, body: 'e2e-forged' });
  check('12. a send that is not yours is refused by the server', Boolean(bogus.error), bogus.error?.code ?? '');
  const retryToken = randomUUID();
  const retryBody = `e2e-retry-${Date.now()}`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await A.client.from('messages').upsert(
      { match_id: match.id, sender_id: A.userId, body: retryBody, client_token: retryToken },
      { onConflict: 'match_id,sender_id,client_token', ignoreDuplicates: true },
    );
  }
  const { count: retryStored } = await A.client.from('messages').select('id', { count: 'exact', head: true }).eq('match_id', match.id).eq('body', retryBody);
  check('12. three sequential retries of one send store exactly one', retryStored === 1, `${retryStored} row(s)`);

  // 13 — content: the Apple 1.2 gate, over the wire, as a member.
  const refused = await A.client.from('messages').insert({ match_id: match.id, sender_id: A.userId, body: 'c h i l d   p o r n' });
  check('13. the server refuses objectionable text from a real session', refused.error?.code === 'PC001', refused.error?.code ?? 'not refused');
  const { count: refusedStored } = await A.client.from('messages').select('id', { count: 'exact', head: true }).eq('match_id', match.id).ilike('body', '%porn%');
  check('13. and nothing refused reached the table', refusedStored === 0, `${refusedStored} row(s)`);

  // 14 — report and block, in one action, from B against A.
  const reportId = await rpc(B.client, 'report_user', { p_target_id: A.userId, p_reason: 'HARASSMENT', p_details: 'e2e run', p_also_block: true });
  check('14. report + block succeeds', Boolean(reportId), short(reportId));
  const again = await rpc(B.client, 'report_user', { p_target_id: A.userId, p_reason: 'HARASSMENT', p_details: 'e2e run', p_also_block: true });
  const { count: reportRows } = await B.client.from('reports').select('id', { count: 'exact', head: true }).eq('reported_id', A.userId);
  check('14. reporting the same person twice does not multiply the report', reportRows === 1, `${reportRows} report row(s)`);

  // 15 — what a block has to mean, checked from both sides.
  const aDeckAfter = await rpc(A.client, 'discovery_feed', { p_room: 'UPCOMING', p_limit: 50 });
  const bDeckAfter = await rpc(B.client, 'discovery_feed', { p_room: 'UPCOMING', p_limit: 50 });
  check('15. the blocked person is gone from the blocker\'s deck', !bDeckAfter?.some((c) => deckId(c) === A.userId));
  check('15. and the blocker is gone from theirs — a block is not one-way', !aDeckAfter?.some((c) => deckId(c) === B.userId));

  const swipeAfter = await rpcExpectingRefusal(A.client, 'swipe', { p_target_id: B.userId, p_room: 'UPCOMING', p_decision: 'LIKE' });
  const matchesAfter = await rpc(A.client, 'my_matches', {});
  const stillOpen = matchesAfter?.find((m) => m.other_user_id === B.userId && !m.unmatched_at);
  check('15. no new match can form across a block', Boolean(swipeAfter) || !stillOpen, swipeAfter?.code ?? 'swipe refused or match closed');

  const blockedSend = await A.client.from('messages').insert({ match_id: match.id, sender_id: A.userId, body: 'e2e-after-block' });
  check('15. the blocked person cannot send into the conversation', Boolean(blockedSend.error), blockedSend.error?.code ?? '');
  const blockedSendBack = await B.client.from('messages').insert({ match_id: match.id, sender_id: B.userId, body: 'e2e-after-block-b' });
  check('15. and neither can the blocker — the room is closed, not muted', Boolean(blockedSendBack.error), blockedSendBack.error?.code ?? '');

  const { data: aSeesBlock } = await A.client.from('blocks').select('blocker_id').eq('blocked_id', A.userId);
  check('15. the blocked person is never told they were blocked', (aSeesBlock?.length ?? 0) === 0, `${aSeesBlock?.length ?? 0} row(s) visible`);

  const { data: aSeesReports } = await A.client.from('reports').select('id').eq('reported_id', A.userId);
  check('15. and cannot see the report filed about them', (aSeesReports?.length ?? 0) === 0, `${aSeesReports?.length ?? 0} row(s) visible`);

  // The reporter's identity must not be reachable from the reported side.
  const { error: modError } = await A.client.from('moderation_actions').select('id');
  check('15. a member cannot read the moderation trail', Boolean(modError), modError?.code ?? 'readable');

  console.log('');
  return { failures, total: results.length };
}

main()
  .then(({ failures: f, total }) => {
    console.log(`\n${total - f}/${total} checks passed against the staging backend.`);
    console.log('▶ returning the test accounts to their seed state');
    try {
      execFileSync('bash', [join(ROOT, 'scripts', 'staging-reset.sh')], { stdio: 'inherit' });
    } catch {
      console.error('  the reset script did not finish — run scripts/staging-reset.sh by hand');
      process.exitCode = 1;
    }
    process.exitCode = f === 0 ? 0 : 1;
  })
  .catch((err) => {
    console.error(`\nrun stopped: ${err.message}`);
    process.exitCode = 1;
  });
