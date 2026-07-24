/**
 * Single wall-clock source for the app layer. Domain functions stay pure and
 * receive `now` as an argument; components read the clock only through this
 * module so the read is centralized and replaceable (e.g. server-adjusted
 * time in the backend milestone).
 */
export function nowMs(): number {
  return Date.now();
}

/** Local calendar date as YYYY-MM-DD for stay-date validation. */
export function todayIsoDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** The local calendar date containing the given epoch-milliseconds instant. */
export function isoDateFromMs(ms: number): string {
  return todayIsoDate(new Date(ms));
}
