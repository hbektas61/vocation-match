/**
 * Two languages, one shape — and no developer codes in either.
 *
 * The compiler already stops a sentence from existing in one language only
 * (`tr: Copy`). What it cannot see is a sentence that exists in both and says
 * nothing in one of them, or a screen that shows somebody `LOCATION_INACCURATE`
 * because the internal outcome leaked into the copy instead of being mapped to
 * a human sentence.
 *
 * D-058 made this worth its own file: the state screens were rebuilt, and a
 * rebuilt error screen is exactly where a raw enum gets printed by accident.
 */
import { en, enFor } from '../i18n/en';
import { tr, trFor } from '../i18n/tr';

type Leaf = { path: string; value: string };

function leaves(node: unknown, path = ''): Leaf[] {
  if (typeof node === 'string') return [{ path, value: node }];
  if (node && typeof node === 'object') {
    return Object.entries(node as Record<string, unknown>).flatMap(([key, child]) =>
      leaves(child, path ? `${path}.${key}` : key),
    );
  }
  return [];
}

/**
 * `identity.genders` and `identity.orientations` are open `Record<string,
 * string>` lookups keyed by the label a person chose, not fixed copy: English
 * carries only the two it renames and lets every other label through as
 * written, while Turkish renames most of them. Comparing their key sets would
 * assert something that was never true.
 */
const OPEN_MAPS = ['identity.genders.', 'identity.orientations.'];
const isFixedCopy = (path: string) => !OPEN_MAPS.some((prefix) => path.startsWith(prefix));

const EN = leaves(en).filter((l) => isFixedCopy(l.path));
const TR = leaves(tr).filter((l) => isFixedCopy(l.path));

/**
 * A developer code: SCREAMING_SNAKE, two words or more. `IN_RANGE`,
 * `EVENT_FINISHED`, `HERE_NOW` — the vocabulary of the API, not of a person
 * deciding whether to walk to a bar.
 */
const CODE = /\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/;

describe('the two languages stay one product', () => {
  it('says the same set of things in both', () => {
    expect(EN.length).toBeGreaterThan(200);
    expect(TR.map((l) => l.path).sort()).toEqual(EN.map((l) => l.path).sort());
  });

  it('has no blank or placeholder sentence in either language', () => {
    const empty = [...EN, ...TR].filter((l) => l.value.trim().length === 0);
    expect(empty).toEqual([]);
    const todo = [...EN, ...TR].filter((l) => /\bTODO\b|\bFIXME\b|^\.\.\.$/.test(l.value));
    expect(todo).toEqual([]);
  });

  it('does not leave a sentence untranslated', () => {
    // A Turkish value identical to its English sibling is usually a forgotten
    // copy-paste. The exceptions are the ones that are a name rather than a
    // sentence: the product, the two providers' required attribution strings,
    // the language switch's own labels, and a placeholder made of place names.
    const nameNotSentence = [
      'appName',
      'language.',
      'venue.destinationPlaceholder',
      // "Premium" is the entitlement's name in both languages.
      'vacation.premiumTag',
    ];
    const byPath = new Map(EN.map((l) => [l.path, l.value]));
    const untranslated = TR.filter((l) => {
      const english = byPath.get(l.path);
      if (english === undefined || english !== l.value) return false;
      if (l.path.endsWith('attribution')) return false;
      if (nameNotSentence.some((prefix) => l.path.startsWith(prefix))) return false;
      // A value that is only punctuation, a number or a placeholder is fine.
      return /\p{L}{4,}/u.test(l.value);
    }).map((l) => `${l.path} → ${l.value}`);
    expect(untranslated).toEqual([]);
  });

  it('never shows an internal outcome code to a person', () => {
    // The codes may be keys — the map from `TOO_FAR` to a sentence has to be
    // keyed by something — but never values.
    const leaked = [...EN, ...TR]
      .filter((l) => CODE.test(l.value))
      .map((l) => `${l.path} → ${l.value}`);
    expect(leaked).toEqual([]);
  });

  it('keeps the two parameterised-copy tables in step', () => {
    const enKeys = Object.keys(enFor).sort();
    const trKeys = Object.keys(trFor).sort();
    expect(trKeys).toEqual(enKeys);
    for (const key of enKeys) {
      expect(typeof (trFor as Record<string, unknown>)[key]).toBe('function');
    }
  });

  it('maps every location and event outcome to a sentence in both languages', () => {
    // The D-058 state matrix, checked from the copy side. Each internal
    // outcome in `EventPresenceAnswer` / the hotel room status has to reach
    // real words in both languages — otherwise a rebuilt state screen has
    // nothing to print but the code it was handed.
    const paths = [
      'events.hereNowOpen',
      'events.hereNowNotStarted',
      'events.hereNowFinished',
      'events.hereNowInaccurate',
      'events.hereNowTooFar',
      'events.hereNowLocationUnavailable',
      'events.hereNowUnavailableTbd',
      'events.cancelled',
      'roomReason.TOO_FAR',
      'roomReason.NO_RECENT_CHECK',
      'roomReason.PREMIUM_ONLY',
    ];
    for (const path of paths) {
      for (const [language, table] of [['en', EN], ['tr', TR]] as const) {
        const hit = table.find((l) => l.path === path);
        expect(`${language}:${path}:${hit ? 'present' : 'missing'}`).toBe(
          `${language}:${path}:present`,
        );
        expect(hit!.value.length).toBeGreaterThan(12);
        expect(CODE.test(hit!.value)).toBe(false);
      }
    }
  });
});
