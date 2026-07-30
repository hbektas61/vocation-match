/**
 * In-memory implementation of `VocationApi`.
 *
 * It exists so the app runs and the flows stay testable with no backend, no
 * URL, and no key. It mirrors the server's rules for a single signed-in
 * person: 18+, ownership, field limits, room eligibility, one active hotel.
 *
 * What it cannot mirror: anything that depends on two live sessions. There is
 * one session at a time here, so a rule like "the person who blocked you can
 * still see you but you cannot see them" has no representation. Those rules
 * are proved against the real database in `supabase/tests/`, and a test
 * passing here is evidence about this implementation, not about Postgres.
 */
import { todayIsoDate } from '../clock';
import { ageYears, isAdult, parseIsoDate } from '../domain/age';
import {
  evaluateForegroundCheck,
  HERE_NOW_FRESHNESS_MS,
  isHereNowEligible,
} from '../domain/hereNow';
import { haversineMeters } from '../domain/location';
import { isUpcomingEligible, validateStayDates } from '../domain/upcoming';
import type { HereNowCheck, UpcomingDeclaration } from '../domain/types';
import { CANDIDATES, ROOM_CROWD } from '../fixtures/candidates';
import { getHotelById as getHotelFixtureById, HOTELS, searchHotels as searchHotelFixtures } from '../fixtures/hotels';
import { cellOf } from '../domain/cell';
import {
  ApiError,
  type ActivationResult,
  type ActiveCheckin,
  type ActiveHotel,
  type AuthSession,
  type BlockedUser,
  type CandidateCard,
  type ChatMessage,
  type CheckinAnswer,
  type HotelCard,
  type MatchSummary,
  type OwnProfile,
  type PhotoUpload,
  type PresenceAnswer,
  type ProfileInput,
  type ReportInput,
  type RoomHeadcount,
  type RoomKey,
  type RoomStatus,
  type SwipeDirection,
  type SwipeResult,
  type UpcomingStay,
  type VocationApi,
  MAX_INTERESTS,
  MAX_ORIENTATIONS,
  MAX_PHOTOS,
  ROOM_COUNT_THRESHOLD,
  type ProfilePhoto,
  type ShowMe,
  type GooglePlaceAnswer,
} from './contracts';

import { buildPhotoPath, isProfilePhotoPath, photoExtensionFor } from './photos';
import { isE164Phone, normalizePhone } from './phone';

const SESSION_LIFETIME_MS = 60 * 60 * 1000;
export const FAKE_PHONE_OTP = '123456';
const MAX_DECLARATION_YEARS_AHEAD = 2;

interface FakeUser {
  id: string;
  phone: string;
}

interface StoredMatch {
  matchId: string;
  userId: string;
  otherUserId: string;
  room: RoomKey;
  createdAt: number;
  unmatchedAt: number | null;
}

interface StoredProfile {
  id: string;
  displayName: string;
  birthdate: string;
  bio: string | null;
  photoPath: string | null;
  interests: string[];
  gender: string | null;
  showGender: boolean;
  orientations: string[];
  showOrientation: boolean;
  showMe: ShowMe | null;
  onboardingCompletedAt: number | null;
  /** Epoch ms, or null for a free member. Mirrors `profiles.premium_until`. */
  premiumUntil: number | null;
}

export interface FakeApiOptions {
  /** Injected clock so tests stay deterministic. */
  now?: () => number;
}

export class FakeApi implements VocationApi {
  private readonly users = new Map<string, FakeUser>();
  private readonly profiles = new Map<string, StoredProfile>();
  private readonly activeHotels = new Map<string, ActiveHotel>();
  private readonly stays = new Map<string, UpcomingDeclaration>();
  private readonly presence = new Map<string, HereNowCheck>();
  /** D-039: one present-tense check-in per user, venue-anchored. */
  private readonly checkins = new Map<
    string,
    {
      venueId: string;
      checkedAt: number;
      expiresAt: number;
      /** D-052: a Google label, and never a Google name. */
      googlePlaceId: string | null;
    }
  >();
  private readonly swipes = new Map<
    string,
    { direction: SwipeDirection; room: RoomKey; hotelId: string }
  >();
  private readonly matches: StoredMatch[] = [];
  private readonly messages: ChatMessage[] = [];
  private readonly messageListeners = new Map<string, Set<(message: ChatMessage) => void>>();
  private readonly blocks = new Map<string, number>();
  private readonly reports: (ReportInput & { at: number })[] = [];
  /** Object path -> local uri. The fake's stand-in for the storage bucket. */
  private readonly objects = new Map<string, string>();
  /** Owner -> ordered paths. Slot 1 is the primary, exactly as on the server. */
  private readonly photoSets = new Map<string, string[]>();
  /** Token -> device record, the fake's stand-in for push_tokens. */
  private readonly pushTokens = new Map<string, { userId: string; platform: string; locale: string }>();
  private uploadFailure: ApiError | null = null;
  private deleteFailure: ApiError | null = null;
  private otpRequestFailure: ApiError | null = null;
  private session: AuthSession | null = null;
  private nextId = 1;
  private readonly now: () => number;

  constructor(options: FakeApiOptions = {}) {
    this.now = options.now ?? Date.now;
  }

  async requestPhoneOtp(phone: string): Promise<void> {
    if (!isE164Phone(phone)) {
      throw new ApiError('INVALID_INPUT', 'Enter a phone number with its country code.');
    }
    const key = normalizePhone(phone);
    if (this.otpRequestFailure) {
      const failure = this.otpRequestFailure;
      this.otpRequestFailure = null;
      throw failure;
    }
    if (!this.users.has(key)) {
      // A UUID rather than `user-1`: the server's ids are UUIDs, and a photo
      // path has to begin with one, so the fake must use the same shape.
      this.users.set(key, {
        id: fakeUserId(this.nextId++),
        phone: key,
      });
    }
  }

  /** Test seam: makes the next SMS request fail the way a refused request would. */
  failNextOtpRequestWith(error: ApiError | null): void {
    this.otpRequestFailure = error;
  }

