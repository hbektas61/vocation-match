import {
  evaluateForegroundCheck,
  HERE_NOW_FRESHNESS_MS,
  HERE_NOW_RADIUS_METERS,
  isHereNowEligible,
} from '../hereNow';
import { haversineMeters } from '../location';
import type { Hotel } from '../types';

const HOTEL: Hotel = {
  id: 'hotel-a',
  name: 'Hotel A',
  city: 'Antalya',
  country: 'Türkiye',
  latitude: 36.8531,
  longitude: 30.7995,
};

// ~0.001° latitude ≈ 111 m; ~0.01° ≈ 1.1 km.
const NEARBY = { latitude: HOTEL.latitude + 0.001, longitude: HOTEL.longitude };
const FAR = { latitude: HOTEL.latitude + 0.05, longitude: HOTEL.longitude };

describe('haversineMeters', () => {
  it('is zero at the same point and grows with latitude offset', () => {
    expect(haversineMeters(HOTEL.latitude, HOTEL.longitude, HOTEL.latitude, HOTEL.longitude)).toBe(0);
    const meters = haversineMeters(HOTEL.latitude, HOTEL.longitude, NEARBY.latitude, NEARBY.longitude);
    expect(meters).toBeGreaterThan(100);
    expect(meters).toBeLessThan(125);
  });
});

describe('evaluateForegroundCheck', () => {
  it('marks a reading within 500 m as in range without exposing coordinates', () => {
    const check = evaluateForegroundCheck(HOTEL, { ...NEARBY, timestamp: 5000 });
    expect(check).toEqual({
      hotelId: 'hotel-a',
      checkedAt: 5000,
      withinRange: true,
      bucket: 'NEAR',
    });
    // D-005 guard: the stored decision must not carry location data.
    expect(Object.keys(check).sort()).toEqual(['bucket', 'checkedAt', 'hotelId', 'withinRange']);
  });

  it('marks a distant reading as out of range', () => {
    const check = evaluateForegroundCheck(HOTEL, { ...FAR, timestamp: 5000 });
    expect(check.withinRange).toBe(false);
    expect(check.bucket).toBe('FAR');
  });

  it('uses the 500 m product radius', () => {
    expect(HERE_NOW_RADIUS_METERS).toBe(500);
  });
});

describe('isHereNowEligible', () => {
  const inRange = evaluateForegroundCheck(HOTEL, { ...NEARBY, timestamp: 100_000 });

  it('accepts a fresh in-range check for the active hotel', () => {
    expect(isHereNowEligible(inRange, 'hotel-a', 100_000 + 60_000)).toBe(true);
  });

  it('rejects when there is no check or no active hotel', () => {
    expect(isHereNowEligible(null, 'hotel-a', 200_000)).toBe(false);
    expect(isHereNowEligible(inRange, null, 200_000)).toBe(false);
  });

  it('rejects a check for a different hotel', () => {
    expect(isHereNowEligible(inRange, 'hotel-b', 200_000)).toBe(false);
  });

  it('rejects an out-of-range check', () => {
    const far = evaluateForegroundCheck(HOTEL, { ...FAR, timestamp: 100_000 });
    expect(isHereNowEligible(far, 'hotel-a', 100_000 + 60_000)).toBe(false);
  });

  it('expires after the freshness window and rejects future timestamps', () => {
    expect(isHereNowEligible(inRange, 'hotel-a', 100_000 + HERE_NOW_FRESHNESS_MS)).toBe(true);
    expect(isHereNowEligible(inRange, 'hotel-a', 100_000 + HERE_NOW_FRESHNESS_MS + 1)).toBe(false);
    expect(isHereNowEligible(inRange, 'hotel-a', 99_999)).toBe(false);
  });
});
