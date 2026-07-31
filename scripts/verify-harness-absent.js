#!/usr/bin/env node
/**
 * D-057's visual harness must not exist in a production bundle.
 *
 * The claim is that `EXPO_PUBLIC_VISUAL_HARNESS` is inlined at build time, so
 * the branch in `App.tsx` becomes dead and the minifier removes it along with
 * everything it reaches. That is a claim about a build, and a comment asserting
 * it is worth nothing — so this greps the built output for the harness's own
 * marker and for the names only it uses.
 *
 * Run after `expo export --platform web`, which `scripts/check.sh` already does.
 * A missing `dist` is a failure rather than a pass: "nothing to check" and
 * "checked and clean" must not look the same.
 */
const fs = require('node:fs');
const path = require('node:path');

const DIST = path.join(__dirname, '..', 'mobile', 'dist');

/** Strings that appear only in the harness or in what it alone pulls in. */
const FORBIDDEN = [
  'VOCATION_VISUAL_HARNESS_ONLY',
  'D-057 visual gate',
];

/**
 * A preview flag baked into the export with a truthy value.
 *
 * The two dev-only affordances are gated differently, and the difference
 * decides what an export can honestly be asked:
 *
 *   - The **harness** is a literal `process.env.EXPO_PUBLIC_VISUAL_HARNESS ===
 *     '1'` in `App.tsx`. Expo inlines that comparison, so with the flag off the
 *     branch is dead and the minifier takes the whole harness with it. Absence
 *     is therefore provable, and `FORBIDDEN` proves it.
 *
 *   - The **simulate controls** are gated on `isFakeApiEnabled()`, which reads
 *     `env.EXPO_PUBLIC_USE_FAKE_API` off a parameter. That is a *runtime*
 *     read, so nothing is inlined and the branch survives minification. Their
 *     test IDs are in every export — including correct ones. Demanding their
 *     absence was tried and was simply a false alarm: the check failed against
 *     a build whose gate was shut.
 *
 * What is true of a correct export, and false of a dangerous one, is that it
 * carries no *assignment* of either preview flag to a truthy value. A clean
 * build leaves `process.env` empty but for `NODE_ENV`; a build exported with
 * the flag set bakes it in, and that build must not ship.
 */
const BAKED_IN_PREVIEW_FLAG =
  /EXPO_PUBLIC_(?:USE_FAKE_API|VISUAL_HARNESS)["']?\s*[:=]\s*["'](?:1|true)["']/i;

function bundleFiles(dir) {
  const found = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|html)$/.test(entry.name)) found.push(full);
    }
  };
  walk(dir);
  return found;
}

/**
 * The check has to be able to fail, or "clean" means nothing. This plants the
 * marker in a throwaway directory and asserts the scan finds it.
 */
function selfTest() {
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-scan-'));
  fs.writeFileSync(path.join(dir, 'planted.js'), `var x=${JSON.stringify(FORBIDDEN[0])};`);
  fs.writeFileSync(path.join(dir, 'flag.js'), 'process.env.EXPO_PUBLIC_USE_FAKE_API="1";');
  const found = scan(dir);
  fs.rmSync(dir, { recursive: true, force: true });
  const caughtMarker = found.some((hit) => hit.includes(FORBIDDEN[0]));
  const caughtFlag = found.some((hit) => hit.includes('EXPO_PUBLIC_USE_FAKE_API'));
  if (!caughtMarker || !caughtFlag) {
    console.error(
      `self-test failed: planted marker ${caughtMarker ? 'caught' : 'MISSED'},`
      + ` planted flag ${caughtFlag ? 'caught' : 'MISSED'}`,
    );
    process.exit(1);
  }
  console.log('self-test ok: a planted marker and a planted preview flag are both caught');
}

function scan(dir) {
  const hits = [];
  for (const file of bundleFiles(dir)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const needle of FORBIDDEN) {
      if (text.includes(needle)) hits.push(`${path.relative(dir, file)}: ${needle}`);
    }
    const baked = text.match(BAKED_IN_PREVIEW_FLAG);
    if (baked) hits.push(`${path.relative(dir, file)}: ${baked[0]}`);
  }
  return hits;
}

function main() {
  selfTest();
  if (!fs.existsSync(DIST)) {
    console.error(`no bundle at ${DIST} — export the web build first`);
    process.exit(1);
  }
  const files = bundleFiles(DIST);
  if (files.length === 0) {
    console.error(`no javascript found under ${DIST}`);
    process.exit(1);
  }

  const hits = scan(DIST);
  if (hits.length > 0) {
    console.error('a dev-only affordance reached the production bundle:');
    for (const hit of hits) console.error(`  ${hit}`);
    console.error(
      '\nharness markers: check the EXPO_PUBLIC_VISUAL_HARNESS branch in App.tsx.'
      + '\nbaked-in preview flag: this export was built with a preview flag set,'
      + '\nso it can run the in-memory fake and offer the simulate controls to'
      + '\nwhoever it is served to. Re-export without it.',
    );
    process.exit(1);
  }

  console.log(`harness absent from ${files.length} bundled file(s)`);
}

main();