  /**
   * The preview backend cannot send an SMS. Its fixed code is exported and
   * named as a test value so it cannot be mistaken for a production bypass.
   */
  async verifyPhoneOtp(phone: string, code: string): Promise<AuthSession> {
    if (!isE164Phone(phone) || !/^\d{6}$/.test(code.trim())) {
      throw new ApiError('INVALID_INPUT', 'Enter the phone number and six-digit code.');
    }
    const user = this.users.get(normalizePhone(phone));
    if (!user || code.trim() !== FAKE_PHONE_OTP) {
      throw new ApiError('OTP_INVALID', 'The code is incorrect or expired.');
    }
    return this.openSession(user);
  }

  async signOut(): Promise<void> {
    this.session = null;
  }

  async currentSession(): Promise<AuthSession | null> {
    if (this.session && this.session.expiresAt <= this.now()) {
      this.session = null;
    }
    return this.session;
  }

  async deleteAccount(): Promise<void> {
    const userId = await this.requireUserId();
    if (this.deleteFailure) {
      // One-shot, and nothing is removed: the caller stays signed in with an
      // account that still exists, which is what the screen has to show.
      const failure = this.deleteFailure;
      this.deleteFailure = null;
      throw failure;
    }

    for (const [phone, user] of this.users) {
      if (user.id === userId) this.users.delete(phone);
    }
    this.profiles.delete(userId);
    this.activeHotels.delete(userId);
    this.presence.delete(userId);
    for (const key of [...this.stays.keys()]) {
      if (key.startsWith(`${userId}|`)) this.stays.delete(key);
    }
    // Both ends of the pair, not just the one this user is the actor of. The
    // real schema cascades on both foreign keys; a fake that only cleaned the
    // first half would agree with it right up until someone wrote a test with
    // two real accounts.
    for (const key of [...this.swipes.keys()]) {
      if (key.startsWith(`${userId}|`) || key.endsWith(`|${userId}`)) this.swipes.delete(key);
    }
    for (const key of [...this.blocks.keys()]) {
      if (key.startsWith(`${userId}|`) || key.endsWith(`|${userId}`)) this.blocks.delete(key);
    }
    for (const path of [...this.objects.keys()]) {
      if (path.startsWith(`${userId}/`)) this.objects.delete(path);
    }
    const ownMatches = this.matches.filter((match) => match.userId === userId);
    for (const match of ownMatches) {
      const index = this.matches.indexOf(match);
      if (index >= 0) this.matches.splice(index, 1);
      for (let i = this.messages.length - 1; i >= 0; i -= 1) {
        if (this.messages[i].matchId === match.matchId) this.messages.splice(i, 1);
      }
    }
    // Reports are deliberately kept: deleting an account is not a way to erase
    // the record that a report was made (see the H-202 note in the migration).
    this.session = null;
  }

  /** Test seam: makes the next deletion fail the way a dropped request would. */
  failNextDeleteWith(error: ApiError | null): void {
    this.deleteFailure = error;
  }

  /**
   * Test seam: how many stored records still mention this user, anywhere.
   *
   * Without this, "the account was deleted" can only be asserted through the
   * public API — and every one of those calls fails for lack of a session
   * first, so the assertion passes whether or not anything was actually
   * removed. The review caught exactly that. This looks at the maps.
   */
  recordsFor(userId: string): number {
    const keyed = (keys: Iterable<string>, separator: string) =>
      [...keys].filter((key) => key.startsWith(`${userId}${separator}`) || key.endsWith(`|${userId}`))
        .length;

    return (
      [...this.users.values()].filter((user) => user.id === userId).length +
      (this.profiles.has(userId) ? 1 : 0) +
      (this.activeHotels.has(userId) ? 1 : 0) +
      (this.presence.has(userId) ? 1 : 0) +
      keyed(this.stays.keys(), '|') +
      keyed(this.swipes.keys(), '|') +
      keyed(this.blocks.keys(), '|') +
      keyed(this.objects.keys(), '/') +
      this.matches.filter((match) => match.userId === userId || match.otherUserId === userId)
        .length +
      this.messages.filter((message) => message.senderId === userId).length
    );
  }

  async getOwnProfile(): Promise<OwnProfile | null> {
    const userId = await this.requireUserId();
    const stored = this.profiles.get(userId);
    return stored ? this.toOwnProfile(stored) : null;
  }

  async saveOwnProfile(input: ProfileInput): Promise<OwnProfile> {
    const userId = await this.requireUserId();
    const displayName = input.displayName.trim();
    if (displayName.length < 2 || displayName.length > 40) {
      throw new ApiError('INVALID_INPUT', 'Your name needs 2 to 40 characters.');
    }
    if (input.bio && input.bio.length > 300) {
      throw new ApiError('INVALID_INPUT', 'Keep your bio under 300 characters.');
    }
    if (!parseIsoDate(input.birthdate)) {
      throw new ApiError('INVALID_INPUT', 'Enter your date of birth as YYYY-MM-DD.');
    }
    if (!isAdult(input.birthdate, todayIsoDate(new Date(this.now())))) {
      throw new ApiError('UNDER_AGE', 'Vocation Match is 18+ only.');
    }
    // Every optional field follows the same rule: omitted means "leave it as
    // it is". Each onboarding step writes only its own answer, so none of them
    // can wipe another's — the trap `photoPath` was already built to avoid.
    const previous = this.profiles.get(userId);
    const stored: StoredProfile = {
      id: userId,
      displayName,
      birthdate: input.birthdate,
      bio: input.bio?.trim() || null,
      photoPath: previous?.photoPath ?? null,
      interests: (input.interests ?? previous?.interests ?? []).slice(0, MAX_INTERESTS),
      gender: input.gender ?? previous?.gender ?? null,
      showGender: input.showGender ?? previous?.showGender ?? false,
      orientations: (input.orientations ?? previous?.orientations ?? []).slice(
        0,
        MAX_ORIENTATIONS,
      ),
      showOrientation: input.showOrientation ?? previous?.showOrientation ?? false,
      showMe: input.showMe ?? previous?.showMe ?? null,
      onboardingCompletedAt: previous?.onboardingCompletedAt ?? null,
      // D-036: a fake account starts premium so the credential-free preview
      // keeps every room walkable. The gates themselves are exercised in
      // tests, which flip this off with `setPremium(false)` — the same
      // default-premium stance the SQL test helpers take.
      premiumUntil: previous?.premiumUntil ?? this.now() + 365 * 24 * 60 * 60 * 1000,
    };
    this.profiles.set(userId, stored);
    return this.toOwnProfile(stored);
  }

