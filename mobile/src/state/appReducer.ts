import type { Locale } from '../copy';
import type {
  ActiveHotel,
  AuthSession,
  BlockedUser,
  HotelCard,
  MatchSummary,
  OwnProfile,
  RoomStatus,
} from '../data';
import type { Profile } from '../domain/types';

export type LocationPermission = 'unknown' | 'granted' | 'denied';

/** `loading` only while the app start session/profile restore is in flight. */
export type BootstrapStatus = 'loading' | 'ready';
export type AccountLoadStatus = 'idle' | 'loading' | 'error';

/** Maps the server's own-profile shape onto the pure domain `Profile`. */
export function toDomainProfile(remote: OwnProfile): Profile {
  return {
    id: remote.id,
    displayName: remote.displayName,
    age: remote.age,
    bio: remote.bio ?? '',
    interests: remote.interests,
    birthdate: remote.birthdate,
    photoPath: remote.photoPath,
    onboardingCompletedAt: remote.onboardingCompletedAt,
    isPremium: remote.isPremium,
  };
}

export interface AppState {
  /**
   * Which language the app speaks. The words themselves live in the COPY
   * binding; this field exists so choosing a language re-renders the tree
   * that reads them.
   */
  locale: Locale;
  bootstrapStatus: BootstrapStatus;
  /** Profile/hotel hydration after a session is found or newly created. */
  accountLoadStatus: AccountLoadStatus;
  ageConfirmed: boolean;
  session: AuthSession | null;
  profile: Profile | null;

  /** Cached catalog from the last hotel search, used to resolve a name from an id. */
  hotels: HotelCard[];
  activeHotel: ActiveHotel | null;

  /** Server-decided room eligibility (see `RoomStatus.reason`). Empty until fetched. */
  rooms: RoomStatus[];
  locationPermission: LocationPermission;

  matches: MatchSummary[];
  /** Set when the latest swipe produced a match, for the celebration screen. */
  lastMatchId: string | null;

  blockedUsers: BlockedUser[];

}

export type AppAction =
  | { type: 'SET_LOCALE'; locale: Locale }
  | { type: 'CONFIRM_AGE' }
  | { type: 'BOOTSTRAP_RESOLVED'; session: AuthSession | null; profile: Profile | null }
  | { type: 'AUTH_SUCCESS'; session: AuthSession; profile: Profile | null }
  | {
      type: 'ACCOUNT_HYDRATED';
      profile: Profile | null;
      activeHotel: ActiveHotel | null;
    }
  | { type: 'ACCOUNT_HYDRATION_FAILED' }
  | { type: 'RETRY_ACCOUNT_HYDRATION' }
  | { type: 'SIGN_OUT' }
  | { type: 'SAVE_PROFILE'; profile: Profile }
  | { type: 'HOTELS_LOADED'; hotels: HotelCard[] }
  | { type: 'ACTIVE_HOTEL_LOADED'; activeHotel: ActiveHotel | null }
  | { type: 'HOTEL_ACTIVATED'; activeHotel: ActiveHotel }
  | { type: 'ROOMS_LOADED'; rooms: RoomStatus[] }
  | { type: 'SET_LOCATION_PERMISSION'; permission: LocationPermission }
  | { type: 'MATCHES_LOADED'; matches: MatchSummary[] }
  | { type: 'MATCH_UPSERTED'; match: MatchSummary }
  | { type: 'MATCH_UNMATCHED'; matchId: string; unmatchedAt: number }
  /**
   * The server has recorded this conversation as read up to here.
   *
   * Dispatched only *after* `markMatchRead` returns, never optimistically: the
   * badge is a claim about what the server thinks, and showing zero while the
   * server still says two is a lie the next refresh would contradict.
   */
  | { type: 'MATCH_READ'; matchId: string }
  | { type: 'CLEAR_LAST_MATCH' }
  | { type: 'BLOCKED_USERS_LOADED'; blockedUsers: BlockedUser[] }
  | { type: 'USER_BLOCKED'; blockedUser: BlockedUser }
  | { type: 'USER_UNBLOCKED'; userId: string };

