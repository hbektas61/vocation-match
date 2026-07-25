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
  | 'FORBIDDEN'
  | 'SUSPENDED'
  | 'UNDER_AGE'
  | 'EMAIL_NOT_CONFIRMED'
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
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

/**
 * The two things a sign-up can legitimately produce.
 *
 * A project that confirms email addresses — which every real one must — answers
 * a successful sign-up with a user and *no session*. Treating that as a failure
 * is a hard error on the happy path, which is what the client used to do. The
 * shape is a union so a caller cannot forget the second case.
 */
export type SignUpResult =
  | { status: 'SIGNED_IN'; session: AuthSession }
  | { status: 'CONFIRMATION_REQUIRED'; email: string };

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
}

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
}

/** A hotel as the client may see it. Coordinates are deliberately absent. */
export interface HotelCard {
  id: string;
  name: string;
  city: string;
  country: string;
  address: string | null;
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

export type RoomKey = 'UPCOMING' | 'HERE_NOW';

export type RoomReason =
  | 'ELIGIBLE'
  | 'NO_ACTIVE_HOTEL'
  | 'NO_DECLARATION'
  | 'STAY_ENDED'
  | 'NO_RECENT_CHECK'
  | 'TOO_FAR';

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

/** What one user may see about another: a card, and nothing more. */
export interface CandidateCard {
  userId: string;
  displayName: string;
  age: number;
  bio: string | null;
  photoPath: string | null;
}

export interface VocationApi {
  /* auth */
  /**
   * Creates an account. Returns a session only if the project is configured
   * not to confirm addresses; otherwise the caller has to wait for the link.
   */
  signUp(email: string, password: string): Promise<SignUpResult>;
  /** Raises `EMAIL_NOT_CONFIRMED` when the address has not been confirmed yet. */
  signIn(email: string, password: string): Promise<AuthSession>;
  /** Sends the confirmation link again. Safe to call for an unknown address. */
  resendConfirmationEmail(email: string): Promise<void>;
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

  /* photos */
  /**
   * Uploads an image and points the caller's profile at it. Returns the saved
   * profile so the caller never has to guess whether the two halves — the
   * object and the row — ended up agreeing.
   */
  uploadProfilePhoto(upload: PhotoUpload): Promise<OwnProfile>;
  /** Clears the profile photo and removes the object. */
  removeProfilePhoto(): Promise<OwnProfile>;
  /**
   * Exchanges object paths for short-lived signed URLs. A path the caller is
   * not allowed to see is simply absent from the result — that is the same
   * answer as "no photo", which is what keeps it from being an oracle.
   */
  getPhotoUrls(paths: string[]): Promise<Record<string, string>>;

  /* hotel */
  searchHotels(query: string): Promise<HotelCard[]>;
  getActiveHotel(): Promise<ActiveHotel | null>;
  setActiveHotel(hotelId: string): Promise<ActivationResult>;

  /* rooms */
  declareUpcomingStay(startDate: string, endDate: string): Promise<UpcomingStay>;
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
