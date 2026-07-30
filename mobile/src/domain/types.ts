/**
 * Core domain types for Vocation Match.
 *
 * Deliberate absences (owner decisions D-001..D-007):
 * - No reservation number, reservation document, passport/ID, or room number.
 * - No raw user coordinates are ever stored on domain state; location reads
 *   are collapsed to a boolean + coarse bucket at the evaluation boundary.
 */

/** UPCOMING and HERE_NOW are the hotel rooms; NEARBY is the free
 * check-in street (D-039). */
/**
 * The rooms the domain layer reasons about.
 *
 * Deliberately the venue rooms only: an event room's eligibility is a question
 * about a provider's schedule and a membership, which is the server's to answer
 * and has no pure-function form here (D-056). The API boundary's `RoomKey` is
 * the wider vocabulary.
 */
export type RoomKey = 'UPCOMING' | 'HERE_NOW' | 'NEARBY';

export interface Hotel {
  id: string;
  name: string;
  city: string;
  country: string;
  /** Public venue coordinates, used only as a distance-computation input. */
  latitude: number;
  longitude: number;
  /** D-041: category for the chip/icon — display only, never logic. */
  kind?: string;
}

export interface Profile {
  id: string;
  displayName: string;
  age: number;
  bio: string;
  interests: string[];
  /**
   * When the server accepted the profile as finished, or null while it is a
   * draft. The navigator reads this rather than "does a row exist", because a
   * row exists from the birthdate step onward.
   */
  onboardingCompletedAt?: number | null;
  /**
   * Object path in the private photo bucket, never a URL (D-014). Undefined on
   * a `Candidate`, whose photo arrives on the card instead.
   */
  photoPath?: string | null;
  /**
   * ISO date, YYYY-MM-DD. Only ever populated for the signed-in user's own
   * profile — the server never returns another user's birthdate, so
   * `Candidate` (which extends `Profile`) leaves this undefined.
   */
  birthdate?: string;
  /**
   * Whether Premium is active (D-036). Only meaningful on the signed-in
   * user's own profile; a `Candidate` leaves it undefined — entitlement is
   * never shown on anyone's card.
   */
  isPremium?: boolean;
}

/** A candidate shown in discovery. Fixture-only in this milestone. */
export interface Candidate extends Profile {
  hotelId: string;
  rooms: RoomKey[];
  /** Self-described, and only on the card when its owner published it. */
  gender: string;
  showGender: boolean;
  orientations: string[];
  showOrientation: boolean;
  /** Fixture flag: this candidate has already liked the current user. */
  likesYou: boolean;
  /**
   * The candidate's declared window when they are in Upcoming (D-035): the
   * fake's feed shows them only when it crosses the caller's own dates,
   * exactly as `discovery_feed` does.
   */
  stay?: { startDate: string; endDate: string };
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