  /** Test seam: flip the signed-in member's entitlement (D-036). */
  async setPremium(premium: boolean): Promise<void> {
    const userId = await this.requireUserId();
    const stored = this.profiles.get(userId);
    if (stored) {
      this.profiles.set(userId, {
        ...stored,
        premiumUntil: premium ? this.now() + 365 * 24 * 60 * 60 * 1000 : null,
      });
    }
  }

  async completeOnboarding(): Promise<OwnProfile> {
    const userId = await this.requireUserId();
    const stored = this.profiles.get(userId);
    if (!stored) {
      throw new ApiError('NOT_FOUND', 'Finish your profile first.');
    }
    // Idempotent, and the moment does not move: a retry after a dropped
    // response must not read as a failure.
    if (stored.onboardingCompletedAt !== null) {
      return this.toOwnProfile(stored);
    }
    if (!stored.gender || !stored.showMe) {
      throw new ApiError('INVALID_INPUT', 'Some answers are still missing.');
    }
    const finished = { ...stored, onboardingCompletedAt: this.now() };
    this.profiles.set(userId, finished);
    return this.toOwnProfile(finished);
  }

  /* ----------------------------------------------------------------- photos */

  /**
   * The set, mirroring `own_profile_photos` and the three functions beside it.
   *
   * `photoPath` is derived from slot 1 here exactly as `app.sync_primary_photo`
   * derives it on the server, so a card cannot disagree with a grid.
   */
  async registerPushToken(token: string, platform: 'ios' | 'android', locale: string): Promise<void> {
    const userId = await this.requireUserId();
    this.pushTokens.set(token, { userId, platform, locale });
  }

  async unregisterPushToken(token: string): Promise<void> {
    this.pushTokens.delete(token);
  }

  async getOwnPhotos(): Promise<ProfilePhoto[]> {
    const userId = await this.requireUserId();
    return [...(this.photoSets.get(userId) ?? [])].map((path, index) => ({
      slot: index + 1,
      path,
    }));
  }

  async addProfilePhoto(upload: PhotoUpload): Promise<ProfilePhoto[]> {
    const userId = await this.requireUserId();
    if (!this.profiles.get(userId)) {
      throw new ApiError('NOT_FOUND', 'Finish your profile first.');
    }
    const paths = this.photoSets.get(userId) ?? [];
    if (paths.length >= MAX_PHOTOS) {
      throw new ApiError('INVALID_INPUT', 'That is nine photos already.');
    }
    photoExtensionFor(upload.mimeType);
    // Injected failure, so a test can ask what a failed add leaves behind. The
    // fake has no storage prefix to sweep, so it cannot reproduce the real
    // defect here — what it does hold is the contract both implementations owe:
    // a failed add changes nothing.
    if (this.uploadFailure) {
      const failure = this.uploadFailure;
      this.uploadFailure = null;
      throw failure;
    }
    const path = buildPhotoPath(userId, upload.mimeType);
    this.objects.set(path, upload.uri);
    this.photoSets.set(userId, [...paths, path]);
    this.syncPrimaryPhoto(userId);
    return this.getOwnPhotos();
  }

  async removeProfilePhotoAt(slot: number): Promise<ProfilePhoto[]> {
    const userId = await this.requireUserId();
    const paths = [...(this.photoSets.get(userId) ?? [])];
    // Idempotent on an empty slot: a retry after a dropped response must not
    // read as a failure.
    if (slot >= 1 && slot <= paths.length) {
      const [removed] = paths.splice(slot - 1, 1);
      this.objects.delete(removed);
      this.photoSets.set(userId, paths);
      this.syncPrimaryPhoto(userId);
    }
    return this.getOwnPhotos();
  }

  async reorderProfilePhotos(paths: string[]): Promise<ProfilePhoto[]> {
    const userId = await this.requireUserId();
    const current = this.photoSets.get(userId) ?? [];
    if (paths.length !== current.length) {
      throw new ApiError('INVALID_INPUT', 'That is not the whole set.');
    }
    if (paths.some((path) => !current.includes(path))) {
      throw new ApiError('FORBIDDEN', 'That photo is not yours.');
    }
    this.photoSets.set(userId, [...paths]);
    this.syncPrimaryPhoto(userId);
    return this.getOwnPhotos();
  }



  /** Slot 1, or nothing. The same invariant the migration holds. */
  private syncPrimaryPhoto(userId: string): void {
    const stored = this.profiles.get(userId);
    if (!stored) return;
    this.profiles.set(userId, {
      ...stored,
      photoPath: this.photoSets.get(userId)?.[0] ?? null,
    });
  }

  async getPhotoUrls(paths: string[]): Promise<Record<string, string>> {
    const userId = await this.requireUserId();
    const urls: Record<string, string> = {};
    for (const path of paths) {
      if (!isProfilePhotoPath(path) || !this.objects.has(path)) {
        continue;
      }
      // The single-session fake cannot represent "someone else's room", so it
      // enforces the only half it can see: your own prefix. The cross-user half
      // of the read policy is proved in supabase/tests/011_profile_photos.sql.
      if (!path.startsWith(`${userId}/`)) {
        continue;
      }
      // The local file the upload came from — a URI a real <Image> can load.
      // This used to be a made-up `signed://` scheme, which was fine in jest
      // and a red screen on a phone: React Native handed it to the network
      // stack, which has no handler for it. The fake's bucket has always been
      // "path -> local uri", so the honest stand-in for a signed URL is the
      // uri it already holds.
      const local = this.objects.get(path);
      if (local) {
        urls[path] = local;
      }
    }
    return urls;
  }

  /** Test seam: makes the next upload fail the way a dropped connection would. */
  failNextUploadWith(error: ApiError | null): void {
    this.uploadFailure = error;
  }

  /* ------------------------------------------------------------------ hotel */

