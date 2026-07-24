import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { Text } from 'react-native';

import { COPY } from '../copy';
import { AgeGateScreen } from '../screens/AgeGateScreen';
import { AuthScreen } from '../screens/AuthScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { DiscoveryScreen } from '../screens/DiscoveryScreen';
import { HereNowScreen } from '../screens/HereNowScreen';
import { HotelScreen } from '../screens/HotelScreen';
import { InboxScreen } from '../screens/InboxScreen';
import { MatchScreen } from '../screens/MatchScreen';
import { ProfileSetupScreen } from '../screens/ProfileSetupScreen';
import { ReportBlockScreen } from '../screens/ReportBlockScreen';
import { RoomsScreen } from '../screens/RoomsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { UpcomingScreen } from '../screens/UpcomingScreen';
import { useAppStore } from '../state/AppStore';
import { color } from '../theme';
import type { RootStackParamList, TabParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();

const TAB_ICONS: Record<keyof TabParamList, string> = {
  Hotel: '🏨',
  Rooms: '🚪',
  Discovery: '💚',
  Inbox: '💬',
  Settings: '⚙️',
};

function tabIcon(routeName: keyof TabParamList) {
  return function TabIcon() {
    return (
      <Text accessibilityElementsHidden importantForAccessibility="no">
        {TAB_ICONS[routeName]}
      </Text>
    );
  };
}

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: color.accent,
        tabBarInactiveTintColor: color.textSecondary,
        tabBarIcon: tabIcon(route.name),
      })}
    >
      <Tabs.Screen name="Hotel" component={HotelScreen} />
      <Tabs.Screen name="Rooms" component={RoomsScreen} />
      <Tabs.Screen name="Discovery" component={DiscoveryScreen} />
      <Tabs.Screen name="Inbox" component={InboxScreen} />
      <Tabs.Screen name="Settings" component={SettingsScreen} />
    </Tabs.Navigator>
  );
}

/**
 * Onboarding is enforced by conditional screen registration: the main app
 * screens do not exist in the navigator until the age gate, the placeholder
 * sign-in, and the profile are complete.
 */
export function RootNavigator() {
  const { state } = useAppStore();

  if (!state.ageConfirmed) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="AgeGate" component={AgeGateScreen} />
      </Stack.Navigator>
    );
  }
  if (!state.signedIn) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Auth" component={AuthScreen} />
      </Stack.Navigator>
    );
  }
  if (!state.profile) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
      </Stack.Navigator>
    );
  }
  return (
    <Stack.Navigator>
      <Stack.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen
        name="Upcoming"
        component={UpcomingScreen}
        options={{ title: COPY.upcoming.roomTitle }}
      />
      <Stack.Screen
        name="HereNow"
        component={HereNowScreen}
        options={{ title: COPY.hereNow.roomTitle }}
      />
      <Stack.Screen
        name="Match"
        component={MatchScreen}
        options={{ title: COPY.match.title, presentation: 'modal' }}
      />
      <Stack.Screen name="Chat" component={ChatScreen} options={{ title: 'Chat' }} />
      <Stack.Screen name="ReportBlock" component={ReportBlockScreen} options={{ title: 'Safety' }} />
    </Stack.Navigator>
  );
}
