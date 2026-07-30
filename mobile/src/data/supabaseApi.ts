/**
 * Supabase implementation of `VocationApi`.
 *
 * Only the public URL and anon key are used; every rule that matters is
 * enforced by row level security and database triggers, so a compromised
 * client cannot read another user's row or create an underage profile.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { File } from 'expo-file-system';

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
  type PhotoUpload,
  type ActiveCheckin,
  CheckinAnswer,
  PresenceAnswer,
  MAX_PHOTOS,
  type ProfileInput,
  type ProfilePhoto,
  type ShowMe,
  type ReportInput,
  type RoomHeadcount,
  type RoomKey,
  type RoomStatus,
  type SwipeDirection,
  type SwipeResult,
  type UpcomingStay,
  type VocationApi,
  type GooglePlaceAnswer,
} from './contracts';
import type { BackendConfig } from './config';
import { isE164Phone, normalizePhone } from './phone';
import {
  buildPhotoPath,
  isProfilePhotoPath,
  MAX_PHOTO_BYTES,
  PHOTO_BUCKET,
  PHOTO_URL_TTL_SECONDS,
} from './photos';
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
    return new ApiError('UNDER_AGE', 'Vacation Match is 18+ only.');
  }
  if (
    code === '23514' ||
    code === '23502' ||
    code === '22007' ||
    code === '22008' ||
    code === 'validation_failed'
  ) {
    return new ApiError('INVALID_INPUT', message);
  }
  if (code === '23505') {
    return new ApiError('CONFLICT', message);
  }
  // P0002 is what the RPCs raise for "there is nothing here yet" — no active
  // hotel, no profile, unknown hotel.
  //
  // 23503 is a foreign key violation, which from a client write only ever means
  // the row being referenced has gone: sending into a match whose other side
  // deleted their account is the case that matters. It used to fall through to
  // UNKNOWN, so the app said "something went wrong" and never worked out that
  // the conversation no longer existed.
  if (code === 'P0002' || code === 'PGRST116' || code === '23503') {
    return new ApiError('NOT_FOUND', message);
  }
  // PP001 is this project's own SQLSTATE for "that is part of Premium"
  // (D-036): the free allowance in Upcoming, or the Here Now door.
  if (code === 'PP001') {
    return new ApiError('PREMIUM_REQUIRED', message);
  }
  // A suspended account is refused like any other forbidden action, but the
  // user needs to be told which of the two it is.
  if (code === '42501' && /suspended/i.test(message)) {
    return new ApiError('SUSPENDED', message);
  }
  if (code === '42501' || code === 'PGRST301') {
    return new ApiError('FORBIDDEN', message);
  }
  if (
    code === 'otp_expired' ||
    code === 'invalid_otp' ||
    /token.*(?:invalid|expired)|invalid.*token|otp.*expired|invalid.*(?:otp|code)|(?:otp|code).*invalid/i.test(
      message,
    )
  ) {
    return new ApiError('OTP_INVALID', 'The code is incorrect or expired.');
  }
  // 28000 is the server saying "not signed in", which is a different thing
  // from "signed in and not allowed" — the client shows a login screen for one
  // and an explanation for the other.
  if (code === '28000' || error?.status === 401 || /invalid login credentials/i.test(message)) {
    return new ApiError('UNAUTHENTICATED', 'Sign in again to continue.');
  }
  if (error?.status === 422 || /already registered/i.test(message)) {
    return new ApiError('CONFLICT', message);
  }
  // Doing something too often is worth telling apart from a failure: the user
  // should wait, not retry immediately or assume something is broken.
  if (
    code === '54000' ||
    code === 'over_sms_send_rate_limit' ||
    code === 'over_request_rate_limit' ||
    error?.status === 429
  ) {
    return new ApiError('RATE_LIMITED', message);
  }
  if (/network|fetch failed|timed out|timeout|aborted/i.test(message)) {
    return new ApiError('NETWORK', 'No connection. Try again.');
  }
  return new ApiError('UNKNOWN', message);
}

interface ProfileRow {
  id: string;
  display_name: string;
  birthdate: string;
  bio: string | null;
  photo_path: string | null;
  interests: string[] | null;
  gender_identity: string | null;
  show_gender: boolean | null;
  orientations: string[] | null;
  show_orientation: boolean | null;
  show_me: ShowMe | null;
  onboarding_completed_at: string | null;
  premium_until: string | null;
}

/**
 * Where the session lives in device storage.
 *
 * Named explicitly rather than left to supabase-js's `sb-<project ref>-auth-token`
 * default, so that the one place which has to remove it by hand — after an
 * account is deleted — does not have to reconstruct that name from the URL.
 */
