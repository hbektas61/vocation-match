import type { DistanceBucket } from './types';

const EARTH_RADIUS_METERS = 6_371_000;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Great-circle distance in meters between two coordinates (haversine).
 * The meter value is an internal intermediate: callers inside the domain
 * layer collapse it to a boolean/bucket before it reaches app state or UI.
 */
export function haversineMeters(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const deltaLatitude = toRadians(latitudeB - latitudeA);
  const deltaLongitude = toRadians(longitudeB - longitudeA);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(toRadians(latitudeA)) *
      Math.cos(toRadians(latitudeB)) *
      Math.sin(deltaLongitude / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
}

export function distanceBucket(meters: number, radiusMeters: number): DistanceBucket {
  return meters <= radiusMeters ? 'NEAR' : 'FAR';
}
