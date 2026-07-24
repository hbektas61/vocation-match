import { isUpcomingEligible, validateStayDates } from '../upcoming';
import type { UpcomingDeclaration } from '../types';

const TODAY = '2026-07-25';

describe('validateStayDates', () => {
  it('accepts a coherent future stay', () => {
    expect(validateStayDates('2026-08-01', '2026-08-08', TODAY)).toEqual({ ok: true });
  });

  it('accepts a stay that already started but has not ended', () => {
    expect(validateStayDates('2026-07-20', '2026-07-28', TODAY)).toEqual({ ok: true });
  });

  it('rejects malformed or impossible dates', () => {
    expect(validateStayDates('01-08-2026', '2026-08-08', TODAY)).toEqual({
      ok: false,
      reason: 'INVALID_FORMAT',
    });
    expect(validateStayDates('2026-02-30', '2026-03-02', TODAY)).toEqual({
      ok: false,
      reason: 'INVALID_FORMAT',
    });
  });

  it('rejects check-out on or before check-in', () => {
    expect(validateStayDates('2026-08-08', '2026-08-08', TODAY)).toEqual({
      ok: false,
      reason: 'CHECKOUT_NOT_AFTER_CHECKIN',
    });
    expect(validateStayDates('2026-08-08', '2026-08-01', TODAY)).toEqual({
      ok: false,
      reason: 'CHECKOUT_NOT_AFTER_CHECKIN',
    });
  });

  it('rejects a stay that already ended', () => {
    expect(validateStayDates('2026-07-01', '2026-07-10', TODAY)).toEqual({
      ok: false,
      reason: 'STAY_ALREADY_ENDED',
    });
  });
});

describe('isUpcomingEligible', () => {
  const declaration: UpcomingDeclaration = {
    hotelId: 'hotel-a',
    checkInDate: '2026-08-01',
    checkOutDate: '2026-08-08',
    declaredAt: 1000,
  };

  it('is eligible for the active hotel with a valid stay', () => {
    expect(isUpcomingEligible(declaration, 'hotel-a', TODAY)).toBe(true);
  });

  it('is not eligible without a declaration or active hotel', () => {
    expect(isUpcomingEligible(null, 'hotel-a', TODAY)).toBe(false);
    expect(isUpcomingEligible(declaration, null, TODAY)).toBe(false);
  });

  it('is not eligible when the declaration is for another hotel', () => {
    expect(isUpcomingEligible(declaration, 'hotel-b', TODAY)).toBe(false);
  });

  it('expires once the declared stay has ended', () => {
    expect(isUpcomingEligible(declaration, 'hotel-a', '2026-08-09')).toBe(false);
  });
});
