#!/usr/bin/env node
/**
 * Checks the auth settings that decide whether an account is real.
 *
 * These live in `supabase/config.toml`, not in a migration, which is exactly
 * why they need a check: nothing else in the suite reads them, so turning email
 * confirmation off would pass every test in the project and only show up as
 * strangers signing up as each other's addresses. That is also the reason the
 * hosted project needs its own pass — this file does not travel to it, and
 * `docs/hosted-setup.md` says so.
 *
 * Usage: node scripts/verify-auth-config.js
 * Needs nothing: no container, no key, no network.
 */
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const CONFIG = join(__dirname, '..', 'supabase', 'config.toml');
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

function require_(key, expected, why) {
  const actual = config.get(key);
  if (actual === undefined) {
    problems.push(`${key} is not set. It must be ${expected} — ${why}`);
  } else if (actual !== expected) {
    problems.push(`${key} is ${actual}, must be ${expected} — ${why}`);
  }
}

require_(
  'auth.email.enable_confirmations',
  'true',
  'without it anyone can sign up as any address, including someone else’s, and a ' +
    'sign-up returns a session the client would otherwise never see refused',
);

require_(
  'auth.enable_refresh_token_rotation',
  'true',
  'a stolen refresh token is otherwise valid forever',
);

// Eight is the floor, not a target; more is fine.
const minimum = Number(config.get('auth.minimum_password_length') ?? 0);
if (!Number.isInteger(minimum) || minimum < 8) {
  problems.push(
    `auth.minimum_password_length is ${config.get('auth.minimum_password_length')}, must be at least 8`,
  );
}

// Sending mail is the one thing this configuration lets an unauthenticated
// caller make the server do to a third party, so it has to be bounded.
for (const [key, ceiling] of [
  ['auth.rate_limit.email_sent', 30],
  ['auth.rate_limit.sign_in_sign_ups', 60],
]) {
  const value = Number(config.get(key) ?? NaN);
  if (!Number.isInteger(value) || value < 1 || value > ceiling) {
    problems.push(
      `${key} is ${config.get(key)}, must be an integer between 1 and ${ceiling} — ` +
        'the sign-up and resend endpoints are public and send mail to an address ' +
        'the caller types in',
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

if (/(?:anon_key|service_role_key|jwt_secret|password)\s*=\s*"[^"]{8,}"/.test(source)) {
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
  '  email confirmation is on, mail sending is bounded, tokens rotate, and `app` is not exposed over the API',
);