const SESSION_STORAGE_KEY = 'vocation-match-auth-token';

/**
 * How long any single request may take before it is given up on.
 *
 * Nothing in this app had a timeout. On a hotel wifi that accepts a connection
 * and then stops answering — which is most of them, some of the time — a
 * request hangs until the OS gives up, which can be minutes. Every screen that
 * disables its button while work is in flight then stays disabled: the
 * deletion card sits on "Deleting…" with no way out, the photo picker on
 * "Uploading…", the swipe buttons greyed. A timeout turns all of those into an
 * error the person can act on.
 *
 * Ten seconds is long enough for a slow upload to have started streaming and
 * short enough that nobody sits looking at a dead screen.
 */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * `fetch` with a deadline. The abort surfaces as a network error, which
 * `toApiError` already maps to "No connection. Try again." — the same thing the
 * person would be told if the request had failed outright, which is the honest
 * description of what happened.
 */
function fetchWithTimeout(timeoutMs: number): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // A caller's own signal still wins: supabase-js passes one for realtime.
    init?.signal?.addEventListener?.('abort', () => controller.abort());
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted && !init?.signal?.aborted) {
        throw new Error('Request timed out — no connection.');
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
}

export class SupabaseApi implements VocationApi {
  private readonly client: SupabaseClient;
  private readonly storage: SessionStorage;

  constructor(config: BackendConfig, storage: SessionStorage = createSessionStorage()) {
    this.storage = storage;
    this.client = createClient(config.url, config.anonKey, {
      global: { fetch: fetchWithTimeout(REQUEST_TIMEOUT_MS) },
      auth: {
        storage,
        storageKey: SESSION_STORAGE_KEY,
        autoRefreshToken: true,
        persistSession: true,
        // React Native has no URL bar to read a session out of.
        detectSessionInUrl: false,
      },
    });
  }

  async requestPhoneOtp(phone: string): Promise<void> {
    if (!isE164Phone(phone)) {
      throw new ApiError('INVALID_INPUT', 'Enter a phone number with its country code.');
    }
    const { error } = await this.client.auth.signInWithOtp({
      phone: normalizePhone(phone),
      options: { shouldCreateUser: true },
    });
    if (error) {
      throw toApiError(error as PostgresLikeError, 'Could not send the verification code.');
    }
  }

