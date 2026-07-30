/**
 * A deterministic stand-in for Ticketmaster Discovery (D-056 §16).
 *
 * The brief is explicit that the suite must not depend on live event ranking,
 * availability or a real key. The cases below are the ones the rules are
 * actually about: two events sharing a name in different cities, two different
 * events at one venue, a provider test fixture that must never be shown, a
 * cancelled event, and an event whose date the provider has not settled.
 *
 * Music and festivals are over-represented on purpose — they are what the
 * initial slice prioritises (§4) — but nothing here is category-specific.
 */

export interface FakeEvent {
  id: string;
  name: string;
  /** ISO instant, or null for a date-only event. */
  startsAt: string | null;
  endsAt: string | null;
  localDate: string;
  localTime: string | null;
  dateTbd: boolean;
  status: string;
  classification: string;
  venueId: string;
  venueName: string;
  city: string;
  countryCode: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  imageUrl: string | null;
  /** Ticketmaster marks its own fixtures; they are never events (§16.5). */
  test?: boolean;
}

/** The clock the fixtures are written around, so "today" is deterministic. */
export const FAKE_EVENTS_NOW = Date.parse('2026-08-12T09:00:00Z');

const day = (offsetDays: number, hour = 20, minute = 0): string => {
  const at = new Date(FAKE_EVENTS_NOW);
  at.setUTCDate(at.getUTCDate() + offsetDays);
  at.setUTCHours(hour, minute, 0, 0);
  return at.toISOString();
};

const localDayOf = (iso: string): string => iso.slice(0, 10);

