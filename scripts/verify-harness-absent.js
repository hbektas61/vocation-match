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
  const found = scan(dir);
  fs.rmSync(dir, { recursive: true, force: true });
  if (found.length === 0) {
    console.error('self-test failed: the scan did not find a planted marker');
    process.exit(1);
  }
  console.log('self-test ok: a planted marker is caught');
}

function scan(dir) {
  const hits = [];
  for (const file of bundleFiles(dir)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const needle of FORBIDDEN) {
      if (text.includes(needle)) hits.push(`${path.relative(dir, file)}: ${needle}`);
    }
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
    console.error('the visual harness reached the production bundle:');
    for (const hit of hits) console.error(`  ${hit}`);
    console.error('\nit must be excluded — check the EXPO_PUBLIC_VISUAL_HARNESS branch in App.tsx');
    process.exit(1);
  }

  console.log(`harness absent from ${files.length} bundled file(s)`);
}

main();
