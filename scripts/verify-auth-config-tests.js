#!/usr/bin/env node
/**
 * Negative controls for the auth-config gate. Each mutation represents a
 * dangerous setting that has regressed before or a provider secret spelling
 * the security review found the scanner did not cover.
 */
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

const root = join(__dirname, '..');
const verifier = join(__dirname, 'verify-auth-config.js');
const source = readFileSync(join(root, 'supabase', 'config.toml'), 'utf8');
const temp = mkdtempSync(join(tmpdir(), 'vocation-auth-config-'));

const cases = [
  {
    name: 'email sign-up',
    source: source.replace('enable_signup = false', 'enable_signup = true'),
    expected: 'auth.email.enable_signup',
  },
  {
    name: 'fixed hosted OTP',
    source: `${source}\n[auth.sms.test_otp]\n905551112233 = "123456"\n`,
    expected: 'auth.sms.test_otp must not be committed',
  },
  {
    name: 'MessageBird literal secret',
    source: `${source}\n[auth.sms.messagebird]\nenabled = false\naccess_key = "literal-messagebird-secret"\n`,
    expected: 'appears to contain a secret',
  },
  {
    name: 'Vonage literal secret',
    source: `${source}\n[auth.sms.vonage]\nenabled = false\napi_secret = "literal-vonage-secret"\n`,
    expected: 'appears to contain a secret',
  },
  {
    name: 'provider before CAPTCHA',
    source: `${source}\n[auth.sms.twilio]\nenabled = true\n`,
    expected: 'no SMS provider may be enabled',
  },
  {
    name: 'Send SMS Hook before CAPTCHA',
    source: `${source}\n[auth.hook.send_sms]\nenabled = true\nuri = "env(SEND_SMS_HOOK_URI)"\n`,
    expected: 'no Send SMS Hook may be enabled',
  },
];

try {
  for (const test of cases) {
    const path = join(temp, `${test.name.replace(/\W+/g, '-')}.toml`);
    writeFileSync(path, test.source);
    let output = '';
    try {
      execFileSync(process.execPath, [verifier, path], { encoding: 'utf8', stdio: 'pipe' });
      throw new Error(`${test.name}: verifier accepted a dangerous configuration`);
    } catch (error) {
      if (error.status === undefined) throw error;
      output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    }
    if (!output.includes(test.expected)) {
      throw new Error(`${test.name}: expected "${test.expected}" in verifier output`);
    }
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log(`  auth configuration rejects ${cases.length} dangerous mutations`);