export const FAKE_EVENTS: FakeEvent[] = [
  // --- İstanbul, today ------------------------------------------------------
  {
    // Running right now at the fixture clock: the live-window case.
    id: 'tm-ist-festival-today',
    name: 'Bosphorus Sunset Festival',
    startsAt: day(0, 8),
    endsAt: day(0, 9),
    localDate: localDayOf(day(0, 8)),
    localTime: '11:00:00',
    dateTbd: false,
    status: 'onsale',
    classification: 'Music',
    venueId: 'tm-venue-kucukciftlik',
    venueName: 'Küçükçiftlik Park',
    city: 'İstanbul',
    countryCode: 'TR',
    country: 'Türkiye',
    latitude: 41.0435,
    longitude: 28.9976,
    imageUrl: 'https://example.test/ist-festival.jpg',
  },
  {
    // Same venue, different event: §16.17's case. These two must never mix.
    id: 'tm-ist-jazz-today',
    name: 'Küçükçiftlik Jazz Night',
    startsAt: day(0, 8, 30),
    endsAt: day(0, 12),
    localDate: localDayOf(day(0, 8)),
    localTime: '11:30:00',
    dateTbd: false,
    status: 'onsale',
    classification: 'Music',
    venueId: 'tm-venue-kucukciftlik',
    venueName: 'Küçükçiftlik Park',
    city: 'İstanbul',
    countryCode: 'TR',
    country: 'Türkiye',
    latitude: 41.0435,
    longitude: 28.9976,
    imageUrl: null,
  },
  {
    // §16.22: over, and past its grace period, at the fixture clock.
    id: 'tm-ist-finished',
    name: 'Morning Session',
    startsAt: day(0, 3),
    endsAt: day(0, 5),
    localDate: localDayOf(day(0, 3)),
    localTime: '06:00:00',
    dateTbd: false,
    status: 'onsale',
    classification: 'Music',
    venueId: 'tm-venue-kucukciftlik',
    venueName: 'Küçükçiftlik Park',
    city: 'İstanbul',
    countryCode: 'TR',
    country: 'Türkiye',
    latitude: 41.0435,
    longitude: 28.9976,
    imageUrl: null,
  },
  {
    // §16.28: still inside its grace period but ending sooner than the
    // three-hour TTL, so the verification expiry is clamped by the window.
    id: 'tm-ist-closing',
    name: 'Closing Set',
    startsAt: day(0, 6),
    endsAt: day(0, 7),
    localDate: localDayOf(day(0, 6)),
    localTime: '09:00:00',
    dateTbd: false,
    status: 'onsale',
    classification: 'Music',
    venueId: 'tm-venue-kucukciftlik',
    venueName: 'Küçükçiftlik Park',
    city: 'İstanbul',
    countryCode: 'TR',
    country: 'Türkiye',
    latitude: 41.0435,
    longitude: 28.9976,
    imageUrl: null,
  },
  // --- İstanbul, ahead ------------------------------------------------------
  {
    id: 'tm-ist-arena-30',
    name: 'Volkswagen Arena Live',
    startsAt: day(30),
    endsAt: day(30, 23),
    localDate: localDayOf(day(30)),
    localTime: '23:00:00',
    dateTbd: false,
    status: 'onsale',
    classification: 'Music',
    venueId: 'tm-venue-vw-arena',
    venueName: 'Volkswagen Arena',
    city: 'İstanbul',
    countryCode: 'TR',
    country: 'Türkiye',
    latitude: 41.1085,
    longitude: 29.0106,
    imageUrl: null,
  },
  {
    // §16.4: the same name in another city, with its own provider id.
    id: 'tm-izm-sunset-45',
    name: 'Bosphorus Sunset Festival',
    startsAt: day(45),
    endsAt: null,
    localDate: localDayOf(day(45)),
    localTime: '20:00:00',
    dateTbd: false,
    status: 'onsale',
    classification: 'Music',
    venueId: 'tm-venue-alacati',
    venueName: 'Alaçatı Açıkhava',
    city: 'İzmir',
    countryCode: 'TR',
    country: 'Türkiye',
    latitude: 38.2712,
    longitude: 26.3688,
    imageUrl: null,
  },
  {
    // §16.20: a date the provider has not settled. UPCOMING yes, live no.
    id: 'tm-ist-tbd',
    name: 'Announcement Pending Show',
    startsAt: null,
    endsAt: null,
    localDate: localDayOf(day(60)),
    localTime: null,
    dateTbd: true,
    status: 'onsale',
    classification: 'Music',
    venueId: 'tm-venue-vw-arena',
    venueName: 'Volkswagen Arena',
    city: 'İstanbul',
    countryCode: 'TR',
    country: 'Türkiye',
    latitude: 41.1085,
    longitude: 29.0106,
    imageUrl: null,
  },
  {
    // §16.6 and §17-E: joins close, everything app-owned survives.
    id: 'tm-ist-cancelled',
    name: 'Cancelled Open Air',
    startsAt: day(14),
    endsAt: null,
    localDate: localDayOf(day(14)),
    localTime: '20:00:00',
    dateTbd: false,
    status: 'cancelled',
    classification: 'Music',
    venueId: 'tm-venue-kucukciftlik',
    venueName: 'Küçükçiftlik Park',
    city: 'İstanbul',
    countryCode: 'TR',
    country: 'Türkiye',
    latitude: 41.0435,
    longitude: 28.9976,
    imageUrl: null,
  },
  {
    // §16.26: the provider knows the event and not where it is.
    // Live at the fixture clock on purpose: the window has to be *open* for
    // the missing-venue refusal to be the one that fires, since an event that
    // has not started is refused for that reason first.
    id: 'tm-ist-nowhere',
    name: 'Venue To Be Announced',
    startsAt: day(0, 8, 15),
    endsAt: day(0, 11),
    localDate: localDayOf(day(0, 8)),
    localTime: '11:15:00',
    dateTbd: false,
    status: 'onsale',
    classification: 'Music',
    venueId: 'tm-venue-unknown',
    venueName: 'TBA',
    city: 'İstanbul',
    countryCode: 'TR',
    country: 'Türkiye',
    latitude: null,
    longitude: null,
    imageUrl: null,
  },
  {
    // §16.5: never shown, never selectable, never a room.
    id: 'tm-test-fixture',
    name: 'Ticketmaster Test Event',
    startsAt: day(2),
    endsAt: null,
    localDate: localDayOf(day(2)),
    localTime: '20:00:00',
    dateTbd: false,
    status: 'onsale',
    classification: 'Music',
    venueId: 'tm-venue-kucukciftlik',
    venueName: 'Küçükçiftlik Park',
    city: 'İstanbul',
    countryCode: 'TR',
    country: 'Türkiye',
    latitude: 41.0435,
    longitude: 28.9976,
    imageUrl: null,
    test: true,
  },
  // --- other markets, for the coverage scenarios ---------------------------
  {
    id: 'tm-ldn-arena-20',
    name: 'The O2 Arena Night',
    startsAt: day(20),
    endsAt: null,
    localDate: localDayOf(day(20)),
    localTime: '19:30:00',
    dateTbd: false,
    status: 'onsale',
    classification: 'Music',
    venueId: 'tm-venue-o2',
    venueName: 'The O2',
    city: 'London',
    countryCode: 'GB',
    country: 'United Kingdom',
    latitude: 51.503,
    longitude: 0.0032,
    imageUrl: null,
  },
  {
    id: 'tm-lv-sphere-10',
    name: 'Sphere Residency',
    startsAt: day(10),
    endsAt: null,
    localDate: localDayOf(day(10)),
    localTime: '20:00:00',
    dateTbd: false,
    status: 'onsale',
    classification: 'Music',
    venueId: 'tm-venue-sphere',
    venueName: 'Sphere',
    city: 'Las Vegas',
    countryCode: 'US',
    country: 'United States',
    latitude: 36.1174,
    longitude: -115.1622,
    imageUrl: null,
  },
  {
    id: 'tm-ist-derby-25',
    name: 'İstanbul Derby',
    startsAt: day(25),
    endsAt: null,
    localDate: localDayOf(day(25)),
    localTime: '19:00:00',
    dateTbd: false,
    status: 'onsale',
    classification: 'Sports',
    venueId: 'tm-venue-stadium',
    venueName: 'Şükrü Saracoğlu',
    city: 'İstanbul',
    countryCode: 'TR',
    country: 'Türkiye',
    latitude: 40.9878,
    longitude: 29.0369,
    imageUrl: null,
  },
];

/** Which chip admits which provider classification (§4). */
export const FAKE_CLASSIFICATION: Record<string, string | null> = {
  all: null,
  music: 'Music',
  sports: 'Sports',
  arts: 'Arts & Theatre',
};

export function eventById(id: string): FakeEvent | undefined {
  return FAKE_EVENTS.find((event) => event.id === id);
}
