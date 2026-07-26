#!/usr/bin/env node
/**
 * Checks the auth settings that decide whether an account is real.
 *
 * These live in `supabase/config.toml`, not in a migration, which is exactly
 * why they need a check: nothing else in the suite reads them. The app uses
 * phone OTP only, so enabling email sign-up or disabling SMS sign-up would
 * silently put the client and hosted project on different auth products.
 *
 * Usage: node scripts/verify-auth-config.js
 * Needs nothing: no container, no key, no network.
 */
const { readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');

const CONFIG = process.argv[2]
  ? resolve(process.argv[2])
  : join(__dirname, '..', 'supabase', 'config.toml');
const source = readFileSync(CONFIG, 'utf8');

/**
 * Minimal TOML reader for the shapes this file uses: `[section]` headers and
 * `key = value` lines. A real parser would be a dependency for four rules.
 */
function readConfig(text) {
  const values = new Map();
  const sections = new Set();
  const duplicates = [];
  let section = '';
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const header = line.match(/^\[([^\]]+)\]$/);
    if (header) {
      section = header[1];
      // A repeated table header, and a repeated key inside one, are both
      // errors in real TOML. Resolving them "last one wins" would accept a
      // file the Supabase CLI refuses to load — so they are reported instead.
      if (sections.has(section)) {
        duplicates.push(`[${section}] appears more than once`);
      }
      sections.add(section);
      continue;
    }
    const pair = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
    if (pair) {
      const key = `${section}.${pair[1]}`;
      if (values.has(key)) {
        duplicates.push(`${key} is set more than once`);
      }
      values.set(key, pair[2].trim());
    }
  }
  return { values, duplicates };
}

const { values: config, duplicates } = readConfig(source);
const problems = [...duplicates];

if (/\[auth\.sms\.test_otp\]/.test(source)) {
  problems.push(
    'auth.sms.test_otp must not be committed; config push could turn a local fixed code into a hosted auth bypass',
  );
}

if (
  /auth\.sms\.(?:twilio|twilio_verify|messagebird|textlocal|vonage)\.enabled/.test(
    [...config.keys()].join('\n'),
  )
) {
  for (const provider of ['twilio', 'twilio_verify', 'messagebird', 'textlocal', 'vonage']) {
    if (config.get(`auth.sms.${provider}.enabled`) === 'true') {
      problems.push(
        `auth.sms.${provider}.enabled is true; no SMS provider may be enabled until the native CAPTCHA token flow and hosted CAPTCHA are verified`,
      );
    }
  }
}

if (config.get('auth.hook.send_sms.enabled') === 'true') {
  problems.push(
    'auth.hook.send_sms.enabled is true; no Send SMS Hook may be enabled until the native CAPTCHA token flow and hosted CAPTCHA are verified',
  );
}

function require_(key, expected, why) {
  const actual = config.get(key);
  if (actual === undefined) {
    problems.push(`${key} is not set. It must be ${expected} — ${why}`);
  } else if (actual !== expected) {
    problems.push(`${key} is ${actual}, must be ${expected} — ${why}`);
  }
}

require_(
  'auth.email.enable_signup',
  'false',
  'the app has no email or password flow',
);

require_(
  'auth.sms.enable_signup',
  'true',
  'phone OTP is the only account entry path',
);

require_(
  'auth.sms.enable_confirmations',
  'true',
  'a phone must prove access to its SMS code before it receives a session',
);

require_(
  'auth.sms.max_frequency',
  '"60s"',
  'the UI and provider both allow at most one SMS per number per minute',
);

require_(
  'auth.enable_refresh_token_rotation',
  'true',
  'a stolen refresh token is otherwise valid forever',
);

// Sending SMS is the one thing this configuration lets an unauthenticated
// caller make the server do to a third party, and each one costs money.
for (const [key, ceiling] of [
  ['auth.rate_limit.sms_sent', 30],
  ['auth.rate_limit.sign_in_sign_ups', 60],
  ['auth.rate_limit.token_verifications', 60],
]) {
  const value = Number(config.get(key) ?? NaN);
  if (!Number.isInteger(value) || value < 1 || value > ceiling) {
    problems.push(
      `${key} is ${config.get(key)}, must be an integer between 1 and ${ceiling} — ` +
        'phone OTP endpoints are public and can spend SMS quota',
    );
  }
}

// PostgREST must not expose the private helper schema: `app` holds functions
// that take a user id as an argument and trust it.
const schemas = config.get('api.schemas') ?? '';
if (!schemas.includes('"public"')) {
  problems.push('api.schemas must expose "public"');
}
if (/\bapp\b/.test(schemas)) {
  problems.push('api.schemas exposes the private `app` schema over the API');
}

if (
  /(?:anon_key|service_role_key|jwt_secret|password|account_sid|message_service_sid|content_sid|auth_token|api_key|access_key|api_secret)\s*=\s*"(?!env\()[^"]{8,}"/.test(
    source,
  )
) {
  problems.push('config.toml appears to contain a secret; secrets belong in the environment');
}

if (problems.length) {
  console.error('\nAuth configuration is wrong:\n');
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  console.error('');
  process.exit(1);
}

console.log(
  '  email sign-up is off, phone OTP is on, providers stay gated for CAPTCHA, SMS limits are bounded, tokens rotate, and `app` is not exposed over the API',
);
