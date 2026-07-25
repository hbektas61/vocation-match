import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Body, Screen } from '../components/ui';
import { COPY } from '../copy';
import { AgeGateScreen } from '../screens/AgeGateScreen';
import { AuthScreen } from '../screens/AuthScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { DiscoveryScreen } from '../screens/DiscoveryScreen';
import { EditProfileScreen } from '../screens/EditProfileScreen';
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
import { color, fontFamily } from '../theme';
import type { RootStackParamList, TabParamList } from './types';

/** The tab's own mark: present when focused, a hairline ring when not. */
function tabMark({ focused }: { focused: boolean }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        marginBottom: 2,
        backgroundColor: focused ? color.ember : 'transparent',
        borderWidth: focused ? 0 : 1.5,
        borderColor: color.border,
      }}
    />
  );
}

/** The pushed screens share the app's warm ground rather than system white. */
const stackHeader = {
  headerStyle: { backgroundColor: color.background },
  headerShadowVisible: false,
  headerTintColor: color.ink,
  headerTitleStyle: { fontFamily: fontFamily.displaySemi, fontSize: 18 },
} as const;

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();

function BootstrapScreen() {
  return (
    <Screen testID="screen-bootstrap">
      <ActivityIndicator
        accessibilityLabel={COPY.bootstrap.loading}
        testID="bootstrap-spinner"
      />
      <Body>{COPY.bootstrap.loading}</Body>
    </Screen>
  );
}

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.ember,
        tabBarInactiveTintColor: color.inkMuted,
        tabBarStyle: {
          backgroundColor: color.background,
          borderTopColor: color.veil,
        },
        // A mark from the system rather than five emoji, which read as clip art
        // next to this type and — in the case of the green heart — argued with
        // the brand. The slot stays occupied: emptying it pushes the label out
        // of the bar entirely, which is how this was found.
        tabBarIcon: tabMark,
        tabBarLabelStyle: {
          fontFamily: fontFamily.bodySemi,
          fontSize: 11,
          letterSpacing: 0.2,
        },
      }}
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
 * screens do not exist in the navigator until the age gate, real sign-in,
 * and the profile are complete. A restored session with a saved profile
 * (see `AppStoreProvider`'s bootstrap effect) skips straight to the tabs.
 */
export function RootNavigator() {
  const { state } = useAppStore();

  if (state.bootstrapStatus === 'loading') {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Bootstrap" component={BootstrapScreen} />
      </Stack.Navigator>
    );
  }
  if (!state.ageConfirmed) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="AgeGate" component={AgeGateScreen} />
      </Stack.Navigator>
    );
  }
  if (!state.session) {
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
    <Stack.Navigator screenOptions={stackHeader}>
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
      <Stack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{ title: COPY.editProfile.title }}
      />
      <Stack.Screen name="ReportBlock" component={ReportBlockScreen} options={{ title: 'Safety' }} />
    </Stack.Navigator>
  );
}
