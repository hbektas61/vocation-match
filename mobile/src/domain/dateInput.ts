/**
 * `DD/MM/YYYY` on the way in and on the way out, ISO everywhere else.
 *
 * This is presentation only. `age.ts` still owns what a real date is and what
 * counts as eighteen, and the API and the database still only ever see
 * `YYYY-MM-DD` — the one form that sorts, compares and stores correctly.
 *
 * Nothing here constructs a `Date` from local time. A birthdate is a calendar
 * fact, not an instant: `new Date('1994-03-01')` is midnight UTC, and printing
 * that back anywhere west of Greenwich gives the 28th of February. Every
 * conversion below is string arithmetic for exactly that reason.
 */
import { isAdult, parseIsoDate } from './age';

const DIGITS = 8;

/** Just the digits somebody typed or pasted, capped at a date's worth. */
export function toDateDigits(input: string): string {
  return input.replace(/\D/g, '').slice(0, DIGITS);
}

/**
 * The digits with their separators, added as they are earned.
 *
 * The slashes appear *after* the segment they follow rather than before the
 * one they precede, so backspacing never leaves a trailing `/` that has to be
 * deleted twice.
 */
export function formatDateInput(digits: string): string {
  const d = toDateDigits(digits);
  const day = d.slice(0, 2);
  const month = d.slice(2, 4);
  const year = d.slice(4, 8);
  return [day, month, year].filter(Boolean).join('/');
}

/** `01/03/1994` and friends back to digits, for resuming a half-typed answer. */
export function dateDigitsFromIso(iso: string): string {
  const parsed = parseIsoDate(iso);
  if (!parsed) return '';
  const pad = (n: number, width: number) => String(n).padStart(width, '0');
  return `${pad(parsed.day, 2)}${pad(parsed.month, 2)}${pad(parsed.year, 4)}`;
}

/** The stored form, or `null` while the answer is not yet a real date. */
export function isoFromDateDigits(digits: string): string | null {
  const d = toDateDigits(digits);
  if (d.length < DIGITS) return null;
  const iso = `${d.slice(4, 8)}-${d.slice(2, 4)}-${d.slice(0, 2)}`;
  // `parseIsoDate` is what rejects the 30th of February and the 13th month,
  // so the calendar rule lives in one place rather than two.
  return parseIsoDate(iso) ? iso : null;
}

export type DateProblem = 'EMPTY' | 'INCOMPLETE' | 'INVALID' | 'FUTURE' | 'UNDERAGE';

/**
 * Why a date is not usable yet, or `null` when it is.
 *
 * Ordered so each answer is actionable: a half-typed date is not called
 * invalid, an impossible date is not called underage, and a date in the future
 * is named as such rather than reported as being less than eighteen years ago
 * — which is true, and useless.
 */
export function dateProblem(digits: string, todayIso: string): DateProblem | null {
  const d = toDateDigits(digits);
  if (d.length === 0) return 'EMPTY';
  if (d.length < DIGITS) return 'INCOMPLETE';

  const iso = isoFromDateDigits(d);
  if (!iso) return 'INVALID';
  // String comparison, because both sides are zero-padded ISO dates and this
  // cannot drift by a day the way a timezone conversion can.
  if (iso > todayIso) return 'FUTURE';
  if (!isAdult(iso, todayIso)) return 'UNDERAGE';
  return null;
}
