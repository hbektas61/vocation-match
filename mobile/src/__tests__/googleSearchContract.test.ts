/**
 * D-053 §4/§11 — a static contract over the one file that may talk to Google.
 *
 * This reads the edge function as text rather than running it, because the
 * things worth guarding here are not behaviours a mock would exercise: which
 * endpoint is called, which fields are asked for, and which knobs are used.
 * Each of them silently changes what we are billed, and two of them were
 * already wrong once — the first cut used Text Search with a location *bias*.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(
  join(__dirname, '../../../supabase/functions/places-google/index.ts'),
  'utf8',
);

/**
 * The same file with its prose removed.
 *
 * The comments in that function deliberately *name* the endpoints it must not
 * use, which a naive grep reads as a violation. Stripping them means the
 * forbidden-endpoint checks look at code only — and it also means a comment can
 * never be used to hide a real call from this test.
 */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

describe('the Google endpoint', () => {
  it('is Autocomplete (New), and nothing else', () => {
    expect(source).toContain('https://places.googleapis.com/v1/places:autocomplete');
  });

  it.each([
    ['Text Search', 'places:searchText'],
    ['Nearby Search', 'places:searchNearby'],
  ])('never reaches for %s', (_label, endpoint) => {
    // Both are dearer SKUs and neither answers this screen's question. Checked
    // against the code rather than the prose, which names them on purpose.
    expect(code).not.toContain(endpoint);
  });

  it('restricts rather than biases, so a distant answer cannot slip in', () => {
    expect(source).toContain('locationRestriction');
    expect(code).not.toContain('locationBias');
  });

  it('sends one session token per session, so Google bills a session', () => {
    expect(source).toContain('sessionToken');
  });
});

describe('the field mask', () => {
  it('asks for the id, the name, and the line that separates two branches', () => {
    expect(source).toContain('suggestions.placePrediction.placeId');
    expect(source).toContain('suggestions.placePrediction.structuredFormat.mainText.text');
    expect(source).toContain('suggestions.placePrediction.structuredFormat.secondaryText.text');
  });

  it.each(['photos', 'reviews', 'rating', 'regularOpeningHours', 'nationalPhoneNumber', 'websiteUri'])(
    'never asks for %s',
    (field) => {
      // Any of these moves the call into a dearer tier, and none is used.
      expect(code).not.toContain(field);
    },
  );

  it('never asks Autocomplete for a coordinate, because the anchor is ours', () => {
    expect(code).not.toContain('placePrediction.location');
  });
});

describe('the ceilings', () => {
  it('meters Autocomplete and label resolution separately', () => {
    // One counter hid that these are different prices at different volumes.
    expect(source).toContain('google_autocomplete');
    expect(source).toContain('google_place_details');
    expect(source).toContain('GOOGLE_AUTOCOMPLETE_MONTHLY_ALLOWANCE');
    expect(source).toContain('GOOGLE_DETAILS_MONTHLY_ALLOWANCE');
  });

  it('carries the approved pilot defaults', () => {
    expect(source).toMatch(/GOOGLE_AUTOCOMPLETE_MONTHLY_ALLOWANCE"\s*\)\s*\?\?\s*"9000"/);
    expect(source).toMatch(/GOOGLE_DETAILS_MONTHLY_ALLOWANCE"\s*\)\s*\?\?\s*"4500"/);
  });

  it('claims before it spends, never counts after', () => {
    const claimAt = source.indexOf('claim("google_autocomplete"');
    const fetchAt = source.indexOf('fetch(PLACES_AUTOCOMPLETE');
    expect(claimAt).toBeGreaterThan(-1);
    expect(fetchAt).toBeGreaterThan(claimAt);
  });
});

describe('provenance', () => {
  it('hands back selection tokens, never bare Place IDs', () => {
    expect(source).toContain('record_place_selections');
    expect(source).toContain('selectionToken');
  });

  it('enforces the three-character minimum on the server', () => {
    expect(source).toContain('MIN_QUERY');
    expect(source).toMatch(/const MIN_QUERY = 3;/);
  });

  it('opens the session through the server, which owns the rolling limits', () => {
    expect(source).toContain('open_search_session');
  });
});

/**
 * The selection guard, read as text.
 *
 * Three of its four refusals were executed against staging — an invented
 * token, another user's, and a replay. Expiry shares the same single statement
 * and could only be executed by waiting ten minutes, so it is guarded here
 * instead: if the clause is ever dropped, this fails.
 */
describe('the selection guard', () => {
  const migration = readFileSync(
    join(__dirname, '../../../supabase/migrations/20260730001000_google_selection_tokens.sql'),
    'utf8',
  );

  it.each([
    ['ownership', 's.user_id = v_user'],
    ['single use', 's.used_at is null'],
    ['expiry', 's.expires_at > now()'],
  ])('refuses on %s', (_label, clause) => {
    expect(migration).toContain(clause);
  });

  it('consumes the selection in the same statement that validates it', () => {
    // A read-then-write would let two requests both pass the check.
    expect(migration).toMatch(/update app\.place_selections s[\s\S]*?set used_at = now\(\)/);
  });

  it('spends the entitlement inside the check-in transaction', () => {
    // Outside it, a later failure would leave a find spent on nothing.
    const findsAt = migration.indexOf('app.google_finds');
    const insertAt = migration.indexOf('insert into public.checkins');
    expect(findsAt).toBeGreaterThan(-1);
    expect(insertAt).toBeGreaterThan(findsAt);
  });

  it('takes a token rather than a Place ID, so a client cannot assert a label', () => {
    expect(migration).toContain('p_selection_token  uuid default null');
    expect(migration).toContain('drop function if exists public.checkin_here(double precision, double precision, text)');
  });
});
