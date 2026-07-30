import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Bootstrap: undefined;
  Onboarding: undefined;
  EditProfile: undefined;
  ChooseHotel: undefined;
  Tabs: undefined;
  Upcoming: undefined;
  HereNow: undefined;
  HotelDetails: { hotelId: string };
  /** D-056: one event, and the two ways into its room. */
  EventDetail: { selectionToken: string; name: string };
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
  Settings: undefined;
};
