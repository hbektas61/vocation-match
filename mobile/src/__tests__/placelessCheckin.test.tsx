/**
 * D-048 — the room is geometry, so "yakınımda" always has an answer.
 *
 * The owner's case: a concert on a wooded island in Budapest, 150,000 people,
 * and nothing anybody has mapped. Before this, the check-in was a required
 * reference to a catalogue row, so a place no provider knew meant no room and
 * no feature. These tests pin the guarantee from both ends — the coordinate
 * has no venue, and the check-in works anyway — and pin the thing that makes
 * it safe: a cell never tells anybody where it is.
 */
import { act, fireEvent, screen } from '@testing-library/react-native';

import { COPY } from '../copy';
import { cellOf } from '../domain/cell';
import { ApiError, FakeApi, setApi, type HotelCard } from '../data';
import { onboard } from '../testSupport/onboarding';

const FIXED = Date.parse('2026-07-25T10:00:00Z');
/** Hajógyári-sziget, mid-island: trees, a festival, and no catalogue row. */
const ISLAND = { latitude: 47.5391, longitude: 19.0489 };

class FailingNearbyApi extends FakeApi {
  override async nearbyVenues(
    _latitude: number,
    _longitude: number,
  ): Promise<HotelCard[]> {
    throw new ApiError('NETWORK', 'The venue sweep did not answer.');
  }
}

describe('the cell grid', () => {
  it('agrees with itself: every point in a cell resolves to the same cell', () => {
    const a = cellOf(ISLAND.latitude, ISLAND.longitude);
    // ~40 m north-east, comfortably inside a 200 m square.
    const b = cellOf(ISLAND.latitude + 0.0003, ISLAND.longitude + 0.0004);
    expect(b.key).toBe(a.key);
    expect(b.latitude).toBeCloseTo(a.latitude, 10);
  });

  it('separates places that are genuinely apart', () => {
    const island = cellOf(ISLAND.latitude, ISLAND.longitude);
    const cesme = cellOf(38.3222, 26.3021);
    expect(cesme.key).not.toBe(island.key);
  });

  it('works where the grid is degenerate, rather than dividing by zero', () => {
    const pole = cellOf(89.9, 15);
    expect(Number.isFinite(pole.latitude)).toBe(true);
    expect(Number.isFinite(pole.longitude)).toBe(true);
  });
});

describe('checking in where nothing is mapped', () => {
  beforeEach(() => {
    setApi(new FakeApi({ now: () => FIXED }));
  });

  it('opens a room on an island with no venue in the catalogue', async () => {
    const api = new FakeApi({ now: () => FIXED });
    setApi(api);
    await api.requestPhoneOtp('+905551119001');
    await api.verifyPhoneOtp('+905551119001', '123456');
    await api.saveOwnProfile({ displayName: 'Deniz', birthdate: '1994-03-01' });

    // The premise: the map knows nothing here.
    const offered = await api.nearbyVenues(ISLAND.latitude, ISLAND.longitude);
    expect(offered).toEqual([]);

    // The guarantee: the check-in still happens.
    const answer = await api.checkinHere(ISLAND.latitude, ISLAND.longitude);
    expect(answer.withinRange).toBe(true);
    expect(answer.expiresAt).toBe(FIXED + 3 * 60 * 60 * 1000);

    const active = await api.getCheckin();
    expect(active).not.toBeNull();
    expect(active?.kind).toBe('cell');
    // The safety half: a cell is a coarse position, so it has no name to
    // carry — the screen says where-you-are in the reader's own language.
    expect(active?.venueName).toBeNull();
  });

  it('refuses a reading that is not a reading, rather than inventing a cell', async () => {
    const api = new FakeApi({ now: () => FIXED });
    setApi(api);
    await api.requestPhoneOtp('+905551119002');
    await api.verifyPhoneOtp('+905551119002', '123456');
    await api.saveOwnProfile({ displayName: 'Deniz', birthdate: '1994-03-01' });

    await expect(api.checkinHere(Number.NaN, 19)).rejects.toThrow();
    await expect(api.checkinHere(120, 19)).rejects.toThrow();
    expect(await api.getCheckin()).toBeNull();
  });

  it('two people standing together share one anchor', async () => {
    const api = new FakeApi({ now: () => FIXED });
    setApi(api);

    await api.requestPhoneOtp('+905551119003');
    await api.verifyPhoneOtp('+905551119003', '123456');
    await api.saveOwnProfile({ displayName: 'Ada', birthdate: '1994-03-01' });
    await api.checkinHere(ISLAND.latitude, ISLAND.longitude);
    const first = await api.getCheckin();

    await api.requestPhoneOtp('+905551119004');
    await api.verifyPhoneOtp('+905551119004', '123456');
    await api.saveOwnProfile({ displayName: 'Bora', birthdate: '1994-03-01' });
    // A few metres away — the same cell, therefore the same anchor.
    await api.checkinHere(ISLAND.latitude + 0.0002, ISLAND.longitude + 0.0002);
    const second = await api.getCheckin();

    expect(second?.venueId).toBe(first?.venueId);
  });
});

describe('the screen offers the here-anchor beside the list, not only under an empty one', () => {
  it('keeps "I am here" reachable when the list is full but wrong', async () => {
    // The preview simulator stands in for a device reading, and it is only
    // drawn in fake mode — which is exactly what this test is running in.
    process.env.EXPO_PUBLIC_USE_FAKE_API = 'true';
    setApi(new FakeApi({ now: () => FIXED }));
    await onboard('Deniz', '+905551119005');

    await act(async () => {
      fireEvent.press(await screen.findByTestId('tab-Nearby'));
    });
    // The fake's own simulator stands in for a device reading.
    await act(async () => {
      fireEvent.press(await screen.findByTestId('checkin-simulate-shore'));
    });

    // The premise of the owner's Espressolab report: the list has places in
    // it, and the one you are standing in is not among them.
    const rows = await screen.findByTestId('checkin-venue-hotel-lara-shore');
    expect(rows).toBeTruthy();

    // The escape hatch is present anyway — that is the whole point.
    const here = await screen.findByTestId('checkin-here');
    await act(async () => {
      fireEvent.press(here);
    });

    // And the room it opens says where-you-are rather than a positional key.
    expect(await screen.findByText(COPY.checkin.hereLabel)).toBeTruthy();
    delete process.env.EXPO_PUBLIC_USE_FAKE_API;
  });

  it('keeps "I am here" reachable when the venue sweep fails', async () => {
    process.env.EXPO_PUBLIC_USE_FAKE_API = 'true';
    setApi(new FailingNearbyApi({ now: () => FIXED }));

    try {
      await onboard('Deniz', '+905551119006');

      await act(async () => {
        fireEvent.press(await screen.findByTestId('tab-Nearby'));
      });
      await act(async () => {
        fireEvent.press(await screen.findByTestId('checkin-simulate-shore'));
      });

      // A provider outage is reported honestly, but it cannot take the
      // geometry-backed room away.
      expect(await screen.findByText(COPY.errors.network)).toBeTruthy();
      const here = await screen.findByTestId('checkin-here');

      await act(async () => {
        fireEvent.press(here);
      });

      expect(await screen.findByText(COPY.checkin.hereLabel)).toBeTruthy();
    } finally {
      delete process.env.EXPO_PUBLIC_USE_FAKE_API;
    }
  });
});
