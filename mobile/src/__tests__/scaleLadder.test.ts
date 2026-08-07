/**
 * D-059 — the measurements are a system, and the system is checked.
 *
 * D-058 locked the palette this way and the repaint held. The measurements
 * were left to judgement, and judgement drifted: by 2026-08-06 the app was
 * rendering 22 distinct font sizes, 22 distinct padding values, 28 distinct
 * corner radii and 13 letter-spacings — against a theme that declared 6, 5, 6
 * and none. Two cards doing the same job sat 2pt apart, the screen title was
 * 34 on one tab and 26 on another, and nobody could say why, because there was
 * no why. That is not a scale; it is a pile of separate evenings.
 *
 * The rule, exactly parallel to `lightTheme.test.ts`: a converted file does not
 * write a measurement. It imports `font`, `spacing`, `radius`, `leading` or
 * `tracking` and uses a rung. Anything else is somebody's eye, and an eye is
 * what produced the pile.
 *
 * `CONVERTED` grows one file per screen as the D-059 pass walks the app. A file
 * that is not on it is not exempt — it is queued, and `PENDING` below is
 * asserted against the real tree so a new screen cannot appear unnoticed in
 * either list.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { font, leading, radius, spacing, tracking } from '../theme';

const SRC = join(__dirname, '..');

/**
 * Every file in the app that draws. The D-059 pass finished on 2026-08-06, so
 * `PENDING` is empty and the union assertion below has become the stronger
 * claim: this list *is* the set of drawing files, and each one is clean.
 *
 * A file leaves this list only by ceasing to draw at all — `RootNavigator`
 * did, once its one hand-set size became a token and nothing else in it
 * measured anything. If a literal ever reappears there it re-enters the scan,
 * lands in neither list, and the union assertion fails.
 */
const CONVERTED = [
  'components/BigActionButton.tsx',
  'components/CaptchaChallenge.tsx',
  'components/ContextSelector.tsx',
  'components/DateField.tsx',
  'components/DestinationCard.tsx',
  'components/DigitKeypad.tsx',
  'components/LanguageSwitch.tsx',
  'components/NoHotelCard.tsx',
  // D-065's permission primer, which stands wherever the app asks for one.
  'components/PermissionPrimer.tsx',
  'components/PhotoGrid.tsx',
  'components/PresenceResult.tsx',
  'components/PrivacyShield.tsx',
  'components/ProfileRing.tsx',
  'components/RadarEmpty.tsx',
  'components/RoomIllustrations.tsx',
  'components/VacationFeatureCard.tsx',
  'components/VenueRibbon.tsx',
  'components/VenuePicker.tsx',
  'components/ui.tsx',
  'devtools/VisualHarness.tsx',
  'navigation/FloatingTabBar.tsx',
  'onboarding/ChoiceChip.tsx',
  'onboarding/OnboardingFlow.tsx',
  'onboarding/OnboardingScaffold.tsx',
  'onboarding/steps/GenderStep.tsx',
  'onboarding/steps/InterestsStep.tsx',
  'onboarding/steps/OrientationStep.tsx',
  // Joined the scan under D-065: the code step draws its own six boxes now
  // instead of borrowing `Field`, so it has a stylesheet of its own.
  'onboarding/steps/OtpStep.tsx',
  'onboarding/steps/PhoneStep.tsx',
  'onboarding/steps/PromiseStep.tsx',
  'onboarding/steps/ShowMeStep.tsx',
  'onboarding/steps/WelcomeStep.tsx',
  'screens/ChatScreen.tsx',
  'screens/CheckinScreen.tsx',
  'screens/DiscoveryScreen.tsx',
  'screens/EventDetailScreen.tsx',
  'screens/EventsScreen.tsx',
  'screens/HotelDetailsScreen.tsx',
  'screens/HotelScreen.tsx',
  'screens/InboxScreen.tsx',
  'screens/MatchScreen.tsx',
  'screens/SettingsScreen.tsx',
  'screens/UpcomingScreen.tsx',
];

/**
 * Queued for the D-059 pass. Empty, and meant to stay that way: a new screen
 * is written on the ladder or it does not ship. The list survives so a future
 * pass — a second theme, a new surface — has somewhere honest to put work in
 * progress rather than quietly widening the exemption.
 */
const PENDING: string[] = [];

