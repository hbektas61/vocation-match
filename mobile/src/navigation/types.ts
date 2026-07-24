import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  AgeGate: undefined;
  Auth: undefined;
  ProfileSetup: undefined;
  Tabs: undefined;
  Upcoming: undefined;
  HereNow: undefined;
  Match: { matchId: string };
  Chat: { matchId: string };
  ReportBlock: { userId: string; matchId?: string };
};

export type RootScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;

export type TabParamList = {
  Hotel: undefined;
  Rooms: undefined;
  Discovery: undefined;
  Inbox: undefined;
  Settings: undefined;
};
