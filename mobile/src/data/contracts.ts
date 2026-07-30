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
  /**
   * The venue search has no destination behind it any more — the session
   * lapsed (D-054). Its own code because the repair is a step back, not a
   * retry: nothing the user types will work until a destination is chosen.
   */
  | 'DESTINATION_REQUIRED'
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
  /**
   * Which feed this row came from: 'osm', 'overture', 'cell', 'manual', or
   * 'google'. A Google venue (D-054) carries the placeholder name below and
   * must have its real one resolved live from its Place ID, so a screen has to
   * be able to tell — that is the whole reason this is on the card.
   */
  provider?: string | null;
  /**
   * The venue's name — except for a Google venue, where it is the `(google)`
   * placeholder, because Google's display name is not ours to store (D-054).
   */
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

/**
 * The caller's own active vacation venue, and which provider stands behind it
 * (D-054). `googlePlaceId` is set only for a Google venue and only for its
 * owner: it is what lets this device resolve the venue's name for a screen it
 * is about to draw, since the name is deliberately not stored.
 */
export interface ActiveVenue {
  hotelId: string;
  provider: string;
  googlePlaceId: string | null;
  kind: string | null;
  /** Epoch milliseconds. */
  activatedAt: number;
}

/**
 * Which venues the optional chips ask Google for (D-054 §3).
 *
 * Two, not three. A `Beach & Club` chip was built and removed on live
 * evidence: restricted to the types the brief lists, a staging search for
 * "Before Sunset" in Alaçatı returned nothing while the unrestricted default
 * returned it first. Google does not classify beach clubs consistently enough
 * for any five-type mask, and a chip that hides what it is named after is
 * worse than no chip.
 */
export type VenueSearchMode = 'all' | 'stay';

/**
 * Our own category for a venue chosen under each chip.
 *
 * Read off the chip, never off Google's `types` — those are Google Content and
 * are neither requested nor stored (D-054 §2). `all` says nothing, because
 * under `Tümü` the product genuinely does not know, and a guessed chip is
 * worse than none (the D-041 rule).
 */
export const GOOGLE_VENUE_KIND: Record<VenueSearchMode, string | null> = {
  all: null,
  stay: 'hotel',
};

/**
 * A destination search session, opened by choosing a prediction in step A.
 * The viewport that scopes step B lives on the server against this id — the
 * client is never told the box, so it cannot widen it.
 */
export interface DestinationChoice {
  sessionId: string;
}

export interface ActivationResult {
  hotelId: string;
  /** The hotel whose discovery access just closed, if any (D-004). */
  previousHotelId: string | null;
  presenceCleared: boolean;
}

/**
 * N-07: this account's Google-backed check-in allowance.
 *
 * Deliberately not called an "advanced search" allowance: the right is spent
 * only on a check-in that completed with a Google label. A search, an empty
 * result, a cancellation, a provider failure and a failed check-in all cost
 * nothing.
 */
