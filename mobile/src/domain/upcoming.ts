import type { UpcomingDeclaration } from './types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type StayDateValidation =
  | { ok: true }
  | { ok: false; reason: 'INVALID_FORMAT' | 'CHECKOUT_NOT_AFTER_CHECKIN' | 'STAY_ALREADY_ENDED' };

function isRealDate(isoDate: string): boolean {
  if (!ISO_DATE.test(isoDate)) return false;
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === isoDate;
}

/**
 * Upcoming is self-declared (D-001): the only validation is that the dates
 * are coherent. There is deliberately no reservation lookup, no proof, and
 * no requirement that check-in is in the future — a stay that already
 * started but has not ended still counts as a valid declaration.
 */
export function validateStayDates(
  checkInDate: string,
  checkOutDate: string,
  todayIsoDate: string,
): StayDateValidation {
  if (!isRealDate(checkInDate) || !isRealDate(checkOutDate)) {
    return { ok: false, reason: 'INVALID_FORMAT' };
  }
  if (checkOutDate <= checkInDate) {
    return { ok: false, reason: 'CHECKOUT_NOT_AFTER_CHECKIN' };
  }
  if (checkOutDate < todayIsoDate) {
    return { ok: false, reason: 'STAY_ALREADY_ENDED' };
  }
  return { ok: true };
}

/**
 * Eligible for the Upcoming room when a valid self-declaration exists for
 * the currently active hotel and the declared stay has not ended yet.
 */
export function isUpcomingEligible(
  declaration: UpcomingDeclaration | null,
  activeHotelId: string | null,
  todayIsoDate: string,
): boolean {
  if (!declaration || !activeHotelId) return false;
  if (declaration.hotelId !== activeHotelId) return false;
  return validateStayDates(declaration.checkInDate, declaration.checkOutDate, todayIsoDate).ok;
}