/**
 * The properties a design system owns. Width and height are absent on purpose:
 * a 48pt avatar is that size because of what it holds, not because of a rung.
 */
const MEASURED =
  '(?:fontSize|lineHeight|letterSpacing|borderRadius|gap|rowGap|columnGap|padding|paddingTop|paddingBottom|paddingLeft|paddingRight|paddingHorizontal|paddingVertical|margin|marginTop|marginBottom|marginLeft|marginRight|marginHorizontal|marginVertical)';

/**
 * A bare number against one of those properties. `0` is allowed — it is the
 * absence of a measurement rather than a choice of one — and so is anything
 * built out of a token, because that is an expression and not a literal.
 */
const bareMeasures = () => new RegExp(`\\b${MEASURED}:\\s*(-?\\d+(?:\\.\\d+)?)\\s*[,}\\n]`, 'g');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === '__tests__' || entry === 'testSupport' ? [] : sourceFiles(full);
    }
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

/** Every file that draws something: it has a stylesheet or an inline style. */
const DRAWING_FILES = sourceFiles(SRC)
  .filter((file) => {
    const body = readFileSync(file, 'utf8');
    // A fresh regex per file: a shared `/g/` one carries `lastIndex` between
    // calls and would quietly skip every other file.
    return bareMeasures().test(body) || /StyleSheet\.create/.test(body);
  })
  .map((file) => relative(SRC, file))
  .sort();

describe('the ladder covers the whole app', () => {
  it('scans a tree that actually contains the screens', () => {
    // A green run proves nothing if the list is empty, which is what a renamed
    // directory would quietly do.
    expect(DRAWING_FILES).toContain('screens/DiscoveryScreen.tsx');
    expect(DRAWING_FILES).toContain('components/ui.tsx');
    expect(DRAWING_FILES.length).toBeGreaterThan(30);
  });

  it('accounts for every drawing file exactly once', () => {
    // A new screen lands in neither list, which fails here rather than sliding
    // in with its own measurements and nobody noticing for a month. With
    // `PENDING` empty this is also what proves the pass actually finished.
    expect([...CONVERTED, ...PENDING].sort()).toEqual(DRAWING_FILES);
  });
});

describe('a converted file measures nothing by hand', () => {
  it.each(CONVERTED)('%s', (name) => {
    const body = readFileSync(join(SRC, name), 'utf8');
    const offenders: string[] = [];
    for (const hit of body.matchAll(bareMeasures())) {
      if (Number(hit[1]) === 0) continue;
      const line = body.slice(0, hit.index).split('\n').length;
      offenders.push(`${name}:${line}  ${hit[0].trim()}`);
    }
    expect(offenders).toEqual([]);
  });
});

describe('the ladder itself', () => {
  it('keeps every reading step far enough from its neighbour to read as a step', () => {
    // Two sizes 1pt apart are not a scale, they are a mistake nobody can spot.
    // Three sizes are outside the reading ladder on purpose and named here so
    // the exception stays deliberate: `label` is structure rather than prose,
    // `control` is the semibold pair for `body`, and `moment` is the one loud
    // place. Everything else has to clear a fifth of the step below it.
    const reading = [font.caption, font.body, font.heading, font.title, font.display];
    for (let i = 1; i < reading.length; i += 1) {
      expect(reading[i] / reading[i - 1]).toBeGreaterThanOrEqual(1.18);
    }
    expect(font.label).toBeLessThan(font.caption);
    expect(font.control).toBeLessThan(font.body);
  });

  it('never asks anybody to read below 12pt', () => {
    // The 9, 10 and 11pt text the screens had grown went up, not down.
    for (const size of Object.values(font)) expect(size).toBeGreaterThanOrEqual(12);
  });

  it('builds every spacing rung out of pairs of pixels', () => {
    // An odd gap cannot centre against an even one, which is where most of the
    // one-off 3s, 5s and 7s came from in the first place.
    for (const step of Object.values(spacing)) expect(step % 2).toBe(0);
  });

  it('keeps the ladders small enough to hold in your head', () => {
    expect(Object.keys(spacing)).toHaveLength(9);
    expect(Object.keys(radius)).toHaveLength(7);
    expect(Object.keys(leading)).toHaveLength(3);
    expect(Object.keys(tracking)).toHaveLength(4);
  });
});
