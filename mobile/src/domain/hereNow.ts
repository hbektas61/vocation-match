import { distanceBucket, haversineMeters } from './location';
import type { HereNowCheck, Hotel } from './types';

export const HERE_NOW_RADIUS_METERS = 500;
/**
 * The worst horizontal accuracy a presence check will accept (D-055a), mirrored
 * from `app.location_accuracy_ceiling()`. A fix vaguer than this cannot show
 * anybody is inside the radius, so it is refused rather than answered — and a
 * device that will not say how good its fix is has not said it is good.
 *
 * The server is the authority. This copy exists so the screen can say the right
 * thing, and so a reading that is going to be refused does not first buy a
 * provider call.
 */
export const LOCATION_ACCURACY_CEILING_METERS = 100;

/** Null when the reading may be used; otherwise why it may not be. */
export function readingProblem(
  accuracyMeters: number | null | undefined,
): 'LOCATION_INACCURATE' | null {
  if (accuracyMeters == null || accuracyMeters <= 0) return 'LOCATION_INACCURATE';
  return accuracyMeters > LOCATION_ACCURACY_CEILING_METERS ? 'LOCATION_INACCURATE' : null;
}
/** A foreground check older than this no longer proves presence. */
export const HERE_NOW_FRESHNESS_MS = 30 * 60 * 1000;

/**
 * One foreground location reading. This value must stay ephemeral: it is
 * consumed here and never written to app state, storage, logs, or analytics
 * (D-005). In this milestone readings are simulated; a real GPS read must
 * flow through this same function.
 */
export interface ForegroundReading {
  latitude: number;
  longitude: number;
  timestamp: number;
}

/**
 * Collapses an ephemeral reading into a stored decision. The returned value
 * intentionally contains no coordinates and no meter distance — only whether
 * the user was within 500 m of the hotel and the coarse bucket.
 */
export function evaluateForegroundCheck(hotel: Hotel, reading: ForegroundReading): HereNowCheck {
  const meters = haversineMeters(
    reading.latitude,
    reading.longitude,
    hotel.latitude,
    hotel.longitude,
  );
  return {
    hotelId: hotel.id,
    checkedAt: reading.timestamp,
    withinRange: meters <= HERE_NOW_RADIUS_METERS,
    bucket: distanceBucket(meters, HERE_NOW_RADIUS_METERS),
  };
}

/**
 * Here Now eligibility (D-002): a recent in-range foreground check for the
 * active hotel is sufficient on its own. It does NOT require an upcoming
 * declaration, a reservation, or any identity proof.
 */
export function isHereNowEligible(
  check: HereNowCheck | null,
  activeHotelId: string | null,
  now: number,
): boolean {
  if (!check || !activeHotelId) return false;
  if (check.hotelId !== activeHotelId) return false;
  if (!check.withinRange) return false;
  if (check.checkedAt > now) return false;
  return now - check.checkedAt <= HERE_NOW_FRESHNESS_MS;
}
