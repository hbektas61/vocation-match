/**
 * Supabase implementation of `VocationApi`.
 *
 * Only the public URL and anon key are used; every rule that matters is
 * enforced by row level security and database triggers, so a compromised
 * client cannot read another user's row or create an underage profile.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { ageYears } from '../domain/age';
import { todayIsoDate } from '../clock';
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
import type { BackendConfig } from './config';
import { createSessionStorage, type SessionStorage } from './secureStorage';

interface PostgresLikeError {
  code?: string;
  message?: string;
  status?: number;
}

/** Maps a database or auth failure onto the app's error vocabulary. */
export function toApiError(error: PostgresLikeError | null | undefined, fallback: string): ApiError {
  const message = error?.message ?? fallback;
  const code = error?.code;

  if (code === '23514' && /18\+/.test(message)) {
    return new ApiError('UNDER_AGE', 'Vocation Match is 18+ only.');
  }
  if (code === '23514' || code === '23502' || code === '22007' || code === '22008') {
    return new ApiError('INVALID_INPUT', message);
  }
  if (code === '23505') {
    return new ApiError('CONFLICT', message);
  }
  // P0002 is what the RPCs raise for "there is nothing here yet" — no active
  // hotel, no profile, unknown hotel.
  if (code === 'P0002' || code === 'PGRST116') {
    return new ApiError('NOT_FOUND', message);
  }
  // A suspended account is refused like any other forbidden action, but the
  // user needs to be told which of the two it is.
  if (code === '42501' && /suspended/i.test(message)) {
    return new ApiError('SUSPENDED', message);
  }
  if (code === '42501' || code === 'PGRST301') {
    return new ApiError('FORBIDDEN', message);
  }
  // 28000 is the server saying "not signed in", which is a different thing
  // from "signed in and not allowed" — the client shows a login screen for one
  // and an explanation for the other.
  if (code === '28000' || error?.status === 401 || /invalid login credentials/i.test(message)) {
    return new ApiError('UNAUTHENTICATED', 'Email or password is incorrect.');
  }
  if (error?.status === 422 || /already registered/i.test(message)) {
    return new ApiError('CONFLICT', message);
  }
  if (/network|fetch failed|timeout/i.test(message)) {
    return new ApiError('NETWORK', 'No connection. Try again.');
  }
  return new ApiError('UNKNOWN', message);
}

interface ProfileRow {
  id: string;
  display_name: string;
  birthdate: string;
  bio: string | null;
  photo_url: string | null;
}

export class SupabaseApi implements VocationApi {
  private readonly client: SupabaseClient;

  constructor(config: BackendConfig, storage: SessionStorage = createSessionStorage()) {
    this.client = createClient(config.url, config.anonKey, {
      auth: {
        storage,
        autoRefreshToken: true,
        persistSession: true,
        // React Native has no URL bar to read a session out of.
        detectSessionInUrl: false,
      },
    });
  }

  async signUp(email: string, password: string): Promise<AuthSession> {
    const { data, error } = await this.client.auth.signUp({ email, password });
    if (error || !data.session) {
      throw toApiError(error as PostgresLikeError, 'Could not create the account.');
    }
    return toSession(data.session);
  }

