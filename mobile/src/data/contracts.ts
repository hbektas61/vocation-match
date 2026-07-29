/**
 * The typed boundary between the app and the backend.
 *
 * Everything the app can ask the server for is declared here. Two
 * implementations satisfy it:
 *   - `fakeApi`     — in-memory, used by tests and by a credential-free run.
 *   - `supabaseApi` — real Supabase project, configured only through env vars.
 *
 * The shape mirrors the SQL contract in `supabase/migrations/`. Deliberate
 * absences (owner decisions): no reservation, document, or identity-proof
 * field; no endpoint ever returns coordinates or a distance in meters.
 */

export type ApiErrorCode =
  | 'UNAUTHENTICATED'
  | 'OTP_INVALID'
  | 'FORBIDDEN'
  | 'SUSPENDED'
  | 'UNDER_AGE'
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  /** The server refused because the action is part of Premium (D-036). */
  | 'PREMIUM_REQUIRED'
  | 'NETWORK'
  | 'UNKNOWN';

export class ApiError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

export interface AuthSession {
  userId: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

/** What the signed-in user may know about themselves. */
export interface OwnProfile {
  id: string;
  displayName: string;
  /** ISO date. Only ever returned to the profile's owner. */
  birthdate: string;
  age: number;
  bio: string | null;
  /**
   * Object path in the private photo bucket, never a URL (decision D-014).
   * A path is not viewable on its own — `getPhotoUrls` exchanges it for a
   * short-lived signed URL, and only if the server agrees the caller may see
   * that person.
   */
  photoPath: string | null;
  /** A short self-chosen list, at most `MAX_INTERESTS`. */
  interests: string[];
  /** Self-described. Required before onboarding can be finished. */
  gender: string | null;
  /** Off by default: answering is required, publishing is not. */
  showGender: boolean;
  /** At most `MAX_ORIENTATIONS`, and optional. */
  orientations: string[];
  showOrientation: boolean;
  /**
   * Who this person wants shown to them. Private: it shapes their own feed and
   * is never returned to anybody else.
   */
  showMe: ShowMe | null;
  /**
   * When the server accepted the profile as finished, or null while it is
   * still a draft. A draft is invisible to everyone but its owner.
   */
  onboardingCompletedAt: number | null;
  /**
   * Whether Premium is active right now (D-036). Derived from a server-owned
   * timestamp the client can read but never write — there is no purchase
   * flow yet, so entitlement is operator-granted. The server enforces every
   * premium rule; this flag only decides what the screens explain.
   */
  isPremium: boolean;
}

/** The three answers discovery understands. */
export type ShowMe = 'WOMEN' | 'MEN' | 'EVERYONE';

/**
 * Note what cannot be written here: a photo. Setting a profile photo is its own
 * call, because the only path the server accepts is one that begins with the
 * caller's own user id and points at an object they just uploaded.
 */
export interface ProfileInput {
  displayName: string;
  /** ISO date, YYYY-MM-DD. */
  birthdate: string;
  bio?: string | null;
  /**
   * Omitted means "leave them as they are", not "clear them". A form that does
   * not ask about interests must not be able to delete them. The same is true
   * of every optional field below — each onboarding step writes only its own
   * answer, so none of them can wipe another's.
   */
  interests?: string[];
  gender?: string;
  showGender?: boolean;
  orientations?: string[];
  showOrientation?: boolean;
  showMe?: ShowMe;
}

/** A hotel as the client may see it. Coordinates are deliberately absent. */
export interface HotelCard {
  id: string;
  name: string;
  city: string;
  country: string;
  address: string | null;
  /**
   * A photograph of this hotel (Commons, via its wikidata claim), or null.
   * Null renders as the drawing — never a stock image of somewhere else.
   */
  photoUrl: string | null;
  /** The credit line the photo's licence requires, shown with the photo. */
  photoAttribution: string | null;
  /**
   * What kind of place (D-041): 'hotel' | 'cafe' | 'restaurant' | 'bar' |
   * 'beach' | 'area', or null when the provider never said. Drives the
   * category chip and icon — never any logic.
   */
  kind: string | null;
}

export interface ActiveHotel {
  hotelId: string;
  /** Epoch milliseconds. */
  activatedAt: number;
}

export interface ActivationResult {
  hotelId: string;
  /** The hotel whose discovery access just closed, if any (D-004). */
  previousHotelId: string | null;
  presenceCleared: boolean;
}

/** Self-declared stay. There is no proof field, by design (D-001). */
export interface UpcomingStay {
  hotelId: string;
  startDate: string;
  endDate: string;
}

/**
 * The answer to one proximity check. Note what is missing: no coordinates and
 * no distance, so this can never become a distance oracle (D-005).
 */
export interface PresenceAnswer {
  withinRange: boolean;
  /** Epoch milliseconds — when this answer stops counting. */
  expiresAt: number;
}

/**
 * One image ready to be stored. The picker's raw asset never reaches this
 * type: it is re-encoded first, which is what drops the EXIF block — a photo
 * taken at the hotel carries the GPS coordinates this product promises never
 * to expose (D-005).
 */
export interface PhotoUpload {
  /** Local file URI of the re-encoded image. */
  uri: string;
  mimeType: string;
}

/** The two hotel rooms plus the free check-in street (D-039). */
export type RoomKey = 'UPCOMING' | 'HERE_NOW' | 'NEARBY';

export type RoomReason =
  | 'ELIGIBLE'
  | 'NO_ACTIVE_HOTEL'
  | 'NO_DECLARATION'
  | 'STAY_ENDED'
  | 'NO_RECENT_CHECK'
  | 'TOO_FAR'
  /** Here Now is a Premium room (D-036) and the caller is not premium. */
  | 'PREMIUM_ONLY';

export interface RoomStatus {
  room: RoomKey;
  eligible: boolean;
  reason: RoomReason;
  /**
   * Epoch milliseconds at which this answer lapses, when it lapses at an
   * instant. Here Now expires 30 minutes after the check; a declared stay ends
   * on a calendar date, so it reports null rather than false precision.
   * The screen uses this to refresh exactly at the boundary (backlog R-003).
   */
  validUntil?: number | null;
}

/**
 * How crowded a room is — told only when the crowd hides the individual
 * (D-032). The threshold exists because "1 person in Here Now" plus a glance
 * around the lobby is identification. The count ignores show_me in both
 * directions (a room's population is a fact about the room, not about who
 * you would swipe on), never includes the caller, and is exact only at five
 * or more. The server owns the rule; this constant lets the fake mirror it,
 * never enforce it.
 */
export const ROOM_COUNT_THRESHOLD = 5;

export interface RoomHeadcount {
  room: RoomKey;
  /**
   * Exact number of other people in the room, or null below the threshold.
   * Null must render as *nothing* — not "a few", not "somebody" — because at
   * one person even "somebody is here" is a presence leak.
   */
  headcount: number | null;
}

/**
 * D-039 — a venue check-in: present tense only. One per user, three hours,
 * venue-anchored (never a coordinate), and readable only by its owner.
 */
/**
 * A place Google answered with (D-052). Never stored: the name lives in the
 * session that drew it, and only the `placeId` is ever written down.
 */
export interface GooglePlaceHit {
  placeId: string;
  name: string;
  /** For ordering the picker. Never shown, and never stored. */
  metres: number | null;
}

export interface ActiveCheckin {
  venueId: string;
  /**
   * Null for a placeless check-in (D-048): the anchor is the caller's own
   * cell, and a cell is a coarse position, so it has no name to carry. The
   * screen says where-you-are in the reader's own language instead.
   */
  venueName: string | null;
  /** The venue's photo and its licence credit, when the catalogue has one. */
  photoUrl: string | null;
  photoAttribution: string | null;
  kind: string | null;
  /**
   * Set when the check-in was labelled from Google (D-052). The name is not
   * here on purpose — resolve it with `resolveGooglePlace` when a screen is
   * about to draw it, and keep the answer in memory only.
   */
  googlePlaceId: string | null;
  /** Epoch milliseconds. */
  expiresAt: number;
}

export interface CheckinAnswer {
  withinRange: boolean;
  /** Epoch milliseconds, present only when the check-in was accepted. */
  expiresAt: number | null;
}

/** What one user may see about another: a card, and nothing more. */
export interface CandidateCard {
  userId: string;
  displayName: string;
  age: number;
  bio: string | null;
  photoPath: string | null;
  /**
   * Every photo, in the owner's order — the owner's 2026-07-26 amendment to
   * D-026: one photo on a card is not believable. `photoPath` stays as the
   * primary for the surfaces that only need one.
   */
  photoPaths: string[];
  interests: string[];
  /** Present only when its owner published it; `null` otherwise. */
  gender: string | null;
  /** Empty unless its owner published them. Never a filter — only ever read. */
  orientations: string[];
  /**
   * D-038: the other person's venue name when they are anchored nearby
   * rather than at the caller's own venue; null on own-venue cards. The one
   * new disclosure the region pool makes — a name, never a distance.
   */
  venueName: string | null;
  sameVenue: boolean;
}

/** Five, matching `profiles_interests_count`. Said out loud in the UI. */
export const MAX_INTERESTS = 5;
/** Three, matching `profiles_orientations_count`. */
export const MAX_ORIENTATIONS = 3;
/** Nine, matching `profile_photos.slot`'s range. */
export const MAX_PHOTOS = 9;

/** One photo in the owner's own ordered set. Slot 1 is what a card shows. */
export interface ProfilePhoto {
  slot: number;
  path: string;
}

export interface VocationApi {
  /* auth */
  /**
   * Sends a one-time SMS code. The same call serves new and returning users,
   * and deliberately does not reveal whether the phone already has an account.
   * Phone numbers cross the auth boundary only; profiles and discovery never
   * expose them.
   */
  requestPhoneOtp(phone: string): Promise<void>;
  /** Verifies the six-digit SMS code and creates/restores the session. */
  verifyPhoneOtp(phone: string, code: string): Promise<AuthSession>;
  signOut(): Promise<void>;
  /** Session restored from device storage, or null when signed out. */
  currentSession(): Promise<AuthSession | null>;
  /**
   * Deletes the signed-in account, irreversibly, and removes the session from
   * this device. Takes no user id: the account is whichever one the session
   * belongs to, so there is nothing for a caller to point somewhere else.
   *
   * Throws on failure, and leaves the caller signed in when it does. It never
   * reports a success it did not get.
   */
  deleteAccount(): Promise<void>;

