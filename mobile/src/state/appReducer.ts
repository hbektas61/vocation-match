import { isoDateFromMs } from '../clock';
import { activateHotel, NO_ACTIVE_HOTEL } from '../domain/hotel';
import { evaluateForegroundCheck, type ForegroundReading } from '../domain/hereNow';
import { findMutualMatch, recordSwipe, unmatch } from '../domain/matching';
import { validateStayDates } from '../domain/upcoming';
import type {
  ActiveHotelState,
  Hotel,
  HereNowCheck,
  Match,
  Message,
  Profile,
  Report,
  RoomKey,
  SwipeDecision,
  UpcomingDeclaration,
} from '../domain/types';
import { AUTO_REPLIES, SELF_ID, seedCandidateSwipes } from '../fixtures/candidates';

export type LocationPermission = 'unknown' | 'granted' | 'denied';

export interface AppState {
  ageConfirmed: boolean;
  signedIn: boolean;
  profile: Profile | null;
  activeHotel: ActiveHotelState;
  upcoming: UpcomingDeclaration | null;
  hereNow: HereNowCheck | null;
  locationPermission: LocationPermission;
  swipes: SwipeDecision[];
  matches: Match[];
  messages: Message[];
  blockedUserIds: string[];
  reports: Report[];
  /** Set when the latest swipe produced a match, for the celebration screen. */
  lastMatchId: string | null;
}

export type AppAction =
  | { type: 'CONFIRM_AGE' }
  | { type: 'SIGN_IN' }
  | { type: 'SAVE_PROFILE'; profile: Profile }
  | { type: 'ACTIVATE_HOTEL'; hotelId: string; now: number }
  | { type: 'DECLARE_UPCOMING'; checkInDate: string; checkOutDate: string; now: number }
  | { type: 'CLEAR_UPCOMING' }
  | { type: 'SET_LOCATION_PERMISSION'; permission: LocationPermission }
  | { type: 'RECORD_PRESENCE_CHECK'; hotel: Hotel; reading: ForegroundReading }
  | { type: 'SWIPE'; toUserId: string; room: RoomKey; direction: 'LIKE' | 'PASS'; now: number }
  | { type: 'CLEAR_LAST_MATCH' }
  | { type: 'SEND_MESSAGE'; matchId: string; text: string; now: number }
  | { type: 'UNMATCH'; matchId: string }
  | { type: 'BLOCK_USER'; userId: string }
  | { type: 'REPORT_USER'; userId: string; reason: string; now: number }
  | { type: 'RESET'; now: number };

