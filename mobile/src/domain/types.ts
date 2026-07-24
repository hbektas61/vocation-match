/**
 * Core domain types for Vocation Match.
 *
 * Deliberate absences (owner decisions D-001..D-007):
 * - No reservation number, reservation document, passport/ID, or room number.
 * - No raw user coordinates are ever stored on domain state; location reads
 *   are collapsed to a boolean + coarse bucket at the evaluation boundary.
 */

export type RoomKey = 'UPCOMING' | 'HERE_NOW';

export interface Hotel {
  id: string;
  name: string;
  city: string;
  country: string;
  /** Public venue coordinates, used only as a distance-computation input. */
  latitude: number;
  longitude: number;
}

export interface Profile {
  id: string;
  displayName: string;
  age: number;
  bio: string;
  interests: string[];
}

/** A candidate shown in discovery. Fixture-only in this milestone. */
export interface Candidate extends Profile {
  hotelId: string;
  rooms: RoomKey[];
  /** Fixture flag: this candidate has already liked the current user. */
  likesYou: boolean;
}

export interface ActiveHotelState {
  activeHotelId: string | null;
  activatedAt: number | null;
}

/** Self-declared future stay. Contains no proof of any kind (D-001). */
export interface UpcomingDeclaration {
  hotelId: string;
  /** ISO date, YYYY-MM-DD, local hotel dates as declared by the user. */
  checkInDate: string;
  checkOutDate: string;
  declaredAt: number;
}

/** Coarse proximity bucket. Exact meters never leave the domain layer. */
export type DistanceBucket = 'NEAR' | 'FAR';

/**
 * Result of one foreground proximity evaluation. Note there are no
 * coordinates and no meter value here — only the decision (D-005).
 */
export interface HereNowCheck {
  hotelId: string;
  checkedAt: number;
  withinRange: boolean;
  bucket: DistanceBucket;
}

export type SwipeDirection = 'LIKE' | 'PASS';

export interface SwipeDecision {
  fromUserId: string;
  toUserId: string;
  hotelId: string;
  room: RoomKey;
  direction: SwipeDirection;
  at: number;
}

export interface Match {
  id: string;
  userIds: [string, string];
  hotelId: string;
  room: RoomKey;
  createdAt: number;
}

export interface Message {
  id: string;
  matchId: string;
  senderId: string;
  text: string;
  at: number;
}

export interface Report {
  reportedUserId: string;
  reason: string;
  at: number;
}
