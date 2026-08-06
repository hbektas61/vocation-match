/**
 * D-058, as a property of the source rather than a claim in a report.
 *
 * A repaint is only finished if it cannot quietly come undone. Two ways it
 * can: somebody pastes a hex into a screen because the token they wanted did
 * not exist, or somebody reintroduces a colour from the night theme because it
 * still looked right on their monitor. Both are invisible in review and both
 * are visible here.
 *
 * The rule this enforces is the one in `.studio/d058-token-contract.md`: the
 * only file in the app allowed to name a colour is `theme.ts`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..');
const MOBILE = join(SRC, '..');

/**
 * Every file that reaches a phone. Tests and fixtures for tests are excluded:
 * a test is allowed to write a hex, because writing one is often the only way
 * to assert something about a colour.
 */
function runtimeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === '__tests__' || entry === 'testSupport' ? [] : runtimeFiles(full);
    }
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}

const FILES = [...runtimeFiles(SRC), join(MOBILE, 'App.tsx')].filter(
  (file) => relative(SRC, file) !== 'theme.ts',
);

const COLOUR_LITERAL = /#[0-9A-Fa-f]{3,8}\b|\brgba?\s*\(/g;

/** D-043/D-044/D-046 — the night set, and the sunset ground it sat on. */
const RETIRED = [
  '#241E49', '#3A2B63', '#8A4A6F', '#D97B52', // the sunset gradient
  '#2A2350', '#3A3168', '#0F1B3D', '#321F45', '#2A3052', // the night surfaces
  '#EC4899', '#F472B6', '#FBBF24', '#FCD34D', '#FB7185', // the rendevuu pinks and golds
  '#1A1A2E', '#F5F6FA', '#A3A9C9', '#F87171', '#3B1F2B', '#34D399',
];

describe('the light theme is the only theme left in the source', () => {
  it('scans a source tree that actually contains the screens', () => {
    // A pass proves nothing if the file list is empty, which is exactly what a
    // renamed directory would do to it.
    expect(FILES.length).toBeGreaterThan(60);
    expect(FILES.some((f) => f.endsWith('DiscoveryScreen.tsx'))).toBe(true);
    expect(FILES.some((f) => f.endsWith('CheckinScreen.tsx'))).toBe(true);
    expect(FILES.some((f) => f.endsWith('ui.tsx'))).toBe(true);
  });

  it('names no colour outside theme.ts', () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const source = readFileSync(file, 'utf8');
      source.split('\n').forEach((line, index) => {
        const found = line.match(COLOUR_LITERAL);
        if (found) offenders.push(`${relative(MOBILE, file)}:${index + 1} → ${found.join(', ')}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('has no night-theme colour anywhere, including in a comment', () => {
    // Comments count. A retired hex left in a comment is the seed of the next
    // paste, and this file is cheap enough to be strict.
    const offenders: string[] = [];
    for (const file of FILES) {
      const source = readFileSync(file, 'utf8').toUpperCase();
      for (const gone of RETIRED) {
        if (source.includes(gone)) offenders.push(`${relative(MOBILE, file)} → ${gone}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no longer paints a full-screen gradient ground', () => {
    // The sunset was drawn by a `LinearGradient` sized to the screen. D-058
    // allows exactly two gradients — the match moment and a photo scrim — and
    // both are named in `theme.ts`.
    const source = readFileSync(join(SRC, 'theme.ts'), 'utf8');
    expect(source).not.toMatch(/backgroundGradient/);
    expect(source).not.toMatch(/\bglass\b\s*=/);
    const gradientNames = [...source.matchAll(/^\s{2}(\w+):\s*\[/gm)].map((m) => m[1]);
    expect(gradientNames.sort()).toEqual(['match', 'photoScrim']);
  });

  it('renders without waiting for a font to arrive', () => {
    // D-058 kept the display face on the platform serif so nothing could fail
    // to arrive. D-060 spent that: on iOS the platform serif is Georgia, and
    // the product read as an encyclopedia. What has to survive the trade is
    // the reason behind it — `useFonts` must stay ungated, so a slow network
    // costs a moment of the wrong shape rather than a blank screen.
    const app = readFileSync(join(MOBILE, 'App.tsx'), 'utf8');
    expect(app).toMatch(/Inter_400Regular/);
    expect(app).toMatch(/PlusJakartaSans_700Bold/);
    // The retired families stay retired: Nunito was D-043's rounded face.
    expect(app).not.toMatch(/Nunito/);
    // No `const [loaded] = useFonts(...); if (!loaded) return …`.
    expect(app).not.toMatch(/=\s*useFonts\(/);
  });

  it('draws a border only on something you can operate', () => {
    // D-060: a white card on a white ground was fenced with a 1px rule, which
    // is how a document panel is drawn. The lift tells a card from the ground
    // now, and an edge means one thing — input, chip, secondary button.
    const ui = readFileSync(join(SRC, 'components/ui.tsx'), 'utf8');
    const fenced = ['  card: {', '  keyCard: {', '  empty: {'].filter((key) => {
      const block = ui.slice(ui.indexOf(key), ui.indexOf('},', ui.indexOf(key)));
      return /borderWidth/.test(block);
    });
    expect(fenced).toEqual([]);
  });
});
