/**
 * D-056 §16 — the event rooms, against a deterministic Ticketmaster.
 *
 * The numbering below is the brief's own. Where a rule is genuinely a property
 * of the database rather than of the client — the unique constraint, the RLS,
 * the room-mixing guarantees — it is asserted in `supabase/tests/024_events.sql`
 * instead, and said so here rather than faked.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ApiError, FakeApi, setApi, type EventArea, type EventCard } from '../data';
import { FAKE_EVENTS_NOW } from '../fixtures/events';

const ISTANBUL: EventArea = { kind: 'city', city: 'İstanbul', label: 'İstanbul' };
const IZMIR: EventArea = { kind: 'city', city: 'İzmir', label: 'İzmir' };

let fake: FakeApi;

async function signIn(phone: string, name = 'Deniz'): Promise<string> {
  await fake.requestPhoneOtp(phone);
  const session = await fake.verifyPhoneOtp(phone, '123456');
  await fake.saveOwnProfile({ displayName: name, birthdate: '1994-03-01' });
  return session.userId;
}

/** The events a search returned, or an explicit failure if it did not. */
async function search(area: EventArea, bucket: 'today' | 'upcoming' = 'upcoming'): Promise<EventCard[]> {
  const result = await fake.searchEvents(area, bucket, 'all');
  if (result.kind !== 'ok') throw new Error(`search was ${result.kind}`);
  return result.events;
}

beforeEach(async () => {
  fake = new FakeApi({ now: () => FAKE_EVENTS_NOW });
  setApi(fake);
  await signIn('+905551119200');
});

/* ------------------------------------------------------ §16.1–§16.9 search */

