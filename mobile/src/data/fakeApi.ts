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
import { isUpcomingEligible, validateStayDates } from '../domain/upcoming';
import type { HereNowCheck, UpcomingDeclaration } from '../domain/types';
import { CANDIDATES } from '../fixtures/candidates';
import { getHotelById, searchHotels as searchHotelFixtures } from '../fixtures/hotels';
import {
  ApiError,
  type ActivationResult,
  type ActiveHotel,
  type AuthSession,
  type BlockedUser,
  type CandidateCard,
  type ChatMessage,
  type HotelCard,
  type MatchSummary,
  type OwnProfile,
  type PhotoUpload,
  type PresenceAnswer,
  type ProfileInput,
  type ReportInput,
  type RoomKey,
  type RoomStatus,
  type SwipeDirection,
  type SwipeResult,
  type UpcomingStay,
  type VocationApi,
  MAX_INTERESTS,
  MAX_ORIENTATIONS,
  MAX_PHOTOS,
  type ProfilePhoto,
  type ShowMe,
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
  private readonly swipes = new Map<string, SwipeDirection>();
  private readonly matches: StoredMatch[] = [];
  private readonly messages: ChatMessage[] = [];
  private readonly messageListeners = new Map<string, Set<(message: ChatMessage) => void>>();
  private readonly blocks = new Map<string, number>();
  private readonly reports: (ReportInput & { at: number })[] = [];
  /** Object path -> local uri. The fake's stand-in for the storage bucket. */
  private readonly objects = new Map<string, string>();
  /** Owner -> ordered paths. Slot 1 is the primary, exactly as on the server. */
  private readonly photoSets = new Map<string, string[]>();
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
    };
    this.profiles.set(userId, stored);
    return this.toOwnProfile(stored);
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
    return searchHotelFixtures(query).map((hotel) => ({
      id: hotel.id,
      name: hotel.name,
      city: hotel.city,
      country: hotel.country,
      address: null,
    }));
  }

  async getActiveHotel(): Promise<ActiveHotel | null> {
    const userId = await this.requireUserId();
    return this.activeHotels.get(userId) ?? null;
  }

  async setActiveHotel(hotelId: string): Promise<ActivationResult> {
    const userId = await this.requireUserId();
    if (!getHotelById(hotelId)) {
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
    const hotel = getHotelById(hotelId);
    if (
      !hotel ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      throw new ApiError('INVALID_INPUT', 'That location reading is not usable.');
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
    const hereNowEligible = isHereNowEligible(presence, active.hotelId, this.now());
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
        reason: hereNowEligible ? 'ELIGIBLE' : presenceIsFresh ? 'TOO_FAR' : 'NO_RECENT_CHECK',
        validUntil: hereNowEligible && presence ? presence.checkedAt + HERE_NOW_FRESHNESS_MS : null,
      },
    ];
  }

  /* -------------------------------------------------------------- discovery */

  async getDiscoveryFeed(room: RoomKey, limit = 20): Promise<CandidateCard[]> {
    const userId = await this.requireUserId();
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
    return CANDIDATES.filter(
      (candidate) =>
        candidate.hotelId === hotelId &&
        candidate.rooms.includes(room) &&
        showMeMatches(self?.showMe ?? null, candidate.gender) &&
        showMeMatches('EVERYONE', self?.gender ?? null),
    )
      .slice(0, Math.min(Math.max(limit, 1), 50))
      .map((candidate) => ({
        userId: candidate.id,
        displayName: candidate.displayName,
        age: candidate.age,
        bio: candidate.bio,
        photoPath: null,
        interests: candidate.interests,
        gender: candidate.showGender ? candidate.gender : null,
        orientations: candidate.showOrientation ? candidate.orientations : [],
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

    const hotelId = await this.requireActiveHotelId(userId);
    const status = (await this.getRooms()).find((entry) => entry.room === room);
    if (!status?.eligible) {
      throw new ApiError('FORBIDDEN', 'You do not have access to this room yet.');
    }
    // A block gives the same answer as "not in this room", so nobody learns
    // they have been blocked (mirrors public.swipe).
    const candidate = this.blocks.has(blockKey(userId, targetUserId))
      ? undefined
      : CANDIDATES.find(
          (entry) =>
            entry.id === targetUserId && entry.hotelId === hotelId && entry.rooms.includes(room),
        );
    if (!candidate) {
      throw new ApiError('FORBIDDEN', 'That person is not in this room.');
    }

    this.swipes.set(key, direction);

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
    return {
      ...stored,
      age: ageYears(stored.birthdate, todayIsoDate(new Date(this.now()))) ?? 0,
    };
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
