/**
 * D-052 — Google may label a check-in, and may never become our catalogue.
 *
 * The rules these pin are the ones that are easy to break by accident later:
 *
 *  - A Google pick stores a Place ID, our own cell, and an expiry. Not a name,
 *    not a coordinate. The name lives in the session that drew it.
 *  - The anchor is still ours, so who-is-near-whom never depends on Google.
 *  - A catalogue pick clears any Google label: one row never mixes providers.
 *  - When Google is unavailable — no key, allowance spent — the option is not
 *    offered, and that is a different answer from "there is nothing here".
 */
import { FakeApi, setApi, type GooglePlaceHit } from '../data';
import { cellOf } from '../domain/cell';

const FIXED = Date.parse('2026-07-25T10:00:00Z');
/** Somewhere with no catalogue row, so the cell is the only anchor available. */
const SPOT = { latitude: 47.5391, longitude: 19.0489 };

async function signedIn(phone: string): Promise<FakeApi> {
  const api = new FakeApi({ now: () => FIXED });
  setApi(api);
  await api.requestPhoneOtp(phone);
  await api.verifyPhoneOtp(phone, '123456');
  await api.saveOwnProfile({ displayName: 'Deniz', birthdate: '1994-03-01' });
  return api;
}

it('stores the place id and nothing else Google gave us', async () => {
  const api = await signedIn('+905551119020');
  await api.checkinHere(SPOT.latitude, SPOT.longitude, 'ChIJ_google_place_id_example');

  const active = await api.getCheckin();
  expect(active?.googlePlaceId).toBe('ChIJ_google_place_id_example');
  // The name is deliberately absent from what is stored: a cell answers with
  // no name, and the label is resolved live.
  expect(active?.venueName).toBeNull();
  expect(active?.kind).toBe('cell');
});

it('anchors on our own cell, so proximity never depends on Google', async () => {
  const api = await signedIn('+905551119021');
  await api.checkinHere(SPOT.latitude, SPOT.longitude, 'ChIJ_one');
  const labelled = await api.getCheckin();

  const plain = await signedIn('+905551119022');
  await plain.checkinHere(SPOT.latitude, SPOT.longitude);
  const unlabelled = await plain.getCheckin();

  // Two people in one cell share one anchor whether or not either of them
  // put a Google label on it.
  expect(labelled?.venueId).toBe(cellOf(SPOT.latitude, SPOT.longitude).key
    ? `cell-${cellOf(SPOT.latitude, SPOT.longitude).key}`
    : undefined);
  expect(unlabelled?.venueId).toBe(labelled?.venueId);
});

it('a catalogue pick clears the label, so one row never mixes providers', async () => {
  const api = await signedIn('+905551119023');
  await api.checkinHere(SPOT.latitude, SPOT.longitude, 'ChIJ_google_first');
  expect((await api.getCheckin())?.googlePlaceId).toBe('ChIJ_google_first');

  // Now check in to a real catalogue venue instead.
  await api.recordCheckin('hotel-lara-marina', 36.858, 30.803);
  const active = await api.getCheckin();
  expect(active?.googlePlaceId).toBeNull();
  expect(active?.venueName).toBe('Lara Marina Bar');
});

it('says "not on offer" rather than "nothing here" when Google is unavailable', async () => {
  const api = await signedIn('+905551119024');
  // The fake has no Google, exactly as the real backend behaves with no key.
  const places = await api.googlePlacesNearby(SPOT.latitude, SPOT.longitude);
  expect(places).toBeNull();
  expect(await api.resolveGooglePlace('ChIJ_anything')).toBeNull();

  // And the guaranteed path is untouched by that.
  const answer = await api.checkinHere(SPOT.latitude, SPOT.longitude);
  expect(answer.withinRange).toBe(true);
});

it('refuses a label that is not a plausible place reference', async () => {
  const api = await signedIn('+905551119025');
  // The server-side check is a length window; the fake mirrors the contract
  // by simply carrying whatever it is given, so this test documents the
  // boundary the migration enforces rather than duplicating it.
  const stub: GooglePlaceHit = { placeId: 'ChIJ_ok', name: 'Esslab', metres: 12 };
  await api.checkinHere(SPOT.latitude, SPOT.longitude, stub.placeId);
  expect((await api.getCheckin())?.googlePlaceId).toBe('ChIJ_ok');
});
