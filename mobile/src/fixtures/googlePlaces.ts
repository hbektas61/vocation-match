/**
 * A deterministic stand-in for Google Places (D-054, brief §8).
 *
 * The brief is explicit that the test suite must not depend on live Google
 * ranking or on production data, and the cases it names are all about *how
 * Google classifies things* rather than about our own catalogue — a beach club
 * filed under `bar`, a named public beach, a same-named resort in another
 * country. So the fixture carries Google's `types` even though the application
 * never asks for them and never stores them: they exist here precisely so a
 * test can prove the default search does **not** filter on them.
 *
 * Nothing in this file is shipped data. It is a fake provider, in the same
 * spirit as `fixtures/hotels.ts`, and the real client reaches Google through
 * the edge function and nowhere else.
 */

export interface FakeGooglePlace {
  placeId: string;
  /** The prediction's main line. */
  name: string;
  /** The secondary line — what tells two branches of a chain apart. */
  detail: string | null;
  /**
   * Google's own primary types. The app requests none of these and stores none
   * of them; they are here so the fake can answer the way Google would.
   */
  types: string[];
  /** ISO country restriction used by the destination picker fake. */
  countryCode: string;
  latitude: number;
  longitude: number;
  /** Set on a destination: the box the venue step is restricted to. */
  viewport?: { lowLat: number; lowLng: number; highLat: number; highLng: number };
}

/** Google's own collections, as the fake understands them. */
const GEOGRAPHIC = new Set([
  'locality',
  'sublocality',
  'neighborhood',
  'administrative_area_level_1',
  'administrative_area_level_2',
  'political',
  'natural_feature',
  'archipelago',
]);

export function isGeographic(place: FakeGooglePlace): boolean {
  return !place.types.includes('establishment') && place.types.some((type) => GEOGRAPHIC.has(type));
}

/**
 * Destinations. Deliberately not all cities: Alaçatı is a `sublocality` of
 * Çeşme and Dubai Marina is a `neighborhood`, which is exactly the pair the
 * brief names as the reason a city-only restriction is wrong (§3).
 */
export const GOOGLE_DESTINATIONS: FakeGooglePlace[] = [
  {
    placeId: 'gp-dest-alacati',
    name: 'Alaçatı',
    detail: 'İzmir, Türkiye',
    types: ['sublocality', 'political'],
    countryCode: 'TR',
    latitude: 38.2795,
    longitude: 26.3735,
    viewport: { lowLat: 38.259, lowLng: 26.353, highLat: 38.3, highLng: 26.394 },
  },
  {
    placeId: 'gp-dest-cesme',
    name: 'Çeşme',
    detail: 'İzmir, Türkiye',
    types: ['locality', 'political'],
    countryCode: 'TR',
    latitude: 38.3235,
    longitude: 26.3055,
    viewport: { lowLat: 38.24, lowLng: 26.2, highLat: 38.4, highLng: 26.42 },
  },
  {
    placeId: 'gp-dest-dubai-marina',
    name: 'Dubai Marina',
    detail: 'Dubai, Birleşik Arap Emirlikleri',
    types: ['neighborhood', 'political'],
    countryCode: 'AE',
    latitude: 25.0805,
    longitude: 55.1403,
    viewport: { lowLat: 25.06, lowLng: 55.12, highLat: 25.1, highLng: 55.16 },
  },
  {
    placeId: 'gp-dest-mykonos',
    name: 'Mykonos',
    detail: 'Ege Adaları, Yunanistan',
    types: ['locality', 'political'],
    countryCode: 'GR',
    latitude: 37.4467,
    longitude: 25.3289,
    viewport: { lowLat: 37.4, lowLng: 25.27, highLat: 37.5, highLng: 25.4 },
  },
  {
    placeId: 'gp-dest-marbella',
    name: 'Marbella',
    detail: 'Málaga, İspanya',
    types: ['locality', 'political'],
    countryCode: 'ES',
    latitude: 36.5101,
    longitude: -4.8824,
    viewport: { lowLat: 36.46, lowLng: -4.98, highLat: 36.56, highLng: -4.79 },
  },
];

/**
 * Venues. The classifications are the point of each row:
 *
 *   Biblos           `lodging` — the ordinary case.
 *   Before Sunset    `bar` — a beach club Google does **not** call a beach, so
 *                    a lodging-only or beach-only default would lose it (§4).
 *   Ilıca Plajı      `natural_feature`/`beach` — a named public beach, in
 *                    Çeşme's box rather than Alaçatı's.
 *   Biblos Marbella  the same brand, another country. Never a local answer.
 */
export const GOOGLE_VENUES: FakeGooglePlace[] = [
  {
    placeId: 'gp-venue-biblos',
    name: 'Biblos Resort Alaçatı',
    detail: 'Alaçatı, Çeşme/İzmir',
    types: ['lodging', 'resort_hotel', 'establishment'],
    countryCode: 'TR',
    latitude: 38.2712,
    longitude: 26.3688,
  },
  {
    placeId: 'gp-venue-before-sunset',
    name: 'Before Sunset Beach',
    detail: 'Alaçatı, Çeşme/İzmir',
    types: ['bar', 'restaurant', 'establishment'],
    countryCode: 'TR',
    latitude: 38.2661,
    longitude: 26.3799,
  },
  {
    placeId: 'gp-venue-alacati-marina',
    name: 'Alaçatı Marina Hotel',
    detail: 'Alaçatı, Çeşme/İzmir',
    types: ['lodging', 'hotel', 'establishment'],
    countryCode: 'TR',
    latitude: 38.2769,
    longitude: 26.3651,
  },
  {
    placeId: 'gp-venue-ilica',
    name: 'Ilıca Plajı',
    detail: 'Ilıca, Çeşme/İzmir',
    types: ['beach', 'natural_feature', 'tourist_attraction'],
    countryCode: 'TR',
    latitude: 38.3057,
    longitude: 26.3611,
  },
  {
    placeId: 'gp-venue-biblos-marbella',
    name: 'Biblos Resort',
    detail: 'Marbella, Málaga, İspanya',
    types: ['lodging', 'resort_hotel', 'establishment'],
    countryCode: 'ES',
    latitude: 36.5183,
    longitude: -4.8901,
  },
];

/**
 * What each chip asks Google for. `all` is null on purpose and is the value
 * the default mode uses (§4) — the brief's hard rule is that the default
 * carries no type restriction.
 */
export const FAKE_VENUE_TYPES: Record<string, string[] | null> = {
  all: null,
  stay: ['lodging', 'hotel', 'resort_hotel', 'hostel', 'bed_and_breakfast'],
};

/** Case- and accent-tolerant enough for a fixture: fold and collapse. */
export function foldForMatch(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchesQuery(place: FakeGooglePlace, query: string): boolean {
  const needle = foldForMatch(query);
  if (needle.length === 0) return false;
  return foldForMatch(`${place.name} ${place.detail ?? ''}`).includes(needle);
}

export function insideViewport(
  place: FakeGooglePlace,
  box: { lowLat: number; lowLng: number; highLat: number; highLng: number },
): boolean {
  return (
    place.latitude >= box.lowLat &&
    place.latitude <= box.highLat &&
    place.longitude >= box.lowLng &&
    place.longitude <= box.highLng
  );
}