  async signIn(email: string, password: string): Promise<AuthSession> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      throw toApiError(error as PostgresLikeError, 'Could not sign in.');
    }
    return toSession(data.session);
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) {
      throw toApiError(error as PostgresLikeError, 'Could not sign out.');
    }
  }

  async currentSession(): Promise<AuthSession | null> {
    const { data } = await this.client.auth.getSession();
    return data.session ? toSession(data.session) : null;
  }

  async getOwnProfile(): Promise<OwnProfile | null> {
    const { data, error } = await this.client
      .from('profiles')
      .select('id, display_name, birthdate, bio, photo_url')
      .maybeSingle();
    if (error) {
      throw toApiError(error, 'Could not load your profile.');
    }
    return data ? toOwnProfile(data as ProfileRow) : null;
  }

  async saveOwnProfile(input: ProfileInput): Promise<OwnProfile> {
    const session = await this.currentSession();
    if (!session) {
      throw new ApiError('UNAUTHENTICATED', 'Sign in to continue.');
    }
    const { data, error } = await this.client
      .from('profiles')
      .upsert(
        {
          id: session.userId,
          display_name: input.displayName.trim(),
          birthdate: input.birthdate,
          bio: input.bio?.trim() || null,
          photo_url: input.photoUrl || null,
        },
        { onConflict: 'id' },
      )
      .select('id, display_name, birthdate, bio, photo_url')
      .single();
    if (error || !data) {
      throw toApiError(error, 'Could not save your profile.');
    }
    return toOwnProfile(data as ProfileRow);
  }

  /* ------------------------------------------------------------------ hotel */

  async searchHotels(query: string): Promise<HotelCard[]> {
    const { data, error } = await this.client.rpc('search_hotels', { p_query: query });
    if (error) {
      throw toApiError(error, 'Could not search hotels.');
    }
    return (data ?? []).map((row: HotelRow) => ({
      id: row.id,
      name: row.name,
      city: row.city,
      country: row.country,
      address: row.address ?? null,
    }));
  }

  async getActiveHotel(): Promise<ActiveHotel | null> {
    const { data, error } = await this.client
      .from('user_active_hotel')
      .select('hotel_id, activated_at')
      .maybeSingle();
    if (error) {
      throw toApiError(error, 'Could not load your hotel.');
    }
    if (!data) {
      return null;
    }
    const row = data as { hotel_id: string; activated_at: string };
    return { hotelId: row.hotel_id, activatedAt: Date.parse(row.activated_at) };
  }

  async setActiveHotel(hotelId: string): Promise<ActivationResult> {
    const row = await this.rpcSingle<ActivationRow>(
      'set_active_hotel',
      { p_hotel_id: hotelId },
      'Could not switch hotel.',
    );
    return {
      hotelId: row.hotel_id,
      previousHotelId: row.previous_hotel_id,
      presenceCleared: row.presence_cleared,
    };
  }

  /* ------------------------------------------------------------------ rooms */

  async declareUpcomingStay(startDate: string, endDate: string): Promise<UpcomingStay> {
    const row = await this.rpcSingle<UpcomingRow>(
      'declare_upcoming_stay',
      { p_start_date: startDate, p_end_date: endDate },
      'Could not save your stay.',
    );
    return { hotelId: row.hotel_id, startDate: row.start_date, endDate: row.end_date };
  }

  async recordPresenceCheck(latitude: number, longitude: number): Promise<PresenceAnswer> {
    // The reading leaves the device once, as an argument. The server answers
    // with a boolean and an expiry — never a distance (D-005).
    const row = await this.rpcSingle<PresenceRow>(
      'record_presence_check',
      { p_latitude: latitude, p_longitude: longitude },
      'Could not check where you are.',
    );
    return { withinRange: row.within_range, expiresAt: Date.parse(row.expires_at) };
  }

  async clearPresenceCheck(): Promise<void> {
    const session = await this.currentSession();
    if (!session) {
      throw new ApiError('UNAUTHENTICATED', 'Sign in to continue.');
    }
    // Row level security limits this to the caller's own row; the filter is
    // here so PostgREST does not reject an unfiltered delete.
    const { error } = await this.client
      .from('presence_checks')
      .delete()
      .eq('user_id', session.userId);
    if (error) {
      throw toApiError(error, 'Could not clear your location check.');
    }
  }

  async getRooms(): Promise<RoomStatus[]> {
    const { data, error } = await this.client.rpc('my_rooms');
    if (error) {
      throw toApiError(error, 'Could not load your rooms.');
    }
    return (data ?? []).map((row: RoomRow) => ({
      room: row.room as RoomKey,
      eligible: row.eligible,
      reason: row.reason as RoomStatus['reason'],
      validUntil: row.valid_until ? Date.parse(row.valid_until) : null,
    }));
  }

  /* -------------------------------------------------------------- discovery */

  async getDiscoveryFeed(room: RoomKey, limit = 20): Promise<CandidateCard[]> {
    const { data, error } = await this.client.rpc('discovery_feed', {
      p_room: room,
      p_limit: limit,
    });
    if (error) {
      throw toApiError(error, 'Could not load this room.');
    }
    return (data ?? []).map((row: CandidateRow) => ({
      userId: row.user_id,
      displayName: row.display_name,
      age: row.age,
      bio: row.bio ?? null,
      photoUrl: row.photo_url ?? null,
    }));
  }

  /* --------------------------------------------------------------- matching */

  async swipe(
    targetUserId: string,
    room: RoomKey,
    direction: SwipeDirection,
  ): Promise<SwipeResult> {
    const row = await this.rpcSingle<SwipeRow>(
      'swipe',
      { p_target_id: targetUserId, p_room: room, p_decision: direction },
      'Could not record that swipe.',
    );
    return { matched: row.matched, matchId: row.match_id };
  }

  async getMatches(): Promise<MatchSummary[]> {
    const { data, error } = await this.client.rpc('my_matches');
    if (error) {
      throw toApiError(error, 'Could not load your matches.');
    }
    return (data ?? []).map((row: MatchRow) => ({
      matchId: row.match_id,
      otherUserId: row.other_user_id,
      displayName: row.display_name,
      age: row.age,
      photoUrl: row.photo_url,
      room: row.room as RoomKey,
      createdAt: Date.parse(row.created_at),
      unmatchedAt: row.unmatched_at ? Date.parse(row.unmatched_at) : null,
      lastMessageAt: row.last_message_at ? Date.parse(row.last_message_at) : null,
      lastMessageBody: row.last_message_body,
    }));
  }

  async unmatch(matchId: string): Promise<void> {
    const { error } = await this.client.rpc('unmatch', { p_match_id: matchId });
    if (error) {
      throw toApiError(error, 'Could not end that match.');
    }
  }

  /* ------------------------------------------------------------------- chat */

  async getMessages(matchId: string, limit = 100): Promise<ChatMessage[]> {
    const { data, error } = await this.client
      .from('messages')
      .select('id, match_id, sender_id, body, created_at')
      .eq('match_id', matchId)
      .order('created_at', { ascending: true })
      .limit(limit);
    if (error) {
      throw toApiError(error, 'Could not load this conversation.');
    }
    return (data ?? []).map((row) => toChatMessage(row as MessageRow));
  }

  async sendMessage(matchId: string, body: string): Promise<ChatMessage> {
    const session = await this.currentSession();
    if (!session) {
      throw new ApiError('UNAUTHENTICATED', 'Sign in to continue.');
    }
    const { data, error } = await this.client
      .from('messages')
      .insert({ match_id: matchId, sender_id: session.userId, body: body.trim() })
      .select('id, match_id, sender_id, body, created_at')
      .single();
    if (error || !data) {
      throw toApiError(error, 'Could not send that message.');
    }
    return toChatMessage(data as MessageRow);
  }

  subscribeToMessages(matchId: string, onMessage: (message: ChatMessage) => void): () => void {
    const channel = this.client
      .channel(`messages:${matchId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => onMessage(toChatMessage(payload.new as MessageRow)),
      )
      .subscribe();
    return () => {
      void this.client.removeChannel(channel);
    };
  }

  /* ----------------------------------------------------------------- safety */

  async blockUser(userId: string): Promise<void> {
    const { error } = await this.client.rpc('block_user', { p_target_id: userId });
    if (error) {
      throw toApiError(error, 'Could not block that person.');
    }
  }

  async unblockUser(userId: string): Promise<void> {
    const { error } = await this.client.rpc('unblock_user', { p_target_id: userId });
    if (error) {
      throw toApiError(error, 'Could not unblock that person.');
    }
  }

  async getBlockedUsers(): Promise<BlockedUser[]> {
    const { data, error } = await this.client.rpc('my_blocks');
    if (error) {
      throw toApiError(error, 'Could not load your blocked list.');
    }
    return (data ?? []).map((row: BlockRow) => ({
      userId: row.user_id,
      displayName: row.display_name,
      blockedAt: Date.parse(row.blocked_at),
    }));
  }

  async reportUser(input: ReportInput): Promise<void> {
    const { error } = await this.client.rpc('report_user', {
      p_target_id: input.userId,
      p_reason: input.reason,
      p_details: input.details ?? null,
      p_also_block: input.alsoBlock ?? true,
    });
    if (error) {
      throw toApiError(error, 'Could not send that report.');
    }
  }

  /** RPCs that return `table (...)` come back as an array of one row. */
  private async rpcSingle<T>(
    name: string,
    args: Record<string, unknown>,
    fallback: string,
  ): Promise<T> {
    const { data, error } = await this.client.rpc(name, args);
    if (error) {
      throw toApiError(error, fallback);
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      throw new ApiError('UNKNOWN', fallback);
    }
    return row as T;
  }
}

interface HotelRow {
  id: string;
  name: string;
  city: string;
  country: string;
  address: string | null;
}

interface ActivationRow {
  hotel_id: string;
  previous_hotel_id: string | null;
  presence_cleared: boolean;
}

interface UpcomingRow {
  hotel_id: string;
  start_date: string;
  end_date: string;
}

interface PresenceRow {
  within_range: boolean;
  expires_at: string;
}

interface RoomRow {
  room: string;
  eligible: boolean;
  reason: string;
  valid_until: string | null;
}

interface CandidateRow {
  user_id: string;
  display_name: string;
  age: number;
  bio: string | null;
  photo_url: string | null;
}

interface SwipeRow {
  matched: boolean;
  match_id: string | null;
}

interface MatchRow {
  match_id: string;
  other_user_id: string;
  display_name: string;
  age: number;
  photo_url: string | null;
  room: string;
  created_at: string;
  unmatched_at: string | null;
  last_message_at: string | null;
  last_message_body: string | null;
}

interface MessageRow {
  id: string;
  match_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

interface BlockRow {
  user_id: string;
  display_name: string;
  blocked_at: string;
}

function toChatMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    matchId: row.match_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: Date.parse(row.created_at),
  };
}

function toSession(session: { user: { id: string }; expires_at?: number }): AuthSession {
  return {
    userId: session.user.id,
    expiresAt: (session.expires_at ?? 0) * 1000,
  };
}

function toOwnProfile(row: ProfileRow): OwnProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    birthdate: row.birthdate,
    age: ageYears(row.birthdate, todayIsoDate()) ?? 0,
    bio: row.bio,
    photoUrl: row.photo_url,
  };
}
