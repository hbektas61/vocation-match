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
  type PresenceAnswer,
  type ProfileInput,
  type ReportInput,
  type RoomKey,
  type RoomStatus,
  type SwipeDirection,
  type SwipeResult,
  type UpcomingStay,
  type VocationApi,
} from './contracts';

const SESSION_LIFETIME_MS = 60 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 8;
const MAX_DECLARATION_YEARS_AHEAD = 2;

interface FakeUser {
  id: string;
  email: string;
  password: string;
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
  photoUrl: string | null;
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
  private session: AuthSession | null = null;
  private nextId = 1;
  private readonly now: () => number;

  constructor(options: FakeApiOptions = {}) {
    this.now = options.now ?? Date.now;
  }

  async signUp(email: string, password: string): Promise<AuthSession> {
    const key = normalizeEmail(email);
    if (!key.includes('@')) {
      throw new ApiError('INVALID_INPUT', 'Enter a valid email address.');
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new ApiError('INVALID_INPUT', 'Use at least 8 characters for your password.');
    }
    if (this.users.has(key)) {
      throw new ApiError('CONFLICT', 'That email is already registered.');
    }
    const user: FakeUser = { id: `user-${this.nextId++}`, email: key, password };
    this.users.set(key, user);
    return this.openSession(user);
  }

  async signIn(email: string, password: string): Promise<AuthSession> {
    const user = this.users.get(normalizeEmail(email));
    if (!user || user.password !== password) {
      throw new ApiError('UNAUTHENTICATED', 'Email or password is incorrect.');
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
    if (input.photoUrl && !input.photoUrl.startsWith('https://')) {
      throw new ApiError('INVALID_INPUT', 'Photo links must start with https://.');
    }
    if (!parseIsoDate(input.birthdate)) {
      throw new ApiError('INVALID_INPUT', 'Enter your date of birth as YYYY-MM-DD.');
    }
    if (!isAdult(input.birthdate, todayIsoDate(new Date(this.now())))) {
      throw new ApiError('UNDER_AGE', 'Vocation Match is 18+ only.');
    }
    const stored: StoredProfile = {
      id: userId,
      displayName,
      birthdate: input.birthdate,
      bio: input.bio?.trim() || null,
      photoUrl: input.photoUrl || null,
    };
    this.profiles.set(userId, stored);
    return this.toOwnProfile(stored);
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
    return CANDIDATES.filter(
      (candidate) => candidate.hotelId === hotelId && candidate.rooms.includes(room),
    )
      .slice(0, Math.min(Math.max(limit, 1), 50))
      .map((candidate) => ({
        userId: candidate.id,
        displayName: candidate.displayName,
        age: candidate.age,
        bio: candidate.bio,
        photoUrl: null,
      }));
  }

  /* --------------------------------------------------------------- matching */

  async swipe(
    targetUserId: string,
    room: RoomKey,
    direction: SwipeDirection,
  ): Promise<SwipeResult> {
    const userId = await this.requireUserId();
    const hotelId = await this.requireActiveHotelId(userId);
    if (targetUserId === userId) {
      throw new ApiError('INVALID_INPUT', 'You cannot swipe on yourself.');
    }

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

    const key = swipeKey(userId, targetUserId);
    if (!this.swipes.has(key)) {
      this.swipes.set(key, direction);
    }

    const existing = this.matchFor(userId, targetUserId);
    if (existing) {
      return {
        matched: existing.unmatchedAt === null,
        matchId: existing.unmatchedAt === null ? existing.matchId : null,
      };
    }
    // The fixture flag stands in for the other person's stored LIKE.
    if (this.swipes.get(key) === 'LIKE' && candidate.likesYou) {
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
          photoUrl: null,
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

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
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