  async searchHotels(query: string): Promise<HotelCard[]> {
    await this.requireUserId();
    // D-051: the trip tab asks where somebody is staying, so a café is not
    // an answer. A fixture with no kind predates the vocabulary and is a
    // hotel, exactly as the catalogue's backfill assumes.
    return searchHotelFixtures(query)
      .filter((hotel) => (hotel.kind ?? 'hotel') === 'hotel')
      .map((hotel) => ({
      id: hotel.id,
      name: hotel.name,
      city: hotel.city,
      country: hotel.country,
      address: null,
      photoUrl: null,
      photoAttribution: null,
      kind: hotel.kind ?? null,
    }));
  }

  async searchVenues(query: string): Promise<HotelCard[]> {
    await this.requireUserId();
    // D-051: anywhere a person can be, which is every fixture — the fake's
    // catalogue holds no cells, and a hotel lobby is a place you can sit in.
    return searchHotelFixtures(query).map((hotel) => ({
      id: hotel.id,
      name: hotel.name,
      city: hotel.city,
      country: hotel.country,
      address: null,
      photoUrl: null,
      photoAttribution: null,
      kind: hotel.kind ?? null,
    }));
  }

  async getHotelById(hotelId: string): Promise<HotelCard | null> {
    await this.requireUserId();
    const hotel = getHotelFixtureById(hotelId);
    if (!hotel) return null;
    return {
      id: hotel.id,
      name: hotel.name,
      city: hotel.city,
      country: hotel.country,
      address: null,
      photoUrl: null,
      photoAttribution: null,
      kind: hotel.kind ?? null,
    };
  }

  async getActiveHotel(): Promise<ActiveHotel | null> {
    const userId = await this.requireUserId();
    return this.activeHotels.get(userId) ?? null;
  }

  async setActiveHotel(hotelId: string): Promise<ActivationResult> {
    const userId = await this.requireUserId();
    if (!getHotelFixtureById(hotelId)) {
      throw new ApiError('NOT_FOUND', 'That hotel is not available.');
    }
    const current = this.activeHotels.get(userId) ?? null;
    if (current?.hotelId === hotelId) {
      return { hotelId, previousHotelId: hotelId, presenceCleared: false };
    }
    const previousHotelId = current?.hotelId ?? null;
    this.activeHotels.set(userId, { hotelId, activatedAt: this.now() });
    // Switching hotels closes the previous hotel's access immediately (D-004).
    const presenceCleared = previousHotelId !== null && this.presence.delete(userId);
    return { hotelId, previousHotelId, presenceCleared: presenceCleared === true };
  }

  /* ------------------------------------------------------------------ rooms */

  async declareUpcomingStay(startDate: string, endDate: string): Promise<UpcomingStay> {
    const userId = await this.requireUserId();
    const hotelId = await this.requireActiveHotelId(userId);
    const validation = validateStayDates(startDate, endDate, this.today());
    if (!validation.ok) {
      throw new ApiError('INVALID_INPUT', STAY_DATE_MESSAGES[validation.reason]);
    }
    // Matches the server's outer bound (declare_upcoming_stay): a stay more
    // than two years out is a typo, not a plan.
    if (startDate > addYears(this.today(), MAX_DECLARATION_YEARS_AHEAD)) {
      throw new ApiError('INVALID_INPUT', 'Declare a stay within the next two years.');
    }
    this.stays.set(stayKey(userId, hotelId), {
      hotelId,
      checkInDate: startDate,
      checkOutDate: endDate,
      declaredAt: this.now(),
    });
    return { hotelId, startDate, endDate };
  }

  async getUpcomingStay(): Promise<UpcomingStay | null> {
    const userId = await this.requireUserId();
    const active = this.activeHotels.get(userId);
    if (!active) {
      return null;
    }
    const stay = this.stays.get(stayKey(userId, active.hotelId));
    return stay
      ? { hotelId: stay.hotelId, startDate: stay.checkInDate, endDate: stay.checkOutDate }
      : null;
  }

  async withdrawUpcomingStay(): Promise<void> {
    const userId = await this.requireUserId();
    const hotelId = await this.requireActiveHotelId(userId);
    this.stays.delete(stayKey(userId, hotelId));
  }

  async recordPresenceCheck(latitude: number, longitude: number): Promise<PresenceAnswer> {
    const userId = await this.requireUserId();
    const hotelId = await this.requireActiveHotelId(userId);
    const hotel = getHotelFixtureById(hotelId);
    if (
      !hotel ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      throw new ApiError('INVALID_INPUT', 'That location reading is not usable.');
    }
    // D-036: a free member's location is never even taken for Here Now.
    if (!this.isPremiumNow(userId)) {
      throw new ApiError('PREMIUM_REQUIRED', 'Here Now is for Premium members.');
    }
    // The reading is consumed here and discarded; only the answer is kept.
    const check = evaluateForegroundCheck(hotel, {
      latitude,
      longitude,
      timestamp: this.now(),
    });
    this.presence.set(userId, check);
    return { withinRange: check.withinRange, expiresAt: check.checkedAt + HERE_NOW_FRESHNESS_MS };
  }

  async clearPresenceCheck(): Promise<void> {
    const userId = await this.requireUserId();
    this.presence.delete(userId);
  }

  /* -------------------------------------------------------------- check-ins */

