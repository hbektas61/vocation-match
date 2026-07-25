/**
 * The last unticked line on the release checklist that this repository could
 * ever tick on its own: "logs and analytics contain no sensitive location,
 * stay, profile, or message content".
 *
 * It has been unticked because the honest answer was "there is no analytics SDK,
 * so there is nothing to audit yet — recheck the moment one is added". That is a
 * true statement and a useless one: it depends on somebody remembering.
 *
 * So the check is the reminder. Nothing here proves an SDK would be used
 * safely; what it does is make adding one impossible to do quietly. The build
 * stops, somebody reads this comment, and the privacy pass happens before the
 * first event is sent rather than after.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MOBILE = join(__dirname, '..', '..');

/**
 * Packages that exist to send data somewhere. Not exhaustive and cannot be —
 * the point is to catch the ordinary case, and the ordinary case is one of
 * these.
 */
const TELEMETRY = [
  'sentry',
  'bugsnag',
  'crashlytics',
  'firebase',
  'amplitude',
  'mixpanel',
  'segment',
  'posthog',
  'datadog',
  'logrocket',
  'appsflyer',
  'branch',
  'analytics',
  'expo-tracking-transparency',
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === '__tests__' || entry === 'testSupport' ? [] : sourceFiles(full);
    }
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}

describe('nothing is sent anywhere, and nothing is written down', () => {
  it('has no analytics or crash-reporting dependency', () => {
    const manifest = JSON.parse(readFileSync(join(MOBILE, 'package.json'), 'utf8'));
    const installed = Object.keys({
      ...manifest.dependencies,
      ...manifest.devDependencies,
    });

    const found = installed.filter((name) =>
      TELEMETRY.some((marker) => name.toLowerCase().includes(marker)),
    );

    // If this fails because something legitimate matched a word, the fix is to
    // do the privacy pass and then say so here — not to widen the list.
    expect(found).toEqual([]);
  });

  it('logs nothing from the app itself', () => {
    // A `console.log` that happened to hold a coordinate, a stay, or a message
    // is the same leak as an analytics event, and on a device it goes to a log
    // anyone with a cable can read. There is no logging at all, which is the
    // only version of this rule that cannot be got wrong by accident.
    const offenders = sourceFiles(join(MOBILE, 'src'))
      .concat([join(MOBILE, 'App.tsx')])
      .filter((file) => /\bconsole\s*\.\s*(log|info|warn|error|debug|trace)\b/.test(
        readFileSync(file, 'utf8'),
      ))
      .map((file) => file.slice(MOBILE.length + 1));

    expect(offenders).toEqual([]);
  });

  it('is looking at real files, not at nothing', () => {
    // The two checks above pass trivially if the walk finds no source. It has
    // happened to better tests than this one.
    const files = sourceFiles(join(MOBILE, 'src'));
    expect(files.length).toBeGreaterThan(30);
    expect(files.some((f) => f.endsWith('supabaseApi.ts'))).toBe(true);
  });
});
