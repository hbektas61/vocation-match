import type { RoomStatus } from '../data';

/**
 * The soonest future `RoomStatus.validUntil` across a set of rooms, or
 * `null` when nothing carries an expiry (Upcoming never does — a stay ends
 * on a calendar date, and a to-the-second timer there would be false
 * precision; see `RoomStatus.validUntil`).
 *
 * Screens use this to schedule one refresh at the boundary (R-003) instead
 * of polling, so a room the server would already refuse stops looking open
 * the moment it lapses rather than at the next navigation.
 */
export function earliestRoomExpiry(rooms: RoomStatus[], now: number): number | null {
  const upcoming = rooms
    .map((room) => room.validUntil)
    .filter((validUntil): validUntil is number => typeof validUntil === 'number' && validUntil > now);
  return upcoming.length === 0 ? null : Math.min(...upcoming);
}
