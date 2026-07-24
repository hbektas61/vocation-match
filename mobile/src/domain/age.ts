/**
 * 18+ rule (owner decision D-008).
 *
 * The client copy of the rule exists to give immediate feedback. The
 * enforcement point is the database trigger `app.enforce_adult_profile`
 * (see supabase/migrations/20260725000200_profiles.sql) — a client that skips
 * this check still cannot create an underage profile.
 */

export const MINIMUM_AGE = 18;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parses YYYY-MM-DD into calendar parts, or null when it is not a real date. */
export function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  if (!ISO_DATE.test(value)) {
    return null;
  }
  const [year, month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  // Round-trip through Date to reject 2026-02-30 and friends.
  const asDate = new Date(Date.UTC(year, month - 1, day));
  if (
    asDate.getUTCFullYear() !== year ||
    asDate.getUTCMonth() !== month - 1 ||
    asDate.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/** Whole years between two ISO dates, or null when either date is invalid. */
export function ageYears(birthdate: string, todayIso: string): number | null {
  const birth = parseIsoDate(birthdate);
  const today = parseIsoDate(todayIso);
  if (!birth || !today) {
    return null;
  }
  let years = today.year - birth.year;
  const hadBirthdayThisYear =
    today.month > birth.month || (today.month === birth.month && today.day >= birth.day);
  if (!hadBirthdayThisYear) {
    years -= 1;
  }
  return years;
}

/** True only when the birthdate is a real date at least 18 years ago. */
export function isAdult(birthdate: string, todayIso: string): boolean {
  const years = ageYears(birthdate, todayIso);
  return years !== null && years >= MINIMUM_AGE;
}