  /* profile */
  getOwnProfile(): Promise<OwnProfile | null>;
  saveOwnProfile(input: ProfileInput): Promise<OwnProfile>;
  /**
   * Marks the profile finished, once every required answer is present.
   * Idempotent, because a retry after a dropped response must not read as a
   * failure. The client cannot set the flag any other way.
   */
  completeOnboarding(): Promise<OwnProfile>;

  /* photos */
  /**
   * Uploads an image and points the caller's profile at it. Returns the saved
   * profile so the caller never has to guess whether the two halves — the
   * object and the row — ended up agreeing.
   */
  /**
   * The owner's ordered photo set. Never returned for anybody else — a card
   * carries one path, so how many photos somebody has is not collectable.
   */
  /**
   * Push tokens are device credentials: registered after sign-in so a message
   * or an arrival can reach a closed app, re-registered when the language
   * changes (the words are fixed at send time), removed before sign-out.
   */
  registerPushToken(token: string, platform: 'ios' | 'android', locale: string): Promise<void>;
  unregisterPushToken(token: string): Promise<void>;
  getOwnPhotos(): Promise<ProfilePhoto[]>;
  /** Appends at the first free slot. Returns the whole set, ready to redraw. */
  addProfilePhoto(upload: PhotoUpload): Promise<ProfilePhoto[]>;
  removeProfilePhotoAt(slot: number): Promise<ProfilePhoto[]>;
  /** The complete list of the caller's own paths, in the order wanted. */
  reorderProfilePhotos(paths: string[]): Promise<ProfilePhoto[]>;
  /**
   * Exchanges object paths for short-lived signed URLs. A path the caller is
   * not allowed to see is simply absent from the result — that is the same
   * answer as "no photo", which is what keeps it from being an oracle.
   */
  getPhotoUrls(paths: string[]): Promise<Record<string, string>>;

