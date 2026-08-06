/**
 * The regression the owner saw in Forum İstanbul:
 *
 * - a live café was missing,
 * - a nearby restaurant was labelled as a hotel by a stale catalogue row,
 * - and typing in the box searched the whole world.
 *
 * The foreground reading now produces one bounded list. Google live content
 * leads it, the open catalogue is a fallback, and the text field only filters
 * those rows.
 */
import { act, fireEvent, screen } from '@testing-library/react-native';

import {
  FakeApi,
  setApi,
  type GooglePlaceAnswer,
  type HotelCard,
} from '../data';
import { onboard } from '../testSupport/onboarding';
import { press } from '../testSupport/interact';

const FIXED = Date.parse('2026-07-25T10:00:00Z');

class LiveNearbyApi extends FakeApi {
  worldSearches = 0;

  override async nearbyVenues(): Promise<HotelCard[]> {
    return [
      {
        id: 'stale-lunchbox',
        provider: 'osm',
        name: 'Lunchbox',
        city: 'İstanbul',
        country: 'TR',
        address: 'Forum İstanbul',
        photoUrl: null,
        photoAttribution: null,
        kind: 'hotel',
      },
    ];
  }

  override async googleNearbyPlaces(): Promise<GooglePlaceAnswer> {
    return {
      sessionId: 'nearby-session',
      duplicate: false,
      places: [
        {
          selectionToken: 'esslab-token',
          name: 'Esslab',
          detail: 'Forum İstanbul, Bayrampaşa',
          kind: 'cafe',
        },
        {
          selectionToken: 'lunchbox-token',
          name: 'Lunchbox',
          detail: 'Forum İstanbul, Bayrampaşa',
          kind: 'restaurant',
        },
      ],
    };
  }

  override async searchVenues(): Promise<HotelCard[]> {
    this.worldSearches += 1;
    return [
      {
        id: 'global-esslab',
        provider: 'osm',
        name: 'Esslab London',
        city: 'London',
        country: 'GB',
        address: null,
        photoUrl: null,
        photoAttribution: null,
        kind: 'cafe',
      },
    ];
  }
}

describe('the location-bound nearby list', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_USE_FAKE_API = 'true';
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_USE_FAKE_API;
  });

  it('shows live places first, fixes the category, and never runs a global text search', async () => {
    const api = new LiveNearbyApi({ now: () => FIXED });
    setApi(api);
    await onboard('Deniz', '+905551119090');
    await press(await screen.findByTestId('tab-Nearby'));
    await press(await screen.findByTestId('checkin-simulate-shore'));

    expect(await screen.findByText('Esslab')).toBeTruthy();
    // The live restaurant replaces the same-named stale "hotel" catalogue row.
    // D-060 took the capitals off: the kind is a word somebody reads, not an
    // index entry. The address stays in the row's accessible label, so that is
    // where it is asserted.
    expect(screen.getAllByText('Lunchbox')).toHaveLength(1);
    expect(screen.getByText('Restaurant')).toBeTruthy();
    expect(screen.queryByText('Hotel')).toBeNull();
    expect(screen.getAllByLabelText(/Forum İstanbul, Bayrampaşa/)).toHaveLength(2);

    await act(async () => {
      fireEvent.changeText(screen.getByTestId('checkin-search'), 'esslab');
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    expect(screen.getByText('Esslab')).toBeTruthy();
    expect(screen.queryByText('Esslab London')).toBeNull();
    expect(api.worldSearches).toBe(0);
  });
});