  async nearbyVenues(latitude: number, longitude: number): Promise<HotelCard[]> {
    await this.requireUserId();
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      throw new ApiError('INVALID_INPUT', 'That location reading is not usable.');
    }
    return HOTELS.filter(
      (venue) => haversineMeters(venue.latitude, venue.longitude, latitude, longitude) <= 500,
    )
      .sort(
        (a, b) =>
          haversineMeters(a.latitude, a.longitude, latitude, longitude) -
          haversineMeters(b.latitude, b.longitude, latitude, longitude),
      )
      .map((venue) => ({
        id: venue.id,
        name: venue.name,
        city: venue.city,
        country: venue.country,
        address: null,
        photoUrl: null,
        photoAttribution: null,
        kind: venue.kind ?? null,
      }));
  }

  async recordCheckin(venueId: string, latitude: number, longitude: number): Promise<CheckinAnswer> {
    const userId = await this.requireUserId();
    const venue = getHotelFixtureById(venueId);
    if (!venue) {
      throw new ApiError('NOT_FOUND', 'That place is not in the catalogue.');
    }
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      throw new ApiError('INVALID_INPUT', 'That location reading is not usable.');
    }
    const within =
      haversineMeters(venue.latitude, venue.longitude, latitude, longitude) <= 500;
    if (!within) {
      // Answered, never stored — mirrors `record_checkin`.
      return { withinRange: false, expiresAt: null };
    }
    const expiresAt = this.now() + 3 * 60 * 60 * 1000;
    // A catalogue pick clears any Google label: one row never mixes the two
    // providers (D-052).
    this.checkins.set(userId, {
      venueId,
      checkedAt: this.now(),
      expiresAt,
      googlePlaceId: null,
    });
    return { withinRange: true, expiresAt };
  }

  async checkinHere(
    latitude: number,
    longitude: number,
    selectionToken?: string,
  ): Promise<CheckinAnswer> {
    const userId = await this.requireUserId();
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      throw new ApiError('INVALID_INPUT', 'That location reading is not usable.');
    }
    if (selectionToken) {
      // D-053: a labelled check-in spends one of the month's finds, and a
      // spent allowance refuses the label rather than the check-in.
      const allowance = this.isPremiumNow(userId) ? 10 : 3;
      const used = this.googleFinds.get(userId) ?? 0;
      if (used >= allowance) {
        throw new ApiError('FORBIDDEN', 'No advanced place finds left this month.');
      }
      this.googleFinds.set(userId, used + 1);
    }
    // D-048: the anchor is built around the reading, so there is no geometry
    // left to fail — this is the branch that cannot answer "nowhere".
    const cell = cellOf(latitude, longitude);
    const venueId = `cell-${cell.key}`;
    this.cellVenues.set(venueId, { latitude: cell.latitude, longitude: cell.longitude });
    const expiresAt = this.now() + 3 * 60 * 60 * 1000;
    this.checkins.set(userId, {
      venueId,
      checkedAt: this.now(),
      expiresAt,
      // The fake has no Google, so a token can only be a test's own: it is
      // carried as the label rather than resolved, which keeps the entitlement
      // and refusal paths testable without a provider.
      googlePlaceId: selectionToken ?? null,
    });
    return { withinRange: true, expiresAt };
  }

  /**
   * D-052: the fake has no Google, and says so the same way the real one does
   * when no key is configured — null, meaning "do not offer this option".
   * Tests that need the option present stub this deliberately.
   */
  async googlePlaceSearch(
    _query: string,
    _latitude: number,
    _longitude: number,
    _sessionId?: string,
  ): Promise<GooglePlaceAnswer | null> {
    await this.requireUserId();
    return null;
  }

  /** D-053: three a month free, ten on Premium — the fake mirrors the rule. */
  async googleFindsRemaining(): Promise<number> {
    const userId = await this.requireUserId();
    const allowance = this.isPremiumNow(userId) ? 10 : 3;
    return Math.max(allowance - (this.googleFinds.get(userId) ?? 0), 0);
  }

  async resolveGooglePlace(_placeId: string): Promise<string | null> {
    await this.requireUserId();
    return null;
  }

  async clearCheckin(): Promise<void> {
    const userId = await this.requireUserId();
    this.checkins.delete(userId);
  }

  async getCheckin(): Promise<ActiveCheckin | null> {
    const userId = await this.requireUserId();
    const checkin = this.freshCheckin(userId);
    if (!checkin) return null;
    const venue = getHotelFixtureById(checkin.venueId);
    if (venue) {
      return {
        venueId: checkin.venueId,
        venueName: venue.name,
        photoUrl: null,
        photoAttribution: null,
        kind: venue.kind ?? null,
        googlePlaceId: checkin.googlePlaceId ?? null,
        expiresAt: checkin.expiresAt,
      };
    }
    // A cell answers with no name (D-048): the screen says where-you-are in
    // the reader's own language rather than carrying a positional key.
    if (this.cellVenues.has(checkin.venueId)) {
      return {
        venueId: checkin.venueId,
        venueName: null,
        photoUrl: null,
        photoAttribution: null,
        kind: 'cell',
        googlePlaceId: checkin.googlePlaceId ?? null,
        expiresAt: checkin.expiresAt,
      };
    }
    return null;
  }

  async getRooms(): Promise<RoomStatus[]> {
    const userId = await this.requireUserId();
    const active = this.activeHotels.get(userId) ?? null;
    if (!active) {
      return [
        { room: 'UPCOMING', eligible: false, reason: 'NO_ACTIVE_HOTEL', validUntil: null },
        { room: 'HERE_NOW', eligible: false, reason: 'NO_ACTIVE_HOTEL', validUntil: null },
      ];
    }
    const stay = this.stays.get(stayKey(userId, active.hotelId)) ?? null;
    const presence = this.presence.get(userId) ?? null;

    const upcomingEligible = isUpcomingEligible(stay, active.hotelId, this.today());
    const premium = this.isPremiumNow(userId);
    const hereNowEligible = premium && isHereNowEligible(presence, active.hotelId, this.now());
    const presenceIsFresh =
      presence !== null &&
      presence.hotelId === active.hotelId &&
      this.now() - presence.checkedAt <= HERE_NOW_FRESHNESS_MS;

    return [
      {
        room: 'UPCOMING',
        eligible: upcomingEligible,
        reason: upcomingEligible ? 'ELIGIBLE' : stay ? 'STAY_ENDED' : 'NO_DECLARATION',
        // A stay ends on a date, not at an instant — nothing to schedule.
        validUntil: null,
      },
      {
        room: 'HERE_NOW',
        eligible: hereNowEligible,
        // D-036: for a free member the distance story is not the true
        // reason the door is closed, so PREMIUM_ONLY comes first.
        reason: hereNowEligible
          ? 'ELIGIBLE'
          : !premium
            ? 'PREMIUM_ONLY'
            : presenceIsFresh
              ? 'TOO_FAR'
              : 'NO_RECENT_CHECK',
        validUntil: hereNowEligible && presence ? presence.checkedAt + HERE_NOW_FRESHNESS_MS : null,
      },
    ];
  }

  async getRoomCounts(): Promise<RoomHeadcount[]> {
    const userId = await this.requireUserId();
    const active = this.activeHotels.get(userId) ?? null;
    if (!active) {
      throw new ApiError('NOT_FOUND', 'Choose a hotel first.');
    }
    // Mirrors `hotel_room_counts` (D-032): every eligible person at the
    // hotel is in the number — show_me never filters a headcount — and the
    // number is only spoken at five or more. Below that, null; and null
    // renders as nothing.
    const myStay = this.stays.get(stayKey(userId, active.hotelId)) ?? null;
    return (['UPCOMING', 'HERE_NOW'] as ('UPCOMING' | 'HERE_NOW')[]).map((room) => {
      const crowd = ROOM_CROWD[active.hotelId]?.[room] ?? 0;
      const visible =
        CANDIDATES.filter(
          (candidate) =>
            candidate.hotelId === active.hotelId &&
            candidate.rooms.includes(room) &&
            // D-035: once the caller has a window, Upcoming counts only the
            // stays that cross it. The static crowd stands for people whose
            // dates always overlap.
            (room !== 'UPCOMING' ||
              myStay === null ||
              (candidate.stay !== undefined &&
                myStay.checkInDate <= candidate.stay.endDate &&
                candidate.stay.startDate <= myStay.checkOutDate)),
        ).length + crowd;
      return { room, headcount: visible >= ROOM_COUNT_THRESHOLD ? visible : null };
    });
  }

  /* -------------------------------------------------------------- discovery */

  async getDiscoveryFeed(room: RoomKey, limit = 20): Promise<CandidateCard[]> {
    const userId = await this.requireUserId();

    // D-039: Çevremde is anchored to the check-in, not the active hotel, and
    // mutuality is structural — no fresh check-in, no looking.
    if (room === 'NEARBY') {
      const checkin = this.freshCheckin(userId);
      if (!checkin) {
        throw new ApiError('NOT_FOUND', 'Check in somewhere first.');
      }
      const self = this.profiles.get(userId);
      return CANDIDATES.filter(
        (candidate) =>
          candidate.rooms.includes('NEARBY') &&
          this.inNearbyOf(checkin.venueId, candidate.hotelId) &&
          showMeMatches(self?.showMe ?? null, candidate.gender) &&
          showMeMatches('EVERYONE', self?.gender ?? null),
      )
        .sort((a, b) =>
          Number(b.hotelId === checkin.venueId) - Number(a.hotelId === checkin.venueId),
        )
        .slice(0, Math.min(Math.max(limit, 1), 50))
        .map((candidate) => ({
          userId: candidate.id,
          displayName: candidate.displayName,
          age: candidate.age,
          bio: candidate.bio,
          photoPath: null,
          photoPaths: [],
          interests: candidate.interests,
          gender: candidate.showGender ? candidate.gender : null,
          orientations: candidate.showOrientation ? candidate.orientations : [],
          venueName:
            candidate.hotelId === checkin.venueId
              ? null
              : (getHotelFixtureById(candidate.hotelId)?.name ?? null),
          sameVenue: candidate.hotelId === checkin.venueId,
        }));
    }

    const hotelId = await this.requireActiveHotelId(userId);
    const status = (await this.getRooms()).find((entry) => entry.room === room);
    if (!status?.eligible) {
      throw new ApiError('FORBIDDEN', 'You do not have access to this room yet.');
    }
    // Mirrors `discovery_feed`: both directions of show_me, and a card carries
    // gender or orientation only when its owner published it. Parity here is
    // the point — a fake that is more permissive than the server hides exactly
    // the bugs these tests exist to catch.
    const self = this.profiles.get(userId);
    const myStay = this.stays.get(stayKey(userId, hotelId)) ?? null;
    const swipeable = (candidate: (typeof CANDIDATES)[number]) =>
      candidate.rooms.includes(room) &&
      showMeMatches(self?.showMe ?? null, candidate.gender) &&
      showMeMatches('EVERYONE', self?.gender ?? null) &&
      // D-035, exactly as discovery_feed applies it: in Upcoming you meet
      // only the people whose declared window crosses yours, edges
      // inclusive — the checkout day and the checkin day are one day.
      (room !== 'UPCOMING' ||
        (myStay !== null &&
          candidate.stay !== undefined &&
          myStay.checkInDate <= candidate.stay.endDate &&
          candidate.stay.startDate <= myStay.checkOutDate));

    const own = CANDIDATES.filter(
      (candidate) => candidate.hotelId === hotelId && swipeable(candidate),
    );
    // D-038, the same gate as the server's: the region only speaks when the
    // own-venue deck has fewer than five unswiped people left.
    const ownUnswiped = own.filter(
      (candidate) => !this.swipes.has(swipeKey(userId, candidate.id)),
    ).length;
    const region =
      ownUnswiped < 5
        ? CANDIDATES.filter(
            (candidate) =>
              candidate.hotelId !== hotelId &&
              this.inRegionOf(hotelId, candidate.hotelId) &&
              swipeable(candidate),
          )
        : [];

    return [...own, ...region]
      .slice(0, Math.min(Math.max(limit, 1), 50))
      .map((candidate) => ({
        userId: candidate.id,
        displayName: candidate.displayName,
        age: candidate.age,
        bio: candidate.bio,
        photoPath: null,
        photoPaths: [],
        interests: candidate.interests,
        gender: candidate.showGender ? candidate.gender : null,
        orientations: candidate.showOrientation ? candidate.orientations : [],
        venueName:
          candidate.hotelId === hotelId
            ? null
            : (getHotelFixtureById(candidate.hotelId)?.name ?? null),
        sameVenue: candidate.hotelId === hotelId,
      }));
  }

  /* --------------------------------------------------------------- matching */

  async swipe(
    targetUserId: string,
    room: RoomKey,
    direction: SwipeDirection,
  ): Promise<SwipeResult> {
    const userId = await this.requireUserId();
    if (targetUserId === userId) {
      throw new ApiError('INVALID_INPUT', 'You cannot swipe on yourself.');
    }

    const key = swipeKey(userId, targetUserId);
    // Already decided: answer from what is stored and look at nobody else.
    // Mirrors `public.swipe` exactly, and for the same two reasons — a retry
    // over a dropped connection has to work (D-012), and an answer that
    // depended on where the other person is right now would be a way to watch
    // them (D-016).
    if (this.swipes.has(key)) {
      const decided = this.matchFor(userId, targetUserId);
      return {
        matched: decided?.unmatchedAt === null,
        matchId: decided && decided.unmatchedAt === null ? decided.matchId : null,
      };
    }

    let hotelId: string;
    if (room === 'NEARBY') {
      const checkin = this.freshCheckin(userId);
      if (!checkin) {
        throw new ApiError('NOT_FOUND', 'Check in somewhere first.');
      }
      hotelId = checkin.venueId;
    } else {
      hotelId = await this.requireActiveHotelId(userId);
      const status = (await this.getRooms()).find((entry) => entry.room === room);
      if (!status?.eligible) {
        throw new ApiError('FORBIDDEN', 'You do not have access to this room yet.');
      }
    }
    // D-036: the free allowance in Upcoming — 3 likes, 5 passes, per hotel.
    // Counted from stored swipes, after the replay branch, exactly like
    // `public.swipe`.
    if (room === 'UPCOMING' && !this.isPremiumNow(userId)) {
      const mine = [...this.swipes.entries()].filter(
        ([entryKey, entry]) =>
          entryKey.startsWith(`${userId}|`) &&
          entry.hotelId === hotelId &&
          entry.room === 'UPCOMING',
      );
      const spent = mine.filter(([, entry]) => entry.direction === direction).length;
      if (direction === 'LIKE' && spent >= 3) {
        throw new ApiError('PREMIUM_REQUIRED', 'Liking more people here needs Premium.');
      }
      if (direction === 'PASS' && spent >= 5) {
        throw new ApiError('PREMIUM_REQUIRED', 'Passing more people here needs Premium.');
      }
    }
    // A block gives the same answer as "not in this room", so nobody learns
    // they have been blocked (mirrors public.swipe).
    const candidate = this.blocks.has(blockKey(userId, targetUserId))
      ? undefined
      : CANDIDATES.find(
          (entry) =>
            entry.id === targetUserId &&
            entry.rooms.includes(room) &&
            // D-038 / D-039: reachable within the region for the rooms, or
            // within the 1 km street for Çevremde.
            (room === 'NEARBY'
              ? this.inNearbyOf(hotelId, entry.hotelId)
              : this.inRegionOf(hotelId, entry.hotelId)),
        );
    if (!candidate) {
      throw new ApiError('FORBIDDEN', 'That person is not in this room.');
    }

    this.swipes.set(key, { direction, room, hotelId });

    // The fixture flag stands in for the other person's stored LIKE.
    if (direction === 'LIKE' && candidate.likesYou) {
      const match: StoredMatch = {
        matchId: `match-${this.nextId++}`,
        userId,
        otherUserId: targetUserId,
        room,
        createdAt: this.now(),
        unmatchedAt: null,
      };
      this.matches.push(match);
      return { matched: true, matchId: match.matchId };
    }
    return { matched: false, matchId: null };
  }

  async getMatches(): Promise<MatchSummary[]> {
    const userId = await this.requireUserId();
    return this.matches
      .filter(
        (match) =>
          match.userId === userId && !this.blocks.has(blockKey(userId, match.otherUserId)),
      )
      .map((match) => {
        const candidate = CANDIDATES.find((entry) => entry.id === match.otherUserId);
        const last = this.messages
          .filter((message) => message.matchId === match.matchId)
          .slice(-1)[0];
        return {
          matchId: match.matchId,
          otherUserId: match.otherUserId,
          displayName: candidate?.displayName ?? 'Someone',
          age: candidate?.age ?? 0,
          photoPath: null,
          room: match.room,
          createdAt: match.createdAt,
          unmatchedAt: match.unmatchedAt,
          lastMessageAt: last?.createdAt ?? null,
          lastMessageBody: last?.body ?? null,
        };
      })
      .sort((a, b) => (b.lastMessageAt ?? b.createdAt) - (a.lastMessageAt ?? a.createdAt));
  }

  async unmatch(matchId: string): Promise<void> {
    const userId = await this.requireUserId();
    const match = this.matches.find(
      (entry) => entry.matchId === matchId && entry.userId === userId,
    );
    if (!match || match.unmatchedAt !== null) {
      throw new ApiError('NOT_FOUND', 'That match is not open.');
    }
    match.unmatchedAt = this.now();
  }

  /* ------------------------------------------------------------------- chat */

  async getMessages(matchId: string, limit = 100): Promise<ChatMessage[]> {
    const userId = await this.requireUserId();
    await this.requireMatch(userId, matchId);
    return this.messages.filter((message) => message.matchId === matchId).slice(-limit);
  }

  async sendMessage(matchId: string, body: string): Promise<ChatMessage> {
    const userId = await this.requireUserId();
    const match = await this.requireMatch(userId, matchId);
    const text = body.trim();
    if (text.length < 1 || text.length > 2000) {
      throw new ApiError('INVALID_INPUT', 'A message needs between 1 and 2000 characters.');
    }
    if (match.unmatchedAt !== null) {
      throw new ApiError('FORBIDDEN', 'This conversation is closed.');
    }
    if (this.blocks.has(blockKey(userId, match.otherUserId))) {
      throw new ApiError('FORBIDDEN', 'This conversation is closed.');
    }
    const message: ChatMessage = {
      id: `msg-${this.nextId++}`,
      matchId,
      senderId: userId,
      body: text,
      createdAt: this.now(),
    };
    this.messages.push(message);
    this.messageListeners.get(matchId)?.forEach((listener) => listener(message));
    return message;
  }

  subscribeToMessages(matchId: string, onMessage: (message: ChatMessage) => void): () => void {
    const listeners = this.messageListeners.get(matchId) ?? new Set();
    listeners.add(onMessage);
    this.messageListeners.set(matchId, listeners);
    return () => {
      listeners.delete(onMessage);
    };
  }

  /* ----------------------------------------------------------------- safety */

  async blockUser(userId: string): Promise<void> {
    const actor = await this.requireUserId();
    if (userId === actor) {
      throw new ApiError('INVALID_INPUT', 'You cannot block yourself.');
    }
    this.blocks.set(blockKey(actor, userId), this.now());
    this.matches
      .filter((match) => match.userId === actor && match.otherUserId === userId)
      .forEach((match) => {
        match.unmatchedAt = match.unmatchedAt ?? this.now();
      });
  }

  async unblockUser(userId: string): Promise<void> {
    const actor = await this.requireUserId();
    this.blocks.delete(blockKey(actor, userId));
  }

  async getBlockedUsers(): Promise<BlockedUser[]> {
    const actor = await this.requireUserId();
    return [...this.blocks.entries()]
      .filter(([key]) => key.startsWith(`${actor}|`))
      .map(([key, blockedAt]) => {
        const otherUserId = key.slice(actor.length + 1);
        return {
          userId: otherUserId,
          displayName:
            CANDIDATES.find((entry) => entry.id === otherUserId)?.displayName ?? 'Someone',
          blockedAt,
        };
      })
      .sort((a, b) => b.blockedAt - a.blockedAt);
  }

  async reportUser(input: ReportInput): Promise<void> {
    const actor = await this.requireUserId();
    if (input.userId === actor) {
      throw new ApiError('INVALID_INPUT', 'You cannot report yourself.');
    }
    if (input.details && input.details.length > 1000) {
      throw new ApiError('INVALID_INPUT', 'Keep the details under 1000 characters.');
    }
    this.reports.push({ ...input, at: this.now() });
    if (input.alsoBlock !== false) {
      await this.blockUser(input.userId);
    }
  }

  private matchFor(userId: string, otherUserId: string): StoredMatch | undefined {
    return this.matches.find(
      (match) => match.userId === userId && match.otherUserId === otherUserId,
    );
  }

  private async requireMatch(userId: string, matchId: string): Promise<StoredMatch> {
    const match = this.matches.find(
      (entry) => entry.matchId === matchId && entry.userId === userId,
    );
    if (!match) {
      throw new ApiError('FORBIDDEN', 'That conversation is not yours.');
    }
    return match;
  }

  private async requireActiveHotelId(userId: string): Promise<string> {
    const active = this.activeHotels.get(userId);
    if (!active) {
      throw new ApiError('NOT_FOUND', 'Choose a hotel first.');
    }
    return active.hotelId;
  }

  private today(): string {
    return todayIsoDate(new Date(this.now()));
  }

  private openSession(user: FakeUser): AuthSession {
    this.session = { userId: user.id, expiresAt: this.now() + SESSION_LIFETIME_MS };
    return this.session;
  }

  private async requireUserId(): Promise<string> {
    const session = await this.currentSession();
    if (!session) {
      throw new ApiError('UNAUTHENTICATED', 'Sign in to continue.');
    }
    return session.userId;
  }

  private toOwnProfile(stored: StoredProfile): OwnProfile {
    const { premiumUntil, ...rest } = stored;
    return {
      ...rest,
      age: ageYears(stored.birthdate, todayIsoDate(new Date(this.now()))) ?? 0,
      isPremium: premiumUntil !== null && premiumUntil > this.now(),
    };
  }

  /**
   * D-038: whether a candidate's fixture venue is the caller's own venue or
   * one within the region radius — the same 15 km the server uses.
   */
  private inRegionOf(hotelId: string, candidateHotelId: string): boolean {
    if (candidateHotelId === hotelId) return true;
    const mine = getHotelFixtureById(hotelId);
    const theirs = getHotelFixtureById(candidateHotelId);
    if (!mine || !theirs) return false;
    return (
      haversineMeters(mine.latitude, mine.longitude, theirs.latitude, theirs.longitude) <= 15000
    );
  }

  /**
   * Cells this run has minted (D-048), mirroring the catalogue's cell rows.
   * Keyed by the synthetic venue id, which is derived from the cell key so
   * two people standing in one cell share one anchor.
   */
  private cellVenues = new Map<string, { latitude: number; longitude: number }>();

  /** D-053: advanced finds spent this run, per user. Spent on a find only. */
  private readonly googleFinds = new Map<string, number>();

  /** An anchor's point, whether it is a catalogue fixture or a cell. */
  private venuePoint(venueId: string): { latitude: number; longitude: number } | null {
    return getHotelFixtureById(venueId) ?? this.cellVenues.get(venueId) ?? null;
  }

  /** The 1 km street (D-039), anchor to anchor — mirrors the server's rule. */
  private inNearbyOf(venueId: string, candidateHotelId: string): boolean {
    if (candidateHotelId === venueId) return true;
    const mine = this.venuePoint(venueId);
    const theirs = this.venuePoint(candidateHotelId);
    if (!mine || !theirs) return false;
    return (
      haversineMeters(mine.latitude, mine.longitude, theirs.latitude, theirs.longitude) <= 1000
    );
  }

  private freshCheckin(
    userId: string,
  ): { venueId: string; expiresAt: number; googlePlaceId: string | null } | null {
    const checkin = this.checkins.get(userId);
    return checkin && checkin.expiresAt > this.now() ? checkin : null;
  }

  private isPremiumNow(userId: string): boolean {
    const stored = this.profiles.get(userId);
    return stored?.premiumUntil != null && stored.premiumUntil > this.now();
  }
}