export function initialAppState(): AppState {
  return {
    locale: 'en',
    bootstrapStatus: 'loading',
    accountLoadStatus: 'idle',
    ageConfirmed: false,
    session: null,
    profile: null,
    hotels: [],
    activeHotel: null,
    rooms: [],
    locationPermission: 'unknown',
    matches: [],
    lastMatchId: null,
    blockedUsers: [],
  };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {

    case 'SET_LOCALE':
      // The module binding is switched by the dispatcher before this runs;
      // the state change is what makes every COPY reader render again.
      return { ...state, locale: action.locale };

    case 'CONFIRM_AGE':
      return { ...state, ageConfirmed: true };

    case 'BOOTSTRAP_RESOLVED':
      return {
        ...state,
        bootstrapStatus: 'ready',
        session: action.session,
        profile: action.profile,
        accountLoadStatus: action.session && !action.profile ? 'loading' : 'idle',
        // A restored session already passed the age gate on a prior run.
        ageConfirmed: state.ageConfirmed || action.session !== null,
      };

    case 'AUTH_SUCCESS':
      // Signing in at all means the age gate was passed when the account was
      // made; without this a returning sign-in falls back to the welcome step.
      return {
        ...state,
        session: action.session,
        profile: action.profile,
        activeHotel: null,
        accountLoadStatus: action.profile ? 'idle' : 'loading',
        ageConfirmed: true,
      };

    case 'ACCOUNT_HYDRATED':
      return {
        ...state,
        profile: action.profile,
        activeHotel: action.activeHotel,
        accountLoadStatus: 'idle',
      };

    case 'ACCOUNT_HYDRATION_FAILED':
      return { ...state, accountLoadStatus: 'error' };

    case 'RETRY_ACCOUNT_HYDRATION':
      return state.session ? { ...state, accountLoadStatus: 'loading' } : state;

    case 'SIGN_OUT':
      // Signing out clears every piece of this user's state from the device.
      return { ...initialAppState(), bootstrapStatus: 'ready' };

    case 'SAVE_PROFILE':
      return { ...state, profile: action.profile };

    case 'HOTELS_LOADED': {
      // Merged, not replaced. Since hotels arrive from a search rather than
      // from a catalogue fetch, replacing would drop the active hotel out of
      // the store the moment somebody searched for something else — and its
      // name is what the "switch away from" prompt is built from.
      const byId = new Map(state.hotels.map((hotel) => [hotel.id, hotel]));
      for (const hotel of action.hotels) byId.set(hotel.id, hotel);
      return { ...state, hotels: [...byId.values()] };
    }

    case 'ACTIVE_HOTEL_LOADED':
      return { ...state, activeHotel: action.activeHotel };

    case 'HOTEL_ACTIVATED':
      // D-004: switching hotels closes the previous hotel's rooms immediately.
      // Room eligibility belongs to the newly active hotel and is refetched by
      // whichever screen needs it; matches are intentionally preserved.
      return {
        ...state,
        activeHotel: action.activeHotel,
        rooms: [],
        locationPermission: 'unknown',
      };

    case 'ROOMS_LOADED':
      return { ...state, rooms: action.rooms };

    case 'SET_LOCATION_PERMISSION': {
      // Denying permission clears any existing Here Now answer from the UI's
      // perspective so it cannot show a stale "you are in" next to the denial.
      const rooms =
        action.permission === 'denied'
          ? state.rooms.map((room) =>
              room.room === 'HERE_NOW'
                ? { room: 'HERE_NOW' as const, eligible: false, reason: 'NO_RECENT_CHECK' as const }
                : room,
            )
          : state.rooms;
      return { ...state, locationPermission: action.permission, rooms };
    }

    case 'MATCHES_LOADED':
      return { ...state, matches: action.matches };

    case 'MATCH_READ': {
      // The tab bar draws its mark from this list, so without this the badge
      // outlives the reading of the conversation that cleared it — right up
      // until something else happens to refetch. Reading a conversation and
      // watching the dot stay put is the app telling you it did not notice.
      const next = state.matches.map((match) =>
        match.matchId === action.matchId && match.unreadCount !== 0
          ? { ...match, unreadCount: 0 }
          : match,
      );
      // Identity is preserved when nothing changed, so a re-read of an
      // already-read conversation does not re-render every screen holding the
      // list.
      return next.some((match, i) => match !== state.matches[i])
        ? { ...state, matches: next }
        : state;
    }

    case 'MATCH_UPSERTED': {
      const exists = state.matches.some((m) => m.matchId === action.match.matchId);
      const matches = exists
        ? state.matches.map((m) => (m.matchId === action.match.matchId ? action.match : m))
        : [action.match, ...state.matches];
      return { ...state, matches, lastMatchId: action.match.matchId };
    }

    case 'MATCH_UNMATCHED':
      return {
        ...state,
        matches: state.matches.map((m) =>
          m.matchId === action.matchId ? { ...m, unmatchedAt: action.unmatchedAt } : m,
        ),
      };

    case 'CLEAR_LAST_MATCH':
      return { ...state, lastMatchId: null };

    case 'BLOCKED_USERS_LOADED':
      return { ...state, blockedUsers: action.blockedUsers };

    case 'USER_BLOCKED': {
      const exists = state.blockedUsers.some((b) => b.userId === action.blockedUser.userId);
      return {
        ...state,
        blockedUsers: exists ? state.blockedUsers : [action.blockedUser, ...state.blockedUsers],
        // Blocking ends any open match with this person, mirroring the server (D-008).
        matches: state.matches.map((m) =>
          m.otherUserId === action.blockedUser.userId && m.unmatchedAt === null
            ? { ...m, unmatchedAt: action.blockedUser.blockedAt }
            : m,
        ),
      };
    }

    case 'USER_UNBLOCKED':
      return {
        ...state,
        blockedUsers: state.blockedUsers.filter((b) => b.userId !== action.userId),
      };

    default:
      return state;
  }
}