export interface CheckinEntitlement {
  /** The ceiling for this account's plan — 3 free, 10 premium (D-053). */
  limit: number;
  /** Completed Google-backed check-ins this UTC month. */
  used: number;
  remaining: number;
  /** Epoch ms of the next UTC month boundary, when the allowance returns. */
  resetsAt: number;
  isPremium: boolean;
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
  /**
   * D-055a. `TOO_FAR` and `LOCATION_INACCURATE` are different facts and the
   * room must not conflate them: one says the person is not here, the other
   * says the device could not tell. A refusal writes nothing at all — no
   * presence answer, no entitlement, no region contribution — so the previous
   * answer, whatever it was, still stands.
   */
  outcome: 'IN_RANGE' | 'TOO_FAR' | 'LOCATION_INACCURATE';
  withinRange: boolean;
  /** Epoch milliseconds — when this answer stops counting. Null on a refusal. */
  expiresAt: number | null;
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

/**
 * Every room the one engine knows (D-039, D-056).
 *
 * The two event rooms are the same vocabulary, not a second system: they swipe,
 * match and chat through exactly the endpoints the hotel rooms use.
 */
export type RoomKey =
  | 'UPCOMING'
  | 'HERE_NOW'
  | 'NEARBY'
  | 'EVENT_UPCOMING'
  | 'EVENT_HERE_NOW';

/** Which event rooms a room key belongs to. */
export const EVENT_ROOMS: RoomKey[] = ['EVENT_UPCOMING', 'EVENT_HERE_NOW'];

/**
 * One event as a search returned it (D-056 §3.1).
 *
 * Everything here except `selectionToken` is Ticketmaster's Event Content on a
 * short lease — it is drawn and forgotten, never written down by the client
 * and never stored beside a room, a match or a message.
 */
export interface EventCard {
  /** Single-use, ours, and the only way to open or join this event. */
  selectionToken: string;
  name: string | null;
  /** ISO instant when the provider gave a confirmed one. */
  startsAt: string | null;
  localDate: string | null;
  localTime: string | null;
  /** The provider has not settled the date or the time yet (§8.2). */
  dateTbd: boolean;
  status: string;
  venueName: string | null;
  city: string | null;
  country: string | null;
  imageUrl: string | null;
  classification: string | null;
}

/** Where the user asked to look. Never derived from a passive GPS read. */
export type EventArea =
  | { kind: 'city'; city: string; countryCode?: string; label: string }
  | { kind: 'here'; latitude: number; longitude: number; label: string };

export type EventBucket = 'today' | 'upcoming';
/** Chips. Configurable server-side; adding one is not a migration (§4). */
export type EventCategory = 'all' | 'music' | 'sports' | 'arts';

/**
 * What a search answered — including all the ways it honestly could not.
 *
 * The refusals are distinct because §3.4 requires them to be: "nothing here"
 * and "we could not ask" and "we have asked too much today" are three
 * different things to say to somebody, and a spinner that means all three is a
 * screen that looks broken in two of them.
 */
export type EventSearchResult =
  | { kind: 'ok'; events: EventCard[]; totalPages: number }
  | { kind: 'empty' }
  | { kind: 'unavailable' }
  | { kind: 'ceiling' }
  | { kind: 'disabled' }
  | { kind: 'offline' };

/** An event this account has declared for. */
export interface MyEvent {
  eventId: string;
  providerEventId: string;
  declaredAt: number;
  /** Whose deck the app is currently drawing. A viewing choice, not a state. */
  focused: boolean;
  upcomingOpen: boolean;
  hereNowOpen: boolean;
  /** Epoch ms, or null when the live answer is not open. */
  hereNowUntil: number | null;
  liveOpensAt: number | null;
  liveClosesAt: number | null;
}

/**
 * The provider's lease on one event, read back for a screen. Absent when it
 * has expired or been taken down — which is what makes the UI say "Geçmiş
 * etkinlik" instead of drawing a name it no longer holds (§10.2).
 */
export interface EventContent {
  eventId: string;
  providerEventId: string;
  name: string | null;
  startsAt: string | null;
  dateTbd: boolean;
  status: string;
  venueName: string | null;
  city: string | null;
  country: string | null;
  imageUrl: string | null;
}

/** The answer to one live-event check (D-056 §9). */
export interface EventPresenceAnswer {
  outcome:
    | 'IN_RANGE'
    | 'TOO_FAR'
    | 'LOCATION_INACCURATE'
    | 'EVENT_NOT_STARTED'
    | 'EVENT_FINISHED'
    | 'EVENT_CANCELLED'
    | 'EVENT_TIME_UNCONFIRMED'
    | 'EVENT_LOCATION_UNAVAILABLE';
  withinRange: boolean;
  expiresAt: number | null;
}

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
/**
 * One Autocomplete prediction (D-053). Note what is *not* here: a Place ID.
 * The client never learns one, so it cannot assert a label it did not receive
 * — `selectionToken` is a single-use reference the backend issued and will
 * validate against the search it actually performed.
 */
export interface GooglePlaceHit {
  selectionToken: string;
  name: string;
  /** The secondary line that tells two branches of a chain apart, if any. */
  detail: string | null;
}

/**
 * What the advanced find answered (D-053).
 *
 * `duplicate` means the same normalized query was already asked in this
 * session, so nothing was requested upstream and nothing metered — the caller
 * keeps the predictions it already holds. That is why no prediction text is
 * ever stored: the previous answer is still on screen.
 */
export interface GooglePlaceAnswer {
  places: GooglePlaceHit[];
  sessionId: string;
  duplicate: boolean;
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
  /**
   * V-011: the Place ID behind a neighbour's Google venue, whose name is not
   * ours to store. Null on own-venue cards and on catalogue venues. The screen
   * resolves at most three distinct ones per deck session and falls back to
   * the generic "nearby" label for the rest — a card never waits on it.
   */
  venuePlaceId: string | null;
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

