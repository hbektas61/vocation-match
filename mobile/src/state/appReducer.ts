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

/** Maps the server's own-profile shape onto the pure domain `Profile`. */
export function toDomainProfile(remote: OwnProfile): Profile {
  return {
    id: remote.id,
    displayName: remote.displayName,
    age: remote.age,
    bio: remote.bio ?? '',
    interests: [],
    birthdate: remote.birthdate,
  };
}

export interface AppState {
  bootstrapStatus: BootstrapStatus;
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
  | { type: 'CONFIRM_AGE' }
  | { type: 'BOOTSTRAP_RESOLVED'; session: AuthSession | null; profile: Profile | null }
  | { type: 'AUTH_SUCCESS'; session: AuthSession; profile: Profile | null }
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
  | { type: 'CLEAR_LAST_MATCH' }
  | { type: 'BLOCKED_USERS_LOADED'; blockedUsers: BlockedUser[] }
  | { type: 'USER_BLOCKED'; blockedUser: BlockedUser }
  | { type: 'USER_UNBLOCKED'; userId: string };

export function initialAppState(): AppState {
  return {
    bootstrapStatus: 'loading',
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
    case 'CONFIRM_AGE':
      return { ...state, ageConfirmed: true };

    case 'BOOTSTRAP_RESOLVED':
      return {
        ...state,
        bootstrapStatus: 'ready',
        session: action.session,
        profile: action.profile,
        // A restored session already passed the age gate on a prior run.
        ageConfirmed: state.ageConfirmed || action.session !== null,
      };

    case 'AUTH_SUCCESS':
      return { ...state, session: action.session, profile: action.profile };

    case 'SIGN_OUT':
      // Signing out clears every piece of this user's state from the device.
      return { ...initialAppState(), bootstrapStatus: 'ready' };

    case 'SAVE_PROFILE':
      return { ...state, profile: action.profile };

    case 'HOTELS_LOADED':
      return { ...state, hotels: action.hotels };

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
