import { isHereNowEligible } from './hereNow';
import { isUpcomingEligible } from './upcoming';
import type { HereNowCheck, RoomKey, UpcomingDeclaration } from './types';

export interface RoomEligibilityInput {
  activeHotelId: string | null;
  upcoming: UpcomingDeclaration | null;
  hereNow: HereNowCheck | null;
  now: number;
  todayIsoDate: string;
}

/**
 * Room access rules. The two rooms are independent: proximity alone opens
 * Here Now (no upcoming declaration required), and a self-declared stay
 * alone opens Upcoming (no location required).
 */
export function isRoomEligible(room: RoomKey, input: RoomEligibilityInput): boolean {
  if (room === 'UPCOMING') {
    return isUpcomingEligible(input.upcoming, input.activeHotelId, input.todayIsoDate);
  }
  return isHereNowEligible(input.hereNow, input.activeHotelId, input.now);
}

export function eligibleRooms(input: RoomEligibilityInput): RoomKey[] {
  const rooms: RoomKey[] = [];
  if (isRoomEligible('UPCOMING', input)) rooms.push('UPCOMING');
  if (isRoomEligible('HERE_NOW', input)) rooms.push('HERE_NOW');
  return rooms;
}
