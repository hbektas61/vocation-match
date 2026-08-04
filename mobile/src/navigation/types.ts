import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Bootstrap: undefined;
  Onboarding: undefined;
  EditProfile: undefined;
  ChooseHotel: undefined;
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  /**
   * D-057: Settings left the bottom bar for the profile ring. It is a pushed
   * screen now, so every primary tab keeps its own state while you are in it.
   */
  Settings: undefined;
  Upcoming: undefined;
  HereNow: undefined;
  HotelDetails: { hotelId: string };
  /**
   * D-056: one event, and the two ways into its room. `when` and `where` are
   * leased provider content passed for display only — the detail screen showed
   * a bare name, so the two facts that decide whether somebody is going were
   * on the list they came from and nowhere else.
   */
  EventDetail: {
    /** Absent when the screen opens from a membership rather than a search. */
    selectionToken?: string;
    /** The membership to load, when there is no fresh selection. */
    eventId?: string;
    name: string;
    when?: string;
    where?: string;
    /** The leased artwork URL, for the D-062 hero. Ephemeral like the name. */
    imageUrl?: string | null;
    /** The list's status word for the badge on the hero — "Bugün", "Yaklaşan". */
    badge?: string;
  };
  Match: { matchId: string };
  Chat: { matchId: string };
  ReportBlock: { userId: string; displayName?: string; matchId?: string };
};

export type RootScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;

export type TabParamList = {
  /** D-040: hotel choice and its two features, one tab. */
  Vacation: undefined;
  /** D-040: the free check-in street, independent of any hotel. */
  Nearby: undefined;
  /** D-056: the fourth primary feature. */
  Events: undefined;
  /** `source` preselects a deck (API room key, never a display name). */
  Discovery: {
    source?: 'UPCOMING' | 'HERE_NOW' | 'NEARBY' | 'EVENT_UPCOMING' | 'EVENT_HERE_NOW';
  } | undefined;
  Inbox: undefined;
};