  async verifyPhoneOtp(phone: string, code: string): Promise<AuthSession> {
    if (!isE164Phone(phone) || !/^\d{6}$/.test(code.trim())) {
      throw new ApiError('INVALID_INPUT', 'Enter the phone number and six-digit code.');
    }
    const { data, error } = await this.client.auth.verifyOtp({
      phone: normalizePhone(phone),
      token: code.trim(),
      type: 'sms',
    });
    if (error || !data.session) {
      const mapped = toApiError(error as PostgresLikeError, 'Could not confirm the code.');
      // Some GoTrue versions describe a rejected OTP as a generic 401. At
      // this endpoint that means the submitted proof failed, not that an
      // existing app session expired.
      if (mapped.code === 'UNAUTHENTICATED') {
        throw new ApiError('OTP_INVALID', 'The code is incorrect or expired.');
      }
      throw mapped;
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
    if (!data.session) {
      return null;
    }
    // A restored token is only a claim. A JWT stays cryptographically valid
    // for its whole hour even after the account behind it is deleted from
    // another device or the dashboard — reads just come back empty, which
    // strands the person on the name step of an account that cannot save.
    // One round trip to the auth server settles it. Only a definite auth
    // answer discards the session: a network failure keeps it, because
    // signing somebody out for being offline would cost them a paid SMS.
    try {
      const { error } = await this.client.auth.getUser();
      if (error && error.status !== undefined && error.status >= 400 && error.status < 500) {
        await this.forgetSession();
        return null;
      }
    } catch {
      // Offline: trust the stored session; every later request re-checks.
    }
    return toSession(data.session);
  }

  async deleteAccount(): Promise<void> {
    const { error } = await this.client.rpc('delete_my_account');
    if (error) {
      const mapped = toApiError(error, 'Could not delete your account.');
      // P0002 means the account is already gone — the usual cause being a
      // retry after a response that never arrived. The postcondition the caller
      // asked for is true, so finishing the local half and returning is the
      // honest answer; reporting a failure here would tell someone their
      // account still exists when it does not.
      if (mapped.code !== 'NOT_FOUND') {
        // Otherwise nothing was removed and the caller is still signed in.
        throw mapped;
      }
    }
    await this.forgetSession();
  }

  /**
   * Removes the session from this device.
   *
   * `signOut({ scope: 'local' })` is the supported way, but it can fail for its
   * own reasons — a locked keychain, most plausibly — and a swallowed failure
   * there would leave a token for an account that no longer exists. The app
   * would come back on next launch holding it, which looks to the person like
   * the deletion did not happen. So the storage key is cleared directly as
   * well; it is set explicitly in the constructor precisely so this does not
   * have to guess at supabase-js's default naming.
   */
  private async forgetSession(): Promise<void> {
    try {
      await this.client.auth.signOut({ scope: 'local' });
    } catch {
      // Handled by the direct removal below.
    }
    try {
      await this.storage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Nothing further this layer can do. The server-side account is gone
      // either way, and a token for a deleted user opens nothing.
    }
  }

  async getOwnProfile(): Promise<OwnProfile | null> {
    const { data, error } = await this.client
      .from('profiles')
      .select('id, display_name, birthdate, bio, photo_path, interests, gender_identity, show_gender, orientations, show_orientation, show_me, onboarding_completed_at, premium_until')
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
    // `photo_path` is deliberately absent: an upsert that carried it would
    // clear the photo every time someone edited their bio. `interests` is the
    // same trap — omitted unless this caller actually has a list, so a form
    // that does not ask about them cannot silently empty them.
    const { data, error } = await this.client
      .from('profiles')
      .upsert(
        {
          id: session.userId,
          display_name: input.displayName.trim(),
          birthdate: input.birthdate,
          bio: input.bio?.trim() || null,
          ...(input.interests ? { interests: input.interests } : {}),
          ...(input.gender !== undefined ? { gender_identity: input.gender } : {}),
          ...(input.showGender !== undefined ? { show_gender: input.showGender } : {}),
          ...(input.orientations ? { orientations: input.orientations } : {}),
          ...(input.showOrientation !== undefined
            ? { show_orientation: input.showOrientation }
            : {}),
          ...(input.showMe !== undefined ? { show_me: input.showMe } : {}),
        },
        { onConflict: 'id' },
      )
      .select('id, display_name, birthdate, bio, photo_path, interests, gender_identity, show_gender, orientations, show_orientation, show_me, onboarding_completed_at, premium_until')
      .single();
    if (error || !data) {
      throw toApiError(error, 'Could not save your profile.');
    }
    return toOwnProfile(data as ProfileRow);
  }

  async completeOnboarding(): Promise<OwnProfile> {
    // The flag is server-set on purpose: `onboarding_completed_at` is absent
    // from the client's column grants, so this RPC is the only way it moves.
    const { error } = await this.client.rpc('complete_onboarding');
    if (error) {
      throw toApiError(error, 'Could not finish your profile.');
    }
    const profile = await this.getOwnProfile();
    if (!profile) {
      throw new ApiError('NOT_FOUND', 'Finish your profile first.');
    }
    return profile;
  }

  /* ----------------------------------------------------------------- photos */

  /**
   * Upload, then point the profile at it, then sweep everything else away.
   *
   * The order matters. Uploading first means a failure leaves the old photo
   * showing rather than a broken one. The profile must never point at an
   * object that is not there, which the server now refuses outright
   * (`set_profile_photo`) and which the sweep below cannot cause, because it
   * only ever deletes objects the profile does not reference.
   *
   * The sweep is also what closes the orphan a crash leaves behind. If the app
   * dies between the upload and the attach, the object is unreferenced and
   * nothing on the server knows about it — the next upload or removal finds it
   * and deletes it, so the leak is bounded by one object per account.
   */
  /**
   * The owner's ordered set.
   *
   * Uploading and attaching stay two steps, as they were for the single photo:
   * the object has to exist before the server will accept a path pointing at
   * it, and an upload that succeeds while the attach fails leaves an object
   * the cleanup queue is responsible for rather than a half-written profile.
   */
  async registerPushToken(token: string, platform: 'ios' | 'android', locale: string): Promise<void> {
    const { error } = await this.client.rpc('register_push_token', {
      p_token: token,
      p_platform: platform,
      p_locale: locale,
    });
    if (error) {
      throw toApiError(error, 'Could not register for notifications.');
    }
  }

  async unregisterPushToken(token: string): Promise<void> {
    const { error } = await this.client.rpc('unregister_push_token', { p_token: token });
    if (error) {
      throw toApiError(error, 'Could not unregister this device.');
    }
  }

  async getOwnPhotos(): Promise<ProfilePhoto[]> {
    const { data, error } = await this.client.rpc('own_profile_photos');
    if (error) {
      throw toApiError(error, 'Could not load your photos.');
    }
    return ((data ?? []) as PhotoRow[]).map(toProfilePhoto);
  }

  async addProfilePhoto(upload: PhotoUpload): Promise<ProfilePhoto[]> {
    const session = await this.currentSession();
    if (!session) {
      throw new ApiError('UNAUTHENTICATED', 'Sign in to continue.');
    }
    const existing = await this.getOwnPhotos();
    if (existing.length >= MAX_PHOTOS) {
      throw new ApiError('INVALID_INPUT', 'That is nine photos already.');
    }

    const path = buildPhotoPath(session.userId, upload.mimeType);
    const bytes = await readLocalFile(upload.uri);
    if (bytes.byteLength > MAX_PHOTO_BYTES) {
      throw new ApiError('INVALID_INPUT', 'That image is larger than 5 MB.');
    }

    const uploaded = await this.client.storage
      .from(PHOTO_BUCKET)
      .upload(path, bytes, { contentType: upload.mimeType, upsert: false });
    if (uploaded.error) {
      throw toApiError(uploaded.error as PostgresLikeError, 'Could not upload that photo.');
    }

    const { data, error } = await this.client.rpc('add_profile_photo', { p_path: path });
    if (error) {
      // Only the object this call just made. Sweeping the prefix — which is
      // what the single-photo path used to do — would delete every other photo
      // in the set, all of which are still attached to live rows. A failed add
      // must cost the one upload that failed and nothing else.
      await this.client.storage.from(PHOTO_BUCKET).remove([path]);
      throw toApiError(error, 'Could not save that photo.');
    }
    return ((data ?? []) as PhotoRow[]).map(toProfilePhoto);
  }

  async removeProfilePhotoAt(slot: number): Promise<ProfilePhoto[]> {
    const { data, error } = await this.client.rpc('remove_profile_photo', { p_slot: slot });
    if (error) {
      throw toApiError(error, 'Could not remove that photo.');
    }
    return ((data ?? []) as PhotoRow[]).map(toProfilePhoto);
  }

  async reorderProfilePhotos(paths: string[]): Promise<ProfilePhoto[]> {
    const { data, error } = await this.client.rpc('reorder_profile_photos', { p_paths: paths });
    if (error) {
      throw toApiError(error, 'Could not reorder your photos.');
    }
    return ((data ?? []) as PhotoRow[]).map(toProfilePhoto);
  }




  async getPhotoUrls(paths: string[]): Promise<Record<string, string>> {
    const wanted = [...new Set(paths.filter(isProfilePhotoPath))];
    if (wanted.length === 0) {
      return {};
    }
    const { data, error } = await this.client.storage
      .from(PHOTO_BUCKET)
      .createSignedUrls(wanted, PHOTO_URL_TTL_SECONDS);
    if (error) {
      throw toApiError(error as PostgresLikeError, 'Could not load photos.');
    }
    const urls: Record<string, string> = {};
    for (const entry of data ?? []) {
      // A path the read policy refuses comes back with an error and no URL.
      // Leaving it out is the same answer as "no photo", which is what stops
      // this from telling anyone who is in a room with whom.
      if (entry.path && entry.signedUrl && !entry.error) {
        urls[entry.path] = entry.signedUrl;
      }
    }
    return urls;
  }

  /* ------------------------------------------------------------------ hotel */

  async searchHotels(query: string): Promise<HotelCard[]> {
    // The edge function is the catalogue *plus* the world: it asks OSM when
    // the local table answers thinly and caches what it finds, so the search
    // is not limited to hotels somebody already picked. If the function is
    // unreachable — not deployed, cold, or down — the catalogue alone is
    // still a correct answer, just a narrower one, so this degrades to the
    // direct RPC rather than to an error.
    try {
      const { data, error } = await this.client.functions.invoke('hotel-search', {
        body: { query },
      });
      if (!error && Array.isArray(data?.hotels)) {
        return (data.hotels as HotelRow[]).map(toHotelCard);
      }
    } catch {
      // Fall through to the catalogue.
    }
    const { data, error } = await this.client.rpc('search_hotels', { p_query: query });
    if (error) {
      throw toApiError(error, 'Could not search hotels.');
    }
    return ((data ?? []) as HotelRow[]).map(toHotelCard);
  }

  async searchVenues(query: string): Promise<HotelCard[]> {
    // The edge function is the catalogue *plus* the world: it asks OSM when
    // the local table answers thinly and caches what it finds, so the search
    // is not limited to hotels somebody already picked. If the function is
    // unreachable — not deployed, cold, or down — the catalogue alone is
    // still a correct answer, just a narrower one, so this degrades to the
    // direct RPC rather than to an error.
    try {
      const { data, error } = await this.client.functions.invoke('hotel-search', {
        body: { query, mode: 'venues' },
      });
      if (!error && Array.isArray(data?.hotels)) {
        return (data.hotels as HotelRow[]).map(toHotelCard);
      }
    } catch {
      // Fall through to the catalogue.
    }
    const { data, error } = await this.client.rpc('search_venues', { p_query: query });
    if (error) {
      throw toApiError(error, 'Could not search places.');
    }
    return ((data ?? []) as HotelRow[]).map(toHotelCard);
  }

  async getHotelById(hotelId: string): Promise<HotelCard | null> {
    // A direct catalogue read: the columns granted one by one to
    // authenticated (never `location`), scoped by the is_active policy.
    const { data, error } = await this.client
      .from('hotels')
      .select('id, name, city, country, address, photo_url, photo_attribution, venue_kind')
      .eq('id', hotelId)
      .maybeSingle();
    if (error) {
      throw toApiError(error, 'Could not load the hotel.');
    }
    return data ? toHotelCard(data as HotelRow) : null;
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

  async getUpcomingStay(): Promise<UpcomingStay | null> {
    const active = await this.getActiveHotel();
    if (!active) {
      return null;
    }
    // Row level security limits this to the caller's own rows; the hotel filter
    // picks the one that matters, since a stay is per (person, hotel) and an
    // old one at a hotel they have left is not what this screen is about.
    const { data, error } = await this.client
      .from('upcoming_stays')
      .select('hotel_id, start_date, end_date')
      .eq('hotel_id', active.hotelId)
      .maybeSingle();
    if (error) {
      throw toApiError(error, 'Could not load your stay.');
    }
    if (!data) {
      return null;
    }
    const row = data as UpcomingRow;
    return { hotelId: row.hotel_id, startDate: row.start_date, endDate: row.end_date };
  }

  async withdrawUpcomingStay(): Promise<void> {
    const active = await this.getActiveHotel();
    if (!active) {
      throw new ApiError('NOT_FOUND', 'Choose a hotel first.');
    }
    const { error } = await this.client
      .from('upcoming_stays')
      .delete()
      .eq('hotel_id', active.hotelId);
    if (error) {
      throw toApiError(error, 'Could not withdraw your stay.');
    }
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

  async getRoomCounts(): Promise<RoomHeadcount[]> {
    // The threshold lives in `hotel_room_counts`, not here: the server
    // answers with an exact number or null, and null renders as nothing
    // (D-032).
    const { data, error } = await this.client.rpc('hotel_room_counts');
    if (error) {
      throw toApiError(error, 'Could not load the room counts.');
    }
    return (data ?? []).map((row: { room: string; headcount: number | null }) => ({
      room: row.room as RoomKey,
      headcount: row.headcount,
    }));
  }

  /* -------------------------------------------------------------- check-ins */

  async nearbyVenues(latitude: number, longitude: number): Promise<HotelCard[]> {
    // Edge function first (catalogue plus the world, like searchHotels);
    // the direct RPC is the degraded-but-correct fallback. Keep track of a
    // failed world lookup: if the catalogue is empty too, returning [] would
    // turn "we could not check" into the false claim "nothing is here"
    // (D-049).
    let worldLookupFailed = false;
    try {
      const { data, error } = await this.client.functions.invoke('venues-nearby', {
        body: { latitude, longitude },
      });
      if (!error && Array.isArray(data?.venues)) {
        return (data.venues as HotelRow[]).map(toHotelCard);
      }
      worldLookupFailed = true;
    } catch {
      worldLookupFailed = true;
      // Fall through to the catalogue.
    }
    const { data, error } = await this.client.rpc('nearby_venues', {
      p_latitude: latitude,
      p_longitude: longitude,
    });
    if (error) {
      throw toApiError(error, 'Could not look around.');
    }
    const catalogue = ((data ?? []) as HotelRow[]).map(toHotelCard);
    if (catalogue.length === 0 && worldLookupFailed) {
      throw new ApiError('NETWORK', 'Could not look around just now.');
    }
    return catalogue;
  }

  async recordCheckin(venueId: string, latitude: number, longitude: number): Promise<CheckinAnswer> {
    // Same shape as the presence check (D-005): the reading leaves the
    // device once, as an argument; the server stores a venue id and a
    // clock, never the point.
    const row = await this.rpcSingle<{ within_range: boolean; expires_at: string | null }>(
      'record_checkin',
      { p_venue: venueId, p_latitude: latitude, p_longitude: longitude },
      'Could not check you in.',
    );
    return {
      withinRange: row.within_range,
      expiresAt: row.expires_at ? Date.parse(row.expires_at) : null,
    };
  }

  async checkinHere(
    latitude: number,
    longitude: number,
    selectionToken?: string,
  ): Promise<CheckinAnswer> {
    // D-048: no venue argument, because the anchor is the caller's own cell.
    // The reading still leaves the device once, as an argument; what the
    // server keeps is the cell it falls in, which is coarser than the name of
    // the café it would otherwise have stored.
    const row = await this.rpcSingle<{ within_range: boolean; expires_at: string | null }>(
      'checkin_here',
      {
        p_latitude: latitude,
        p_longitude: longitude,
        p_selection_token: selectionToken ?? null,
      },
      'Could not check you in.',
    );
    return {
      withinRange: row.within_range,
      expiresAt: row.expires_at ? Date.parse(row.expires_at) : null,
    };
  }

  /**
   * D-052: the picker's second list. Everything about this is a deliberate
   * "no" — no key in the app, no call except on a check-in press, no result
   * written anywhere. A null answer means the option should not be offered:
   * unconfigured, out of allowance, or the provider is unwell. It never means
   * the street is empty, which is what the catalogue is for.
   */
  async googlePlaceSearch(
    query: string,
    latitude: number,
    longitude: number,
    sessionId?: string,
  ): Promise<GooglePlaceAnswer | null> {
    const { data, error } = await this.client.functions.invoke('places-google', {
      body: { op: 'search', query, latitude, longitude, sessionId },
    });
    if (error || !Array.isArray(data?.places) || typeof data?.sessionId !== 'string') {
      // Null is "do not offer this": unconfigured, a ceiling, a rate limit, or
      // an unwell provider. It never means "there is nothing by that name".
      return null;
    }
    return {
      sessionId: data.sessionId as string,
      duplicate: data.duplicate === true,
      places: (data.places as { selectionToken: string; name: string; detail: string | null }[])
        .map((place) => ({
          selectionToken: place.selectionToken,
          name: place.name,
          detail: place.detail ?? null,
        })),
    };
  }

  async googleFindsRemaining(): Promise<number> {
    const { data, error } = await this.client.rpc('google_finds_remaining');
    if (error || typeof data !== 'number') return 0;
    return data;
  }

  async resolveGooglePlace(placeId: string): Promise<string | null> {
    const { data, error } = await this.client.functions.invoke('places-google', {
      body: { op: 'resolve', placeId },
    });
    if (error || typeof data?.name !== 'string') return null;
    return data.name;
  }

  async clearCheckin(): Promise<void> {
    const { error } = await this.client.rpc('clear_checkin');
    if (error) {
      throw toApiError(error, 'Could not end your check-in.');
    }
  }

  async getCheckin(): Promise<ActiveCheckin | null> {
    const { data, error } = await this.client.rpc('my_checkin');
    if (error) {
      throw toApiError(error, 'Could not load your check-in.');
    }
    const row = (data ?? [])[0] as
      | {
          venue_id: string;
          /** Null for a cell (D-048) — a coarse position has no name. */
          venue_name: string | null;
          photo_url: string | null;
          photo_attribution: string | null;
          venue_kind: string | null;
          google_place_id: string | null;
          expires_at: string;
        }
      | undefined;
    return row
      ? {
          venueId: row.venue_id,
          venueName: row.venue_name ?? null,
          photoUrl: row.photo_url ?? null,
          photoAttribution: row.photo_attribution ?? null,
          kind: row.venue_kind ?? null,
          googlePlaceId: row.google_place_id ?? null,
          expiresAt: Date.parse(row.expires_at),
        }
      : null;
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
      photoPath: row.photo_path ?? null,
      photoPaths: row.photo_paths ?? [],
      interests: row.interests ?? [],
      gender: row.gender ?? null,
      orientations: row.orientations ?? [],
      venueName: row.venue_name ?? null,
      sameVenue: row.same_venue ?? true,
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
    if (row.refused) {
      // Returned rather than raised by the server so its rate-limit counter
      // survives the statement; the person sees exactly what they always did.
      throw new ApiError('FORBIDDEN', 'That person is not in this room.');
    }
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
      photoPath: row.photo_path,
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
      .select('id, match_id, sender_id, body, created_at, seq')
      .eq('match_id', matchId)
      // `seq`, not `created_at`: two messages in one transaction share a
      // transaction timestamp, and ordering by it is a coin flip.
      .order('seq', { ascending: true })
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
      .select('id, match_id, sender_id, body, created_at, seq')
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
  photo_url?: string | null;
  photo_attribution?: string | null;
  venue_kind?: string | null;
}

function toHotelCard(row: HotelRow): HotelCard {
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    country: row.country,
    address: row.address ?? null,
    photoUrl: row.photo_url ?? null,
    photoAttribution: row.photo_attribution ?? null,
    kind: row.venue_kind ?? null,
  };
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
  photo_path: string | null;
  interests: string[] | null;
  photo_paths: string[] | null;
  gender: string | null;
  orientations: string[] | null;
  venue_name: string | null;
  same_venue: boolean;
}

interface SwipeRow {
  matched: boolean;
  match_id: string | null;
  /** Set when the target is not reachable; see `public.swipe`. */
  refused: string | null;
}

interface MatchRow {
  match_id: string;
  other_user_id: string;
  display_name: string;
  age: number;
  photo_path: string | null;
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

/**
 * The picked file, as bytes.
 *
 * This used to be `fetch(uri).then(r => r.arrayBuffer())`, which is the
 * idiomatic-looking version and does not survive contact with either platform.
 * `fetch` reaches the network stack: on Android that is OkHttp, which has no
 * handler for the `file` scheme at all, so every upload failed there with a
 * bare "Network request failed". On iOS the request succeeds, and then
 * `arrayBuffer()` goes through React Native's `FileReader`, which implements it
 * by asking the native module for a **base64 data URL** and decoding it in JS —
 * a whole extra copy of a multi-megabyte image, in string form, on the JS
 * thread.
 *
 * `expo-file-system`'s `File` implements `Blob` and reads the bytes natively,
 * which is the supported way to do this on SDK 54. It is a dependency added at
 * the version `expo` itself pins for this SDK — not an SDK change.
 *
 * The failure is deliberately distinguishable from an upload failure: those are
 * two different things to fix, and collapsing them into one "could not upload"
 * is what made this hard to see in the first place.
 */
async function readLocalFile(uri: string): Promise<ArrayBuffer> {
  try {
    return await new File(uri).arrayBuffer();
  } catch {
    throw new ApiError('INVALID_INPUT', 'Could not read that image.');
  }
}

interface PhotoRow {
  slot: number;
  path: string;
}

function toProfilePhoto(row: PhotoRow): ProfilePhoto {
  return { slot: row.slot, path: row.path };
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
    photoPath: row.photo_path,
    interests: row.interests ?? [],
    gender: row.gender_identity,
    showGender: row.show_gender ?? false,
    orientations: row.orientations ?? [],
    showOrientation: row.show_orientation ?? false,
    showMe: row.show_me,
    onboardingCompletedAt: row.onboarding_completed_at
      ? Date.parse(row.onboarding_completed_at)
      : null,
    isPremium: row.premium_until != null && Date.parse(row.premium_until) > Date.now(),
  };
}
