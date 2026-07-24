/**
 * Single wall-clock source for the app layer. Domain functions stay pure and
 * receive `now` as an argument; components read the clock only through this
 * module so the read is centralized and replaceable (e.g. server-adjusted
 * time in the backend milestone).
 */
export function nowMs(): number {
  return Date.now();
}
