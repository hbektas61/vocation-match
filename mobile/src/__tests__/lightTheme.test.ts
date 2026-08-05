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
    // allows the match moment and the scrims that make text legible over
    // artwork — and nothing that is a *coloured ground* in its own right.
    // `paperVeil` joined the list on 2026-08-05 for the welcome screen, which
    // stands on the brand mark; the assertion below is what keeps it a veil:
    // every stop is the paper colour, so it can lift ink but never tint a page.
    const source = readFileSync(join(SRC, 'theme.ts'), 'utf8');
    expect(source).not.toMatch(/backgroundGradient/);
    expect(source).not.toMatch(/\bglass\b\s*=/);
    const gradientNames = [...source.matchAll(/^\s{2}(\w+):\s*\[/gm)].map((m) => m[1]);
    expect(gradientNames.sort()).toEqual(['match', 'paperVeil', 'photoScrim']);

    const veil = source.match(/paperVeil:\s*\[([^\]]+)\]/)?.[1] ?? '';
    expect(veil).toBeTruthy();
    for (const stop of veil.split(',').map((s) => s.trim()).filter(Boolean)) {
      expect(stop).toMatch(/250|247|#FAFAF7|0\)|'|"/);
    }
    expect(veil).not.toMatch(/#(?!FAFAF7)[0-9A-Fa-f]{6}/);
  });

  it('loads no display font that has to be downloaded', () => {
    // D-058 forbids a new font dependency, and the display face is the
    // platform serif precisely so there is nothing to fail to arrive.
    const app = readFileSync(join(MOBILE, 'App.tsx'), 'utf8');
    expect(app).not.toMatch(/Nunito/);
    expect(app).toMatch(/Inter_400Regular/);
  });
});
