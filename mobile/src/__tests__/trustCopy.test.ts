/**
 * H-402 — the promises the copy is allowed to make.
 *
 * Decision D-007: a room is described as a self-declared stay or as a recent
 * proximity check, never as a verified reservation or an approval by a hotel.
 * Nobody checks anything. Saying otherwise is not a wording preference — it is
 * the difference between "I chose to trust this person" and "the app told me
 * they were vouched for", and someone will make a decision about meeting a
 * stranger on the strength of it.
 *
 * This has been a rule in a document since the first week. A rule in a document
 * survives exactly until the next person writes a headline. So it is a test.
 */
import { COPY, COPY_FOR } from '../copy';

/** Every string the app can say, flattened out of the nested copy object. */
function allStrings(value: unknown, path = ''): { path: string; text: string }[] {
  if (typeof value === 'string') {
    return [{ path, text: value }];
  }
  if (typeof value === 'function') {
    // The parameterised sentences, with a placeholder standing in for the value.
    return [{ path, text: String((value as (arg: string) => string)('a hotel')) }];
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) =>
      allStrings(child, path ? `${path}.${key}` : key),
    );
  }
  return [];
}

const sentences = [...allStrings(COPY), ...allStrings(COPY_FOR)];

/**
 * Sentences allowed to use a forbidden word, because they use it to say the
 * app does *not* do that thing. The absence is the product, so it has to be
 * sayable — but only here, and only in a sentence that denies.
 *
 * Both halves are required: a new sentence cannot slip in by adding "never" to
 * a marketing claim, and an existing one cannot quietly change meaning without
 * being added to this list on purpose.
 */
/**
 * The few sentences whose whole job is to say what the product does *not* ask
 * for. Naming them one by one is the point: a denial has to be deliberate, and
 * the allowlist alone is not enough — the sentence still has to contain a
 * denial word to pass.
 */
const MAY_DENY = new Set([
  'upcoming.explainer',
  'discovery.overlapUpcoming',
  'onboarding.welcome.body',
  'onboarding.teaching.upcoming.body',
]);
const DENIAL = /\b(nobody|no one|never|not|without|no)\b/i;

function offences(forbidden: RegExp) {
  return sentences
    .filter(({ path, text }) => {
      if (!forbidden.test(text)) return false;
      return !(MAY_DENY.has(path) && DENIAL.test(text));
    })
    .map(({ path, text }) => `${path}: ${text}`);
}

describe('what the app is allowed to claim', () => {
  it('has copy to check at all', () => {
    // The check above is worthless if the flattening silently returns nothing.
    expect(sentences.length).toBeGreaterThan(80);
    expect(sentences.every((s) => s.path.length > 0)).toBe(true);
  });

  it.each([
    ['a verified anything', /\bverif(y|ied|ication)\b/i],
    ['a confirmed reservation', /\breservation\b/i],
    ['a booking', /\bbooking\b/i],
    ['a hotel vouching for someone', /\bhotel[- ]approved\b|\bapproved by\b|\bvouch/i],
    ['a guarantee', /\bguarantee/i],
    ['a real guest', /\bverified guest\b|\breal guest\b/i],
    ['an identity check', /\bpassport\b|\bID check\b|\bidentity\b/i],
    ['exactly how far away someone is', /\b\d+\s*(m|metres|meters|km)\s*away\b|\bdistance from\b/i],
  ])('never claims %s', (_label, forbidden) => {
    expect(offences(forbidden)).toEqual([]);
  });

  it('still catches a forbidden word in a sentence that does not deny it', () => {
    // The allowlist is per sentence, not per word: proof that adding one entry
    // did not switch the whole check off.
    const forbidden = /\breservation\b/i;
    expect(forbidden.test(COPY.upcoming.explainer)).toBe(true);
    expect(offences(forbidden)).toEqual([]);
    expect(
      [{ path: 'somewhere.new', text: 'Every stay here is a confirmed reservation.' }]
        .filter(({ path, text }) => forbidden.test(text) && !(MAY_DENY.has(path) && DENIAL.test(text))),
    ).toHaveLength(1);
  });

  it('describes Upcoming as self-declared, in the copy people actually read', () => {
    expect(COPY.upcoming.statusBadge).toMatch(/self-declared/i);
    expect(COPY.upcoming.explainer).toMatch(/self-declared/i);
    // And says what is not asked for, because the absence is the product.
    expect(COPY.upcoming.explainer).toMatch(/reservation|booking number|ID/i);
  });

  it('describes Here Now as a proximity check and not as a location', () => {
    expect(COPY.hereNow.statusBadge).toMatch(/near the hotel/i);
    expect(COPY.hereNow.explainer).toMatch(/500\s*m/i);
    expect(COPY.hereNow.explainer).toMatch(/never shown or stored/i);
  });

  it('never promises the photo is more private than it is', () => {
    // It is private, and the sentence says exactly who can see it rather than
    // "only you" — which would be false the moment anyone enters the room.
    expect(COPY.photo.explainer).toMatch(/only people in a room with you/i);
    expect(COPY.photo.explainer).not.toMatch(/\bonly you\b/i);
  });

  it('never says a deletion removed more than it did', () => {
    // The half a deletion screen usually leaves out.
    expect(COPY.deleteAccount.whatStays).toMatch(/report/i);
    expect(COPY.deleteAccount.refused).toMatch(/nothing was deleted/i);
    expect(COPY.deleteAccount.unconfirmed).toMatch(/could not confirm/i);
  });
});
