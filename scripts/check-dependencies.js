#!/usr/bin/env node
/**
 * H-409 — dependency health, as a gate rather than a habit.
 *
 * `npm audit` is not a pass/fail signal on its own. Most of what it reports in
 * an Expo project is in build tooling that never reaches a phone, and a check
 * that fails on all of it teaches everyone to ignore it — which is how the one
 * that matters gets ignored too.
 *
 * So this fails on:
 *   * anything `critical`, anywhere;
 *   * anything `high` or worse that is not on the accepted list below.
 *
 * And reports everything else, with the reason it is accepted, so the list has
 * to be argued rather than grown quietly.
 *
 * Usage: node scripts/check-dependencies.js
 * Needs the network (npm audit talks to the registry). Skips itself, loudly,
 * when it cannot reach it — an offline machine is not evidence of anything.
 */
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

const MOBILE = join(__dirname, '..', 'mobile');

/**
 * Advisories we have looked at and decided to live with, each with the reason.
 * An entry here is a claim that the code path does not ship; if that stops
 * being true, the entry is wrong and has to go, not be extended.
 */
const ACCEPTED = [
  {
    package: 'postcss',
    url: 'https://github.com/advisories/GHSA-6g55-p6wh-862q',
    severity: 'high',
    why:
      'Expo SDK 54 pins postcss@~8.4.32 through @expo/metro-config, outside the ' +
      'patched 8.5.x line. It runs only in local web/build tooling; the app ' +
      'accepts no user-supplied CSS, and native Expo Go does not ship this Node ' +
      'build path. Remove this exception when Expo updates the supported range.',
  },
  {
    package: 'postcss',
    url: 'https://github.com/advisories/GHSA-r28c-9q8g-f849',
    severity: 'high',
    why:
      'Expo SDK 54 pins postcss@~8.4.32 through @expo/metro-config, outside the ' +
      'patched 8.5.x line. It runs only in local web/build tooling; the app ' +
      'accepts no user-supplied CSS, and native Expo Go does not ship this Node ' +
      'build path. Remove this exception when Expo updates the supported range.',
  },
  {
    package: 'js-yaml',
    url: 'https://github.com/advisories/GHSA-5p4m-2wfm-xmqj',
    severity: 'high',
    why:
      'Quadratic CPU on `!!omap` (CVE-2026-59870), with no backport to 3.x or ' +
      '4.x — so there is nothing to upgrade to. Every path to it is developer ' +
      'tooling reading files this repository owns: eslint -> @eslint/eslintrc ' +
      '(our lint config), expo -> @expo/xcpretty (xcodebuild output), and ' +
      'jest-expo -> babel-plugin-istanbul -> @istanbuljs/load-nyc-config ' +
      '(.nycrc). The app parses no YAML at all, and `js-yaml` is absent from ' +
      'the built web bundle — both checked on 2026-08-07. The attack needs a ' +
      'hostile YAML document; nothing here reads one. Remove this exception if ' +
      'a fix ships, or the moment any runtime code parses YAML.',
  },
  {
    package: 'uuid',
    url: 'https://github.com/advisories/GHSA-w5hq-g745-h8pq',
    severity: 'moderate',
    why:
      'uuid@7 reaches us only through expo -> @expo/config-plugins -> xcode, ' +
      'which runs during `expo prebuild` on a developer machine and is never ' +
      'bundled by Metro. The advisory needs a caller that passes its own ' +
      'buffer to v3/v5/v6; xcode calls v4 with no buffer. Pinning uuid to 11 ' +
      'would change an API xcode is written against, to fix a path that does ' +
      'not run in the app — a worse trade than writing this down.',
  },
  {
    package: 'image-size',
    url: 'https://github.com/advisories/GHSA-w3rx-r6r6-pgpr',
    severity: 'high',
    why:
      'ICNS parser infinite loop. image-size reaches us only through metro — ' +
      'the bundler, on a developer machine, sizing assets this repository ' +
      'owns. It is never bundled and no runtime path feeds it a user image. ' +
      'Remove this exception when Expo SDK 54 moves metro past the patch.',
  },
  {
    package: 'image-size',
    url: 'https://github.com/advisories/GHSA-5p2g-fcmc-qvqq',
    severity: 'high',
    why:
      'JXL/HEIF parser infinite loops — the same metro-only, dev-machine-only ' +
      'path as GHSA-w3rx-r6r6-pgpr above, accepted for the same reason and ' +
      'with the same removal condition.',
  },
  {
    package: 'nanoid',
    url: 'https://github.com/advisories/GHSA-2v37-7h3g-55p8',
    severity: 'high',
    why:
      'Custom generators can loop forever when asked for size zero. nanoid ' +
      'does ship, via @react-navigation/routers — but every call site there ' +
      'imports nanoid/non-secure and calls bare nanoid() with no size and no ' +
      'custom generator, so the precondition never occurs (checked ' +
      '2026-08-08). Remove this exception when react-navigation moves past ' +
      'the patched version, or if any code starts passing a size.',
  },
];

function audit() {
  try {
    const out = execFileSync('npm', ['audit', '--json'], {
      cwd: MOBILE,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(out);
  } catch (error) {
    // `npm audit` exits non-zero when it finds anything, and still prints JSON.
    if (error.stdout) {
      try {
        return JSON.parse(error.stdout);
      } catch {
        /* fall through */
      }
    }
    console.log('  npm audit could not run (offline?) — dependency health not checked');
    process.exit(0);
  }
}

const report = audit();
const advisories = new Map();
for (const entry of Object.values(report.vulnerabilities ?? {})) {
  for (const via of entry.via ?? []) {
    if (typeof via === 'object' && via.name) {
      advisories.set(`${via.name}|${via.url}`, {
        package: via.name,
        url: via.url,
        severity: via.severity,
        title: via.title,
      });
    }
  }
}

const RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
const blocking = [];
const accepted = [];

for (const advisory of advisories.values()) {
  const match = ACCEPTED.find(
    (a) => a.package === advisory.package && a.url === advisory.url,
  );
  if (match && RANK[advisory.severity] < RANK.critical) {
    accepted.push({ ...advisory, why: match.why });
  } else if (RANK[advisory.severity] >= RANK.high) {
    blocking.push(advisory);
  } else {
    accepted.push({ ...advisory, why: 'below the threshold this gate enforces' });
  }
}

for (const entry of accepted) {
  console.log(`  accepted  ${entry.severity.padEnd(8)} ${entry.package} — ${entry.why}`);
}

// An accepted entry for something that is no longer reported is dead weight
// and hides the next one. Say so rather than leaving it.
for (const entry of ACCEPTED) {
  if (!advisories.has(`${entry.package}|${entry.url}`)) {
    console.log(`  stale     the accepted entry for ${entry.package} no longer matches anything — remove it`);
  }
}

if (blocking.length) {
  console.error('\nUnaccepted high or critical advisories:\n');
  for (const entry of blocking) {
    console.error(`  - ${entry.severity} ${entry.package}: ${entry.title}\n    ${entry.url}`);
  }
  console.error(
    '\nFix it, or add it to ACCEPTED in this file with the reason it cannot reach a phone.\n',
  );
  process.exit(1);
}

console.log(`  no unaccepted high or critical advisories (${advisories.size} looked at)`);