  /* hotel */
  searchHotels(query: string): Promise<HotelCard[]>;
  /**
   * Anywhere a person can actually be, by name (D-051) — a café, a bar, a
   * stadium, a hotel lobby. Deliberately *not* `searchHotels`: the trip tab
   * asks which hotel somebody is staying at and must not answer with the
   * bar next door, which is precisely what one shared search did.
   */
  searchVenues(query: string): Promise<HotelCard[]>;
  /**
   * One hotel, by its id. The store's hydration uses this to resolve the
   * active hotel's card without a search — the id alone is what the server
   * remembers, and every screen needs the name it belongs to.
   */
  getHotelById(hotelId: string): Promise<HotelCard | null>;
  getActiveHotel(): Promise<ActiveHotel | null>;
  setActiveHotel(hotelId: string): Promise<ActivationResult>;

  /* rooms */
  declareUpcomingStay(startDate: string, endDate: string): Promise<UpcomingStay>;
  /**
   * The stay declared at the active hotel, or null. Without this a person can
   * change their dates but never see what they said, which makes "update your
   * stay" a guess.
   */
  getUpcomingStay(): Promise<UpcomingStay | null>;
  /**
   * Withdraws the declared stay, closing the Upcoming room at the active hotel.
   * The counterpart of `clearPresenceCheck`: you can already take back a
   * proximity answer, and taking back a declaration should not be harder.
   */
  withdrawUpcomingStay(): Promise<void>;
  /**
   * Sends one foreground reading for a server-side distance check. The reading
   * is an argument only: the server stores the boolean answer, never the point.
   */
  recordPresenceCheck(latitude: number, longitude: number): Promise<PresenceAnswer>;
  /**
   * Drops the stored presence answer. This is what "stop sharing" means, and
   * what has to happen when someone denies or revokes location permission —
   * otherwise a stale yes keeps a room open after consent is withdrawn.
   */
  clearPresenceCheck(): Promise<void>;
  getRooms(): Promise<RoomStatus[]>;
  /** Thresholded headcounts for the active hotel's rooms (D-032). */
  getRoomCounts(): Promise<RoomHeadcount[]>;

