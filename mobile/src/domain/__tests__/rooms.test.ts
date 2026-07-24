import { evaluateForegroundCheck } from '../hereNow';
import { eligibleRooms, isRoomEligible } from '../rooms';
import type { Hotel, UpcomingDeclaration } from '../types';

const TODAY = '2026-07-25';
const NOW = 1_000_000;

const HOTEL: Hotel = {
  id: 'hotel-a',
  name: 'Hotel A',
  city: 'Antalya',
  country: 'Türkiye',
  latitude: 36.8531,
  longitude: 30.7995,
};

const declaration: UpcomingDeclaration = {
  hotelId: 'hotel-a',
  checkInDate: '2026-08-01',
  checkOutDate: '2026-08-08',
  declaredAt: NOW,
};

const freshCheck = evaluateForegroundCheck(HOTEL, {
  latitude: HOTEL.latitude,
  longitude: HOTEL.longitude,
  timestamp: NOW,
});

function input(overrides: Partial<Parameters<typeof eligibleRooms>[0]> = {}) {
  return {
    activeHotelId: 'hotel-a',
    upcoming: null,
    hereNow: null,
    now: NOW,
    todayIsoDate: TODAY,
    ...overrides,
  };
}

describe('room eligibility', () => {
  it('opens Upcoming with a declaration alone — no location needed', () => {
    const rooms = eligibleRooms(input({ upcoming: declaration }));
    expect(rooms).toEqual(['UPCOMING']);
  });

  it('opens Here Now with proximity alone — no declaration needed', () => {
    const rooms = eligibleRooms(input({ hereNow: freshCheck }));
    expect(rooms).toEqual(['HERE_NOW']);
  });

  it('opens both rooms independently', () => {
    const rooms = eligibleRooms(input({ upcoming: declaration, hereNow: freshCheck }));
    expect(rooms).toEqual(['UPCOMING', 'HERE_NOW']);
  });

  it('opens nothing without evidence or without an active hotel', () => {
    expect(eligibleRooms(input())).toEqual([]);
    expect(
      eligibleRooms(input({ activeHotelId: null, upcoming: declaration, hereNow: freshCheck })),
    ).toEqual([]);
  });

  it('isRoomEligible matches eligibleRooms per room', () => {
    const both = input({ upcoming: declaration, hereNow: freshCheck });
    expect(isRoomEligible('UPCOMING', both)).toBe(true);
    expect(isRoomEligible('HERE_NOW', both)).toBe(true);
  });
});