describe('finding events', () => {
  it('shows only today, in the local day, under Bugün', async () => {
    const today = await search(ISTANBUL, 'today');

    // Everything on the fixture's local day, in start order — and nothing
    // from tomorrow, however soon tomorrow feels.
    expect(today.map((event) => event.name)).toEqual([
      'Morning Session',
      'Closing Set',
      'Bosphorus Sunset Festival',
      'Venue To Be Announced',
      'Küçükçiftlik Jazz Night',
    ]);
    expect(today.some((event) => event.name === 'Volkswagen Arena Live')).toBe(false);
  });

  it('sorts Yaklaşan by start, ascending', async () => {
    const upcoming = await search(ISTANBUL);
    const starts = upcoming.map((event) => event.startsAt).filter(Boolean) as string[];

    expect([...starts].sort()).toEqual(starts);
  });

  it('shows concerts and festivals', async () => {
    const upcoming = await search(ISTANBUL);
    expect(upcoming.some((event) => event.classification === 'Music')).toBe(true);
    expect(upcoming.some((event) => event.name === 'Bosphorus Sunset Festival')).toBe(true);
  });

  it('keeps same-named events in different cities apart', async () => {
    const [istanbul, izmir] = [await search(ISTANBUL), await search(IZMIR)];
    const named = 'Bosphorus Sunset Festival';

    expect(istanbul.some((event) => event.name === named)).toBe(true);
    expect(izmir.some((event) => event.name === named)).toBe(true);
    // §16.4: they share a name and nothing else. Joining one is not joining
    // the other, which is asserted below where identity is decided.
    expect(izmir.find((event) => event.name === named)?.city).toBe('İzmir');
  });

  it('never shows a provider test event', async () => {
    const all = [...(await search(ISTANBUL)), ...(await search(ISTANBUL, 'today'))];
    expect(all.some((event) => event.name === 'Ticketmaster Test Event')).toBe(false);
  });

  it('refuses to build a room around a cancelled event', async () => {
    const cancelled = (await search(ISTANBUL)).find((event) => event.status === 'cancelled')!;
    expect(cancelled).toBeTruthy();

    await expect(fake.joinEventUpcoming(cancelled.selectionToken)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('separates the cache by area, bucket and chip', async () => {
    // §16.34: four different questions, four upstream requests — and then
    // none at all when they are asked again.
    const before = fake.providerRequestCount();
    await fake.searchEvents(ISTANBUL, 'today', 'all');
    await fake.searchEvents(ISTANBUL, 'upcoming', 'all');
    await fake.searchEvents(ISTANBUL, 'upcoming', 'music');
    await fake.searchEvents(IZMIR, 'upcoming', 'all');
    expect(fake.providerRequestCount() - before).toBe(4);

    await fake.searchEvents(ISTANBUL, 'today', 'all');
    await fake.searchEvents(IZMIR, 'upcoming', 'all');
    expect(fake.providerRequestCount() - before).toBe(4);
  });

  it('answers a repeated identical search without asking again', async () => {
    // §16.33. Coalescing proper is a server property — one *in-flight*
    // request per key — and is asserted in the SQL suite; this is the half
    // the client can see.
    await search(ISTANBUL);
    const after = fake.providerRequestCount();

    await search(ISTANBUL);

    expect(fake.providerRequestCount()).toBe(after);
  });

  it('never carries the provider key anywhere the client can reach', () => {
    // §16.9. The key lives in an edge-function secret; nothing in the bundle
    // names it, and the one file that may use it is not shipped to a device.
    // §16.9. The client names the *edge function* it calls, which it must —
    // what it may never carry is the key, the secret's name, or the provider's
    // host. Those live in the one file that never ships to a device.
    const bundled = readFileSync(join(__dirname, '../data/supabaseApi.ts'), 'utf8');
    expect(bundled).not.toContain('TICKETMASTER_DISCOVERY_API_KEY');
    expect(bundled).not.toContain('app.ticketmaster.com');
    expect(bundled).not.toMatch(/apikey\s*[:=]/i);
    expect(process.env.TICKETMASTER_DISCOVERY_API_KEY).toBeUndefined();

    // And the function that does hold it asks the platform for it rather than
    // carrying one.
    const edge = readFileSync(
      join(__dirname, '../../../supabase/functions/events-ticketmaster/index.ts'), 'utf8');
    expect(edge).toContain('Deno.env.get("TICKETMASTER_DISCOVERY_API_KEY")');
    expect(edge).not.toMatch(/apikey["']?\s*[:=]\s*["'][A-Za-z0-9]{8,}/);
  });
});

/* ------------------------------------------------- §16.10–§16.15 identity */

describe('the event behind a room', () => {
  it('sends two people who picked the same event into the same subject', async () => {
    const first = (await search(ISTANBUL)).find((event) => event.name === 'Volkswagen Arena Live')!;
    const mineA = await fake.joinEventUpcoming(first.selectionToken);

    await signIn('+905551119201', 'Ece');
    const second = (await search(ISTANBUL)).find((event) => event.name === 'Volkswagen Arena Live')!;
    const mineB = await fake.joinEventUpcoming(second.selectionToken);

    expect(mineB.eventId).toBe(mineA.eventId);
  });

  it('keeps two same-named events with different ids apart', async () => {
    const istanbul = (await search(ISTANBUL))
      .find((event) => event.name === 'Bosphorus Sunset Festival');
    const izmir = (await search(IZMIR))
      .find((event) => event.name === 'Bosphorus Sunset Festival')!;

    const joined = await fake.joinEventUpcoming(izmir.selectionToken);
    expect(joined.providerEventId).toBe('tm-izm-sunset-45');
    expect(istanbul).toBeTruthy();
  });

  it('refuses an invented, replayed or someone else’s selection', async () => {
    const event = (await search(ISTANBUL))[0];

    await expect(fake.joinEventUpcoming('evsel-invented')).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });

    await fake.joinEventUpcoming(event.selectionToken);
    // Single use: the same token again is not a second join.
    await expect(fake.joinEventUpcoming(event.selectionToken)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });

    const mine = (await search(IZMIR))[0];
    await signIn('+905551119202', 'Ece');
    await expect(fake.joinEventUpcoming(mine.selectionToken)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });

  it('does not touch the active vacation venue', async () => {
    // §16.13 — the coupling this feature must never import.
    await fake.setActiveHotel('hotel-lara-shore');
    const before = await fake.getActiveHotel();

    const event = (await search(ISTANBUL))[0];
    await fake.joinEventUpcoming(event.selectionToken);

    expect(await fake.getActiveHotel()).toEqual(before);
  });

  it('lets several future events coexist', async () => {
    const upcoming = await search(ISTANBUL);
    await fake.joinEventUpcoming(upcoming[0].selectionToken);
    await fake.joinEventUpcoming(upcoming[1].selectionToken);

    const mine = await fake.getMyEvents();
    expect(mine).toHaveLength(2);
    expect(new Set(mine.map((row) => row.eventId)).size).toBe(2);
  });

  it('deletes nothing when the visible deck changes', async () => {
    const upcoming = await search(ISTANBUL);
    const a = await fake.joinEventUpcoming(upcoming[0].selectionToken);
    const b = await fake.joinEventUpcoming(upcoming[1].selectionToken);

    await fake.setEventFocus(a.eventId, 'EVENT_UPCOMING');
    const mine = await fake.getMyEvents();

    expect(mine).toHaveLength(2);
    expect(mine.find((row) => row.eventId === a.eventId)?.focused).toBe(true);
    expect(mine.find((row) => row.eventId === b.eventId)?.upcomingOpen).toBe(true);
  });
});

/* -------------------------------------------- §16.16–§16.20 room contents */

describe('who is in an event room', () => {
  it('contains only people who declared for the same event', async () => {
    const arena = (await search(ISTANBUL)).find((e) => e.name === 'Volkswagen Arena Live')!;
    const joined = await fake.joinEventUpcoming(arena.selectionToken);

    await signIn('+905551119210', 'Ece');
    const sameArena = (await search(ISTANBUL)).find((e) => e.name === 'Volkswagen Arena Live')!;
    await fake.joinEventUpcoming(sameArena.selectionToken);

    await signIn('+905551119211', 'Nil');
    // A different event at the *same venue* — §16.17's case exactly.
    const jazz = (await search(ISTANBUL, 'today'))
      .find((e) => e.name === 'Küçükçiftlik Jazz Night')!;
    await fake.joinEventUpcoming(jazz.selectionToken);

    await signIn('+905551119200');
    await fake.setEventFocus(joined.eventId, 'EVENT_UPCOMING');
    const deck = await fake.getDiscoveryFeed('EVENT_UPCOMING');

    expect(deck.map((card) => card.displayName)).toEqual(['Ece']);
  });

  it('lets nobody from the hotel or the street leak in', async () => {
    // §16.19. The fixture candidates are all anchored at venues; none of them
    // has an event membership, so none of them can appear.
    const event = (await search(ISTANBUL))[0];
    const joined = await fake.joinEventUpcoming(event.selectionToken);
    await fake.setActiveHotel('hotel-lara-shore');

    await fake.setEventFocus(joined.eventId, 'EVENT_UPCOMING');
    expect(await fake.getDiscoveryFeed('EVENT_UPCOMING')).toEqual([]);
  });

  it('refuses a deck for an event the caller has not joined', async () => {
    await expect(fake.getDiscoveryFeed('EVENT_UPCOMING')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('gives a date-only event Yaklaşan but not the live room', async () => {
    // §16.20 and §8.2: the window we would have to invent is the window we do
    // not have.
    const tbd = (await search(ISTANBUL)).find((event) => event.dateTbd)!;
    const joined = await fake.joinEventUpcoming(tbd.selectionToken);

    expect(joined.upcomingOpen).toBe(true);
    expect(joined.liveOpensAt).toBeNull();
    expect((await fake.verifyEventPresence(joined.eventId, 41.1085, 29.0106, 10)).outcome)
      .toBe('EVENT_TIME_UNCONFIRMED');
  });
});

/* ----------------------------------------------- §16.21–§16.29 the live room */

describe('being at the event', () => {
  /** The festival that starts this evening — the only live-window fixture. */
  async function atTheFestival() {
    const festival = (await search(ISTANBUL, 'today'))
      .find((event) => event.name === 'Bosphorus Sunset Festival')!;
    return fake.joinEventUpcoming(festival.selectionToken);
  }

  it('refuses before the window opens', async () => {
    const arena = (await search(ISTANBUL)).find((e) => e.name === 'Volkswagen Arena Live')!;
    const joined = await fake.joinEventUpcoming(arena.selectionToken);

    expect((await fake.verifyEventPresence(joined.eventId, 41.1085, 29.0106, 10)).outcome)
      .toBe('EVENT_NOT_STARTED');
  });

  it('refuses after it closes', async () => {
    // §16.22: an event whose grace period has already run out.
    const finished = (await search(ISTANBUL, 'today'))
      .find((event) => event.name === 'Morning Session')!;
    const joined = await fake.joinEventUpcoming(finished.selectionToken);

    expect((await fake.verifyEventPresence(joined.eventId, 41.0435, 28.9976, 10)).outcome)
      .toBe('EVENT_FINISHED');
  });

  it('succeeds inside 500 m with a good fix', async () => {
    const joined = await atTheFestival();
    const answer = await fake.verifyEventPresence(joined.eventId, 41.0435, 28.9976, 12);

    expect(answer.outcome).toBe('IN_RANGE');
    expect(answer.withinRange).toBe(true);
  });

  it('fails outside 500 m', async () => {
    const joined = await atTheFestival();
    const answer = await fake.verifyEventPresence(joined.eventId, 41.0935, 28.9976, 12);

    expect(answer.outcome).toBe('TOO_FAR');
  });

  it.each([
    ['a vague fix', 900],
    ['a device that will not say', null],
  ])('refuses %s (D-055a, shared)', async (_label, accuracy) => {
    const joined = await atTheFestival();
    const answer = await fake.verifyEventPresence(
      joined.eventId, 41.0435, 28.9976, accuracy as number | null,
    );

    expect(answer.outcome).toBe('LOCATION_INACCURATE');
    expect(answer.expiresAt).toBeNull();
  });

  it('fails safely when the provider publishes no venue location', async () => {
    // §16.26 and §9: no guessing, no city centre, and Yaklaşan stays open.
    const nowhere = (await search(ISTANBUL)).find((e) => e.name === 'Venue To Be Announced')!;
    const joined = await fake.joinEventUpcoming(nowhere.selectionToken);

    expect(joined.upcomingOpen).toBe(true);
    expect((await fake.verifyEventPresence(joined.eventId, 41.0435, 28.9976, 10)).outcome)
      .toBe('EVENT_LOCATION_UNAVAILABLE');
  });

  it('answers with a decision, never a coordinate or a distance', async () => {
    const joined = await atTheFestival();
    const answer = await fake.verifyEventPresence(joined.eventId, 41.0435, 28.9976, 12);

    expect(Object.keys(answer).sort()).toEqual(['expiresAt', 'outcome', 'withinRange']);
  });

  it('expires at the earlier of the TTL and the window’s end', async () => {
    // §16.28. "Closing Set" is inside its grace period but ends sooner than
    // three hours from now, so the window is what decides — a check must not
    // leave somebody "at the event" after the event.
    const closing = (await search(ISTANBUL, 'today'))
      .find((event) => event.name === 'Closing Set')!;
    const joined = await fake.joinEventUpcoming(closing.selectionToken);
    const answer = await fake.verifyEventPresence(joined.eventId, 41.0435, 28.9976, 12);

    expect(answer.outcome).toBe('IN_RANGE');
    expect(answer.expiresAt).toBe(joined.liveClosesAt);
    expect(answer.expiresAt!).toBeLessThan(FAKE_EVENTS_NOW + 3 * 60 * 60 * 1000);
  });

  it('leaves the hotel and the street alone when a second event opens', async () => {
    // §16.29 — the one-at-a-time rule is about *events*.
    await fake.setActiveHotel('hotel-lara-shore');
    const hotelBefore = await fake.getActiveHotel();
    const joined = await atTheFestival();
    await fake.verifyEventPresence(joined.eventId, 41.0435, 28.9976, 12);

    const jazz = (await search(ISTANBUL, 'today'))
      .find((e) => e.name === 'Küçükçiftlik Jazz Night')!;
    const second = await fake.joinEventUpcoming(jazz.selectionToken);
    await fake.verifyEventPresence(second.eventId, 41.0435, 28.9976, 12);

    const mine = await fake.getMyEvents();
    expect(mine.find((row) => row.eventId === second.eventId)?.hereNowOpen).toBe(true);
    // The first event's live answer is gone; the hotel's is untouched.
    expect(mine.find((row) => row.eventId === joined.eventId)?.hereNowOpen).toBe(false);
    expect(await fake.getActiveHotel()).toEqual(hotelBefore);
  });
});

/* --------------------------------- §16.30–§16.42 status, failure and access */

describe('when things go wrong', () => {
  it('closes new joins on a cancelled event and keeps what exists', async () => {
    const good = (await search(ISTANBUL)).find((e) => e.name === 'Volkswagen Arena Live')!;
    const joined = await fake.joinEventUpcoming(good.selectionToken);
    const cancelled = (await search(ISTANBUL)).find((e) => e.status === 'cancelled')!;

    await expect(fake.joinEventUpcoming(cancelled.selectionToken)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    // The room that already existed is exactly as it was.
    expect((await fake.getMyEvents()).map((row) => row.eventId)).toEqual([joined.eventId]);
  });

  it('keeps existing rooms working when the provider is cut off', async () => {
    // §16.37 and §17-D: the kill switch stops discovery and nothing else.
    const event = (await search(ISTANBUL))[0];
    const joined = await fake.joinEventUpcoming(event.selectionToken);

    fake.setFeatureFlag('TICKETMASTER_PROVIDER_ENABLED', false);

    expect((await fake.searchEvents(IZMIR, 'upcoming', 'all')).kind).toBe('unavailable');
    expect((await fake.getMyEvents()).map((row) => row.eventId)).toEqual([joined.eventId]);
    expect(await fake.getDiscoveryFeed('EVENT_UPCOMING')).toEqual([]);
  });

  it('refuses at the daily ceiling before the upstream call', async () => {
    fake.setProviderCeiling(0);
    const before = fake.providerRequestCount();

    expect((await fake.searchEvents(IZMIR, 'upcoming', 'all')).kind).toBe('ceiling');
    expect(fake.providerRequestCount()).toBe(before);
  });

  it('draws no tab at all when the feature is off', async () => {
    fake.setFeatureFlag('EVENTS_FEATURE_ENABLED', false);
    expect((await fake.searchEvents(ISTANBUL, 'upcoming', 'all')).kind).toBe('disabled');
    expect((await fake.getFeatureFlags()).EVENTS_FEATURE_ENABLED).toBe(false);
  });

  it('enforces access through a server-side capability', async () => {
    // §16.40. The client is told; the server decides. Flipping the capability
    // closes the door with no UI change anywhere.
    fake.setEventCapability('can_join_event_upcoming', false);
    const event = (await search(ISTANBUL))[0];

    await expect(fake.joinEventUpcoming(event.selectionToken)).rejects.toMatchObject({
      code: 'PREMIUM_REQUIRED',
    });
    expect((await fake.getEventCapabilities()).can_join_event_upcoming).toBe(false);
  });

  it('spends no entitlement on a failed provider operation', async () => {
    // §16.41: a search we could not make costs the user nothing, and neither
    // does a location check that could not settle anything.
    const event = (await search(ISTANBUL))[0];
    const joined = await fake.joinEventUpcoming(event.selectionToken);
    const capabilities = await fake.getEventCapabilities();

    fake.setProviderCeiling(0);
    await fake.searchEvents(IZMIR, 'upcoming', 'all');
    await fake.verifyEventPresence(joined.eventId, 0, 0, 900);

    expect(await fake.getEventCapabilities()).toEqual(capabilities);
    expect((await fake.getMyEvents()).map((row) => row.eventId)).toEqual([joined.eventId]);
  });

  it('never invents an event from free text', async () => {
    // There is no path from a typed string to a room: the only way in is a
    // token the backend minted from something the provider returned.
    await expect(fake.joinEventUpcoming('Benim Konserim')).rejects.toBeInstanceOf(ApiError);
  });
});
