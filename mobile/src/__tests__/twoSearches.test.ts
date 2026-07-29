/**
 * D-051 — the trip tab and Çevremde do not ask the same question.
 *
 * One shared search over one table meant the *hotel* tab answered "sorgun" on
 * staging with Sorgun Beach Club and Sorgun Sahil Bar and no hotel at all. The owner
 * predicted this before the numbers showed it ("algoritma bozulacak"), and it
 * only got louder as the catalogue grew. These pin both halves: lodging is
 * the only answer to "where am I staying", and "what is this place" may
 * answer with anywhere a person can be.
 */
import { FakeApi } from '../data';

const FIXED = Date.parse('2026-07-25T10:00:00Z');

async function signedIn(): Promise<FakeApi> {
  const api = new FakeApi({ now: () => FIXED });
  await api.requestPhoneOtp('+905551119010');
  await api.verifyPhoneOtp('+905551119010', '123456');
  await api.saveOwnProfile({ displayName: 'Deniz', birthdate: '1994-03-01' });
  return api;
}

it('the trip tab is offered lodging and nothing else', async () => {
  const api = await signedIn();
  const results = await api.searchHotels('lara');
  // The fixtures carry Lara Marina Bar and Lara Dunes Club beside Lara
  // Shore Resort, so this query is exactly the ambiguous kind.
  expect(results.length).toBeGreaterThan(0);
  expect(results.every((place) => (place.kind ?? 'hotel') === 'hotel')).toBe(true);
});

it('Çevremde may answer with the bar you are actually sitting in', async () => {
  const api = await signedIn();
  const venues = await api.searchVenues('lara');
  expect(venues.some((place) => place.kind === 'bar')).toBe(true);
});

it('and the two answers are not the same set', async () => {
  const api = await signedIn();
  const lodging = await api.searchHotels('lara');
  const anywhere = await api.searchVenues('lara');
  expect(anywhere.length).toBeGreaterThan(lodging.length);
});
