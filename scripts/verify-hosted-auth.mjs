#!/usr/bin/env node
/**
 * Checks the *hosted* project against what the repository says it should be.
 *
 *   node scripts/verify-hosted-auth.mjs
 *
 * `scripts/verify-auth-config.js` reads `supabase/config.toml` and can prove
 * what the repository intends. It cannot prove what the dashboard actually
 * does — and `docs/hosted-setup.md` says so in as many words: "the repository
 * cannot prove that the dashboard matches". This closes that sentence.
 *
 * It needs no secret. Both facts it reads are public by design: the settings
 * document any client fetches at start-up, and the observable behaviour of the
 * OTP endpoint. That is the point — if this script can see it without
 * credentials, so can anybody else.
 *
 * Exit code 1 means the live project is weaker than the committed intent.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * A number the project is configured to answer with a fixed test code. Used
 * only to observe whether the endpoint demands a CAPTCHA *before* it decides
 * anything else — no SMS is sent for it, which is why it is safe to probe.
 */
const PROBE_PHONE = '+905551110001';

function env() {
  const text = readFileSync(join(ROOT, 'mobile', '.env.local'), 'utf8');
  const out = {};
  for (const line of text.split('\n')) {
    const i = line.indexOf('=');
    if (i > 0 && !line.trim().startsWith('#')) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { url: out.EXPO_PUBLIC_SUPABASE_URL, key: out.EXPO_PUBLIC_SUPABASE_ANON_KEY };
}

const problems = [];
const notes = [];

async function main() {
  const { url, key } = env();
  if (!url || !key) {
    console.log('  no hosted project configured in mobile/.env.local — nothing to check');
    return;
  }

  const settings = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } }).then((r) => r.json());

  // 1. Email sign-up. The app has no email screen, so an open email path is a
  //    way to obtain a session without a phone — and a phone-verified identity
  //    is the whole basis of the Apple 1.2 argument that this is not anonymous
  //    chat. `config.toml` sets this false; the dashboard is what decides.
  if (settings?.external?.email === true) {
    problems.push(
      'email sign-in is enabled on the hosted project. supabase/config.toml sets ' +
        'auth.email.enable_signup = false and the app has no email flow, so this is a ' +
        'way to hold a session without ever proving a phone number.',
    );
  }

  // 2. Anonymous sign-in would be the same hole with fewer steps.
  if (settings?.external?.anonymous_users === true) {
    problems.push('anonymous sign-in is enabled on the hosted project');
  }

  // 3. An SMS provider spends real money on a public endpoint. The repository
  //    refuses to enable one until CAPTCHA is verified; this reports what is
  //    actually configured.
  const provider = settings?.sms_provider ?? null;
  if (provider) notes.push(`sms provider configured: ${provider}`);

  // 4. CAPTCHA, observed rather than asked about. A project with CAPTCHA
  //    enforced refuses an OTP request that carries no token, before it looks
  //    at anything else. This request is for a test number, so a project that
  //    *doesn't* enforce it still sends no SMS.
  const otp = await fetch(`${url}/auth/v1/otp`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: PROBE_PHONE, create_user: false }),
  });
  const body = await otp.json().catch(() => ({}));
  const captchaEnforced = otp.status >= 400 && /captcha/i.test(JSON.stringify(body));

  if (!captchaEnforced && provider) {
    problems.push(
      `the OTP endpoint accepted a request with no CAPTCHA token (HTTP ${otp.status}) while ` +
        `"${provider}" is configured to send SMS. That is a public, unauthenticated, billable ` +
        'endpoint: anyone can spend the SMS quota, and exhausting it locks every real user out ' +
        'of signing in. supabase/config.toml refuses to enable a provider for exactly this reason.',
    );
  }
  if (!captchaEnforced && !provider) {
    notes.push('CAPTCHA is not enforced, but no SMS provider is configured, so nothing billable is exposed');
  }
  if (captchaEnforced) notes.push('CAPTCHA is enforced server-side on the OTP endpoint');

  // 5. A test OTP is right for staging and catastrophic in production: it is a
  //    fixed code that opens an account. Reported, never assumed either way.
  if (body?.message_id === 'test-otp') {
    notes.push(
      'this project answers the probe number with a test OTP — correct for staging, and it must ' +
        'not be true of production',
    );
  }
}

main()
  .then(() => {
    for (const note of notes) console.log(`  note: ${note}`);
    if (problems.length) {
      console.error('\nThe hosted project is weaker than the committed configuration:\n');
      for (const p of problems) console.error(`  - ${p}\n`);
      console.error('  These are dashboard settings. No migration or deploy can fix them.\n');
      process.exitCode = 1;
      return;
    }
    console.log('  the hosted project matches the committed intent');
  })
  .catch((err) => {
    console.error(`  could not reach the hosted project: ${err.message}`);
    process.exitCode = 1;
  });