export function initialAppState(now: number): AppState {
  return {
    ageConfirmed: false,
    signedIn: false,
    profile: null,
    activeHotel: NO_ACTIVE_HOTEL,
    upcoming: null,
    hereNow: null,
    locationPermission: 'unknown',
    swipes: seedCandidateSwipes(now),
    matches: [],
    messages: [],
    blockedUserIds: [],
    reports: [],
    lastMatchId: null,
  };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'CONFIRM_AGE':
      return { ...state, ageConfirmed: true };

    case 'SIGN_IN':
      return { ...state, signedIn: true };

    case 'SAVE_PROFILE':
      return { ...state, profile: action.profile };

    case 'ACTIVATE_HOTEL': {
      const result = activateHotel(state.activeHotel, action.hotelId, action.now);
      if (!result.changed) return state;
      // D-004: switching hotels closes hotel-scoped access immediately.
      // Matches and chats are intentionally preserved.
      return {
        ...state,
        activeHotel: result.state,
        upcoming: null,
        hereNow: null,
        lastMatchId: null,
      };
    }

    case 'DECLARE_UPCOMING': {
      const hotelId = state.activeHotel.activeHotelId;
      if (!hotelId) return state;
      // Today is derived from the action's own clock so the enforcement
      // point cannot disagree with a caller-supplied calendar date.
      const validation = validateStayDates(
        action.checkInDate,
        action.checkOutDate,
        isoDateFromMs(action.now),
      );
      if (!validation.ok) return state;
      const declaration: UpcomingDeclaration = {
        hotelId,
        checkInDate: action.checkInDate,
        checkOutDate: action.checkOutDate,
        declaredAt: action.now,
      };
      return { ...state, upcoming: declaration };
    }

    case 'CLEAR_UPCOMING':
      return { ...state, upcoming: null };

    case 'SET_LOCATION_PERMISSION':
      // Denying permission also invalidates any existing presence session so
      // the UI cannot show a stale "you are in" state next to the denial.
      return {
        ...state,
        locationPermission: action.permission,
        hereNow: action.permission === 'denied' ? null : state.hereNow,
      };

    case 'RECORD_PRESENCE_CHECK': {
      if (state.activeHotel.activeHotelId !== action.hotel.id) return state;
      // The reading is consumed here and discarded (D-005).
      const check = evaluateForegroundCheck(action.hotel, action.reading);
      return { ...state, hereNow: check };
    }

    case 'SWIPE': {
      const hotelId = state.activeHotel.activeHotelId;
      if (!hotelId) return state;
      const decision: SwipeDecision = {
        fromUserId: SELF_ID,
        toUserId: action.toUserId,
        hotelId,
        room: action.room,
        direction: action.direction,
        at: action.now,
      };
      const swipes = recordSwipe(state.swipes, decision);
      if (swipes === state.swipes) return state;
      const match = findMutualMatch(swipes, decision, state.matches);
      return {
        ...state,
        swipes,
        matches: match ? [...state.matches, match] : state.matches,
        lastMatchId: match ? match.id : state.lastMatchId,
      };
    }

    case 'CLEAR_LAST_MATCH':
      return { ...state, lastMatchId: null };

    case 'SEND_MESSAGE': {
      const match = state.matches.find((m) => m.id === action.matchId);
      const text = action.text.trim();
      if (!match || !text) return state;
      const outgoing: Message = {
        id: `msg-${action.matchId}-${state.messages.length + 1}`,
        matchId: action.matchId,
        senderId: SELF_ID,
        text,
        at: action.now,
      };
      const messages = [...state.messages, outgoing];
      // Fixture behavior: the first outgoing message gets one canned reply
      // so a tester can see a two-way conversation.
      const isFirstOutgoing = !state.messages.some(
        (m) => m.matchId === action.matchId && m.senderId === SELF_ID,
      );
      if (isFirstOutgoing) {
        const otherUserId = match.userIds.find((id) => id !== SELF_ID) ?? match.userIds[0];
        messages.push({
          id: `msg-${action.matchId}-${state.messages.length + 2}`,
          matchId: action.matchId,
          senderId: otherUserId,
          text: AUTO_REPLIES[state.matches.indexOf(match) % AUTO_REPLIES.length],
          at: action.now + 1,
        });
      }
      return { ...state, messages };
    }

    case 'UNMATCH':
      return {
        ...state,
        matches: unmatch(state.matches, action.matchId),
        messages: state.messages.filter((m) => m.matchId !== action.matchId),
        lastMatchId: state.lastMatchId === action.matchId ? null : state.lastMatchId,
      };

    case 'BLOCK_USER': {
      if (state.blockedUserIds.includes(action.userId)) return state;
      const removedMatchIds = state.matches
        .filter((m) => m.userIds.includes(action.userId))
        .map((m) => m.id);
      return {
        ...state,
        blockedUserIds: [...state.blockedUserIds, action.userId],
        matches: state.matches.filter((m) => !removedMatchIds.includes(m.id)),
        messages: state.messages.filter((m) => !removedMatchIds.includes(m.matchId)),
        lastMatchId:
          state.lastMatchId && removedMatchIds.includes(state.lastMatchId)
            ? null
            : state.lastMatchId,
      };
    }

    case 'REPORT_USER':
      return {
        ...state,
        reports: [
          ...state.reports,
          { reportedUserId: action.userId, reason: action.reason, at: action.now },
        ],
      };

    case 'RESET':
      return initialAppState(action.now);

    default:
      return state;
  }
}
