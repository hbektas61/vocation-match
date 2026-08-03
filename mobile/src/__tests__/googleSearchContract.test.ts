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
  it('uses Autocomplete for typed names and Nearby only for the explicit locate action', () => {
    expect(source).toContain('https://places.googleapis.com/v1/places:autocomplete');
    expect(source).toContain('https://places.googleapis.com/v1/places:searchNearby');
  });

  it('never reaches for Text Search', () => {
    expect(code).not.toContain('places:searchText');
  });

  it('restricts rather than biases, so a distant answer cannot slip in', () => {
    expect(source).toContain('locationRestriction');
    expect(code).not.toContain('locationBias');
  });

  it('sends one session token per session, so Google bills a session', () => {
    expect(source).toContain('sessionToken');
  });

  it('keeps around-me inside 500 m and asks Google to rank by distance', () => {
    expect(source).toMatch(/GOOGLE_NEARBY_RADIUS_METERS"\)\s*\?\?\s*"500"/);
    expect(source).toContain('rankPreference: "DISTANCE"');
    expect(source).toContain('includedTypes: NEARBY_TYPES');
  });
});

describe('the field mask', () => {
  it('asks for the id, the name, and the line that separates two branches', () => {
    expect(source).toContain('suggestions.placePrediction.placeId');
    expect(source).toContain('suggestions.placePrediction.structuredFormat.mainText.text');
    expect(source).toContain('suggestions.placePrediction.structuredFormat.secondaryText.text');
  });

  it.each(['reviews', 'rating', 'regularOpeningHours', 'nationalPhoneNumber', 'websiteUri'])(
    'never asks for %s',
    (field) => {
      // Any of these moves the call into a dearer tier, and none is used.
      expect(code).not.toContain(field);
    },
  );

  it('asks for photos only where the owner priced it: the resolve mask', () => {
    // Owner decision (2026-08-03): the active venue's screen draws one live
    // photo beside the live name — resolved at view time, stored never
    // (D-054). That is one details call and one photo-media call, both
    // measured. The search paths stay in the cheap tier: neither mask below
    // may grow a photos field.
    expect(code).toContain('"id,displayName,photos"');
    expect(code).toContain('skipHttpRedirect=true');
    expect(code).not.toContain('suggestions.placePrediction.photos');
    const nearbyMask = code.match(/searchNearby[\s\S]{0,600}?X-Goog-FieldMask[^\n]*/)?.[0] ?? '';
    expect(nearbyMask).not.toContain('photos');
  });

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
    expect(source).toContain('google_nearby');
    expect(source).toContain('GOOGLE_NEARBY_MONTHLY_ALLOWANCE');
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
 * D-054 §3/§4 — the destination-first flow, guarded the same way.
 *
 * The rule that matters most here cannot be caught by any test that mocks
 * Google, because it is about the *request*: a type restriction on the default
 * venue search would silently lose every beach club Google files under `bar`,
 * and the loss would look like "Google does not know that place". So it is
 * asserted against the source.
 */
describe('the destination and venue steps', () => {
  it('asks for geocoding results, so a business can never be a destination', () => {
    expect(source).toContain('const DESTINATION_TYPES = ["geocode"]');
  });

  it('does not narrow destinations to cities, which would lose Alaçatı', () => {
    expect(code).not.toContain('(cities)');
  });

  it('restricts destinations to the country selected by the user', () => {
    expect(source).toContain('includedRegionCodes: [countryCode.toLowerCase()]');
    expect(source).toContain('error: "country_required"');
    expect(source).toContain('sessionQuery: `${countryCode}:${query}`');
  });

  it('keeps the broader venue mode genuinely unrestricted', () => {
    // The client now starts with lodging, but its explicit broader fallback is
    // still `all`. A list here would silently hide beach clubs again.
    expect(source).toMatch(/const VENUE_TYPES[\s\S]*?all:\s*null/);
  });

  it('offers no chip whose mask would hide a beach club', () => {
    // Measured on staging: with the five types the brief lists, "Before
    // Sunset" in Alaçatı came back empty while the unrestricted default
    // returned it first. Google's primary type for a beach club is not
    // reliably any of them, so the refinement was removed rather than shipped
    // broken. Only lodging — the one category Google is reliable about —
    // remains.
    expect(source).not.toMatch(/beach:\s*\[/);
    expect(source).toMatch(/stay:\s*\["lodging"/);
  });

  it('never asks for a query prediction, which is not a place', () => {
    expect(source).toContain('includeQueryPredictions: false');
  });

  it('restricts the venue search to the destination the server is holding', () => {
    // The box comes from `session_destination`, not from the request body: a
    // client-supplied rectangle is a client-supplied search area.
    expect(source).toContain('session_destination');
    expect(source).toMatch(/rectangle:\s*\{/);
  });

  it('deduplicates predictions before minting a token for each', () => {
    // Typed predictions and live nearby rows use different response shapes,
    // and both must deduplicate before tokens are minted.
    const mints = source.match(/record_place_selections/g) ?? [];
    expect(mints.length).toBeGreaterThanOrEqual(3);
    expect(source.match(/\.add\(prediction\.placeId!\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(source).toContain('seen.add(place.id!)');
  });

  it('asks Place Details only for a search area, and only for a position', () => {
    // Two masks, both minimal. Anything else would be content we may not keep.
    expect(source).toContain('"X-Goog-FieldMask": "id,location,viewport,types"');
    expect(source).toContain('"X-Goog-FieldMask": "id,location"');
  });

  it('measures the Here Now venue before it records anything', () => {
    // A provider failure must return before the check is written, so it
    // consumes nothing and corrupts nothing (§8.23).
    const failAt = source.indexOf('"venue_unreachable"');
    const recordAt = source.indexOf('record_presence_verified');
    expect(failAt).toBeGreaterThan(-1);
    expect(recordAt).toBeGreaterThan(failAt);
  });
});

/**
 * D-054 §2 — the migration may not create a place to put Google's content.
 */
describe('what the venue row is allowed to hold', () => {
  const migration = readFileSync(
    join(__dirname, '../../../supabase/migrations/20260730001300_google_venue_identity.sql'),
    'utf8',
  );

  it('writes a placeholder rather than a name', () => {
    expect(migration).toContain("'(google)', '(google)', '(google)'");
  });

  it('writes no coordinate for a Google venue, and still demands one elsewhere', () => {
    expect(migration).toContain('alter column location drop not null');
    expect(migration).toContain("check (location is not null or provider = 'google')");
  });

  it('settles two concurrent first selections in one statement', () => {
    expect(migration).toMatch(
      /insert into public\.hotels[\s\S]*?on conflict \(provider, provider_hotel_id\) do update[\s\S]*?returning h\.id/,
    );
  });

  it('adds no column that could hold Google display content', () => {
    expect(migration).not.toMatch(/add column\s+\w*(display_name|formatted_address|photo_ref|rating)/i);
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