  /* check-ins (D-039) */
  /**
   * The named venues within check-in range of a point, nearest first — what
   * the check-in screen offers instead of a search box. The reading is used
   * and discarded; nothing about the caller is stored.
   */
  nearbyVenues(latitude: number, longitude: number): Promise<HotelCard[]>;
  /**
   * Checks in to a venue after a one-time foreground reading verifies the
   * caller is within 500 m of it. Out of range answers false and stores
   * nothing. Free — no premium involved anywhere in Çevremde.
   */
  recordCheckin(venueId: string, latitude: number, longitude: number): Promise<CheckinAnswer>;
  /**
   * Checks in to wherever the caller is standing, named or not (D-048).
   * Cannot fail for want of a mapped place — the room is the caller's own
   * cell — so this is the answer at a concert in a forest or on a beach
   * nobody has mapped.
   */
  checkinHere(
    latitude: number,
    longitude: number,
    /**
     * A Google Place ID to label the check-in with (D-052). The anchor is
     * still the caller's own cell — the label says *where* somebody is, the
     * cell decides *who is near* them, and the two stay independent.
     */
    googlePlaceId?: string,
  ): Promise<CheckinAnswer>;
  /**
   * The ten nearest places Google knows, for the picker's second list — only
   * ever called when somebody has pressed check-in (D-052). Returns null when
   * the option is unavailable: no key configured, or the month's allowance
   * spent. Null means "do not offer this", never "there is nothing here".
   */
  googlePlacesNearby(latitude: number, longitude: number): Promise<GooglePlaceHit[] | null>;
  /** A Place ID back into a name, for drawing it. Null when unavailable. */
  resolveGooglePlace(placeId: string): Promise<string | null>;
  clearCheckin(): Promise<void>;
  getCheckin(): Promise<ActiveCheckin | null>;

  /* discovery */
  getDiscoveryFeed(room: RoomKey, limit?: number): Promise<CandidateCard[]>;

  /* matching */
  swipe(targetUserId: string, room: RoomKey, direction: SwipeDirection): Promise<SwipeResult>;
  getMatches(): Promise<MatchSummary[]>;
  unmatch(matchId: string): Promise<void>;

  /* chat */
  getMessages(matchId: string, limit?: number): Promise<ChatMessage[]>;
  sendMessage(matchId: string, body: string): Promise<ChatMessage>;
  /** Live updates for one conversation. Returns an unsubscribe function. */
  subscribeToMessages(matchId: string, onMessage: (message: ChatMessage) => void): () => void;

  /* safety */
  blockUser(userId: string): Promise<void>;
  unblockUser(userId: string): Promise<void>;
  getBlockedUsers(): Promise<BlockedUser[]>;
  reportUser(input: ReportInput): Promise<void>;
}

export type SwipeDirection = 'LIKE' | 'PASS';

export interface SwipeResult {
  matched: boolean;
  matchId: string | null;
}

export interface MatchSummary {
  matchId: string;
  otherUserId: string;
  displayName: string;
  age: number;
  photoPath: string | null;
  room: RoomKey;
  createdAt: number;
  /** Set once either side ends the match. History stays readable. */
  unmatchedAt: number | null;
  lastMessageAt: number | null;
  lastMessageBody: string | null;
}

export interface ChatMessage {
  id: string;
  matchId: string;
  senderId: string;
  body: string;
  createdAt: number;
}

export interface BlockedUser {
  userId: string;
  displayName: string;
  blockedAt: number;
}

export type ReportReason =
  | 'HARASSMENT'
  | 'SPAM'
  | 'FAKE_PROFILE'
  | 'UNDERAGE'
  | 'SAFETY'
  | 'OTHER';

export interface ReportInput {
  userId: string;
  reason: ReportReason;
  details?: string;
  /** Reporting blocks the person unless the reporter opts out. */
  alsoBlock?: boolean;
}