  /* vacation venue, destination-first (D-054) */
  /**
   * Step A. A city, island, district or resort area — worldwide, and never a
   * business. Null means the step is unavailable (no key, a ceiling, a rate
   * limit, an unwell provider); it never means "no such place".
   */
  searchDestinations(query: string, sessionId?: string): Promise<GooglePlaceAnswer | null>;
  /**
   * Commits step A. Spends the prediction's selection token and opens the
   * venue session scoped to that destination. Null when the choice could not
   * be committed — including when the prediction turned out to be a business
   * rather than a place.
   */
  chooseDestination(selectionToken: string): Promise<DestinationChoice | null>;
  /**
   * Step B. Venues inside the chosen destination only. `mode` is the chip:
   * 'all' sends no type restriction at all, which is what keeps a beach club
   * findable when Google files it under `bar`.
   *
   * Throws `ApiError('DESTINATION_REQUIRED')` when the venue session has
   * lapsed, so the screen can send the user back to step A instead of
   * silently searching the whole planet.
   */
  searchVacationVenues(
    query: string,
    sessionId: string,
    mode: VenueSearchMode,
  ): Promise<GooglePlaceAnswer | null>;
  /**
   * Makes the selected Google place the caller's one active vacation venue.
   * Two people who select the same Place ID reach the same internal venue, and
   * the previous venue's discovery closes immediately (D-003, D-004).
   */
  activateGoogleVenue(selectionToken: string, mode: VenueSearchMode): Promise<ActivationResult>;
  /** The caller's own active venue and its provider (D-054). */
  getActiveVenue(): Promise<ActiveVenue | null>;
  /**
   * V-012: what one deck's labels cost, as three counts and nothing else.
   * The client is the only place that knows them; no Place ID and no name
   * travels with them, and a failure here never reaches the user.
   */
  reportDeckLabels(uniquePlaceIds: number, resolved: number, generic: number): Promise<void>;
  /**
   * The Here Now check for a venue whose coordinate is not ours to keep: the
   * backend resolves it from Google, measures in PostGIS, and forgets it. Same
   * answer shape as `recordPresenceCheck` — a boolean and an expiry, never a
   * coordinate and never a distance.
   */
  verifyPresenceAtVenue(
    latitude: number,
    longitude: number,
    /**
     * The radius the device believes the fix is good to (V-010). It bounds
     * nothing the user sees: it only decides whether this reading is allowed
     * to teach the venue its coarse region cell.
     */
    accuracyMeters?: number | null,
  ): Promise<PresenceAnswer>;

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
  recordPresenceCheck(
    latitude: number,
    longitude: number,
    /**
     * The radius the device believes the fix is good to. Required in practice
     * (D-055a): a reading that will not say how good it is cannot show
     * somebody is inside 500 m, and the server refuses it. The client check is
     * only ever for the wording.
     */
    accuracyMeters?: number | null,
  ): Promise<PresenceAnswer>;
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
     * A selection token from `googlePlaceSearch` (D-053). The anchor is still
     * the caller's own cell — the label says *where* somebody is, the cell
     * decides *who is near* them. The server refuses a token that is unknown,
     * another user's, expired, or already spent.
     */
    selectionToken?: string,
  ): Promise<CheckinAnswer>;
  /**
   * The advanced find (D-053): a name the user has *typed*, biased to where
   * they are, so the right branch of a chain surfaces first. There is no
   * "nearby" call — what is around somebody is our catalogue's question.
   *
   * Returns null when the option is unavailable: no key, the month's service
   * ceiling reached, or this user searching too often. Null means "do not
   * offer this", never "there is nothing by that name".
   */
  googlePlaceSearch(
    query: string,
    latitude: number,
    longitude: number,
    /** Continues an open session so Google bills one, not one per keystroke. */
    sessionId?: string,
  ): Promise<GooglePlaceAnswer | null>;
  /** How many advanced finds are left this month (3 free, 10 premium). */
  googleFindsRemaining(): Promise<number>;
  /**
   * N-07: the whole allowance, from the server that enforces it.
   *
   * The screen shows a ceiling, a spend and a reset instant, and none of the
   * three may be derived on the client — a client that computes the number it
   * is entitled to is a client that can disagree with the server about it.
   */
  googleCheckinEntitlement(): Promise<CheckinEntitlement>;
  /** A Place ID back into a name, for drawing it. Null when unavailable. */
  resolveGooglePlace(placeId: string): Promise<string | null>;
  clearCheckin(): Promise<void>;
  getCheckin(): Promise<ActiveCheckin | null>;