/**
 * The same rule as `app.show_me_matches`: WOMEN and MEN are the only two
 * values the filter knows, so a gender outside them is reachable only by
 * someone asking to see everyone (D-023).
 */
function showMeMatches(showMe: ShowMe | null, gender: string | null): boolean {
  if (showMe === null || showMe === 'EVERYONE') return true;
  if (showMe === 'WOMEN') return gender === 'WOMAN';
  if (showMe === 'MEN') return gender === 'MAN';
  return false;
}

/** A stable, valid UUID per fake account, so ids look like the server's. */
function fakeUserId(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

function stayKey(userId: string, hotelId: string): string {
  return `${userId}|${hotelId}`;
}

/** ISO date shifted by whole years, keeping the month and day. */
function addYears(isoDate: string, years: number): string {
  const [year, rest] = [isoDate.slice(0, 4), isoDate.slice(4)];
  return `${Number(year) + years}${rest}`;
}

function swipeKey(actorId: string, targetId: string): string {
  return `${actorId}|${targetId}`;
}

function blockKey(blockerId: string, blockedId: string): string {
  return `${blockerId}|${blockedId}`;
}

const STAY_DATE_MESSAGES = {
  INVALID_FORMAT: 'Enter both dates as YYYY-MM-DD.',
  CHECKOUT_NOT_AFTER_CHECKIN: 'The check-out date must be after the check-in date.',
  STAY_ALREADY_ENDED: 'That stay has already ended.',
} as const;