  /* events (D-056) */
  /** Which server-controlled switches are on. The tab is not drawn when off. */
  getFeatureFlags(): Promise<Record<string, boolean>>;
  /** What this account may do in the event rooms — server-authoritative. */
  getEventCapabilities(): Promise<Record<string, boolean>>;
  /**
   * Events for an area the user explicitly chose. Never called because a tab
   * focused, a GPS refreshed, or the app launched (§3.2).
   */
  searchEvents(
    area: EventArea,
    bucket: EventBucket,
    category: EventCategory,
    page?: number,
  ): Promise<EventSearchResult>;
  /** Confirms a selection and refreshes its lease; returns a fresh join token. */
  openEvent(selectionToken: string): Promise<{ selectionToken: string; event: EventCard } | null>;
  /** "Etkinliğe Gideceğim" — a declaration, with no ticket and no proof. */
  joinEventUpcoming(selectionToken: string): Promise<MyEvent>;
  withdrawFromEvent(eventId: string): Promise<void>;
  /** Which event's deck to draw. Deletes nothing when it changes. */
  setEventFocus(eventId: string, room: RoomKey): Promise<void>;
  getMyEvents(): Promise<MyEvent[]>;
  /** The provider's lease for these events, or fewer rows than asked for. */
  getEventContent(eventIds: string[]): Promise<EventContent[]>;
  /**
   * E-21: "Şu An Etkinlikteyim" from a selection alone.
   *
   * Being at an event and having said you would go are two separate claims, so
   * neither is a precondition for the other and this creates no membership.
   * Everything is decided by the server: token ownership and expiry, the
   * provider's current status, the live window, the venue coordinate, the
   * D-055a reading rule, the 100 m ceiling and the 500 m radius.
   */
  verifyEventPresenceFromSelection(
    selectionToken: string,
    latitude: number,
    longitude: number,
    accuracyMeters?: number | null,
  ): Promise<EventPresenceAnswer & { eventId: string | null }>;
  /** "Şu An Etkinlikteyim" — decided by the server on every axis. */
  verifyEventPresence(
    eventId: string,
    latitude: number,
    longitude: number,
    accuracyMeters?: number | null,
  ): Promise<EventPresenceAnswer>;

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
