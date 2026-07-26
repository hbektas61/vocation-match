import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Body, Button, Notice, Screen } from '../components/ui';
import { COPY } from '../copy';
import { ChatScreen } from '../screens/ChatScreen';
import { ChooseHotelScreen } from '../screens/ChooseHotelScreen';
import { DiscoveryScreen } from '../screens/DiscoveryScreen';
import { EditProfileScreen } from '../screens/EditProfileScreen';
import { HereNowScreen } from '../screens/HereNowScreen';
import { HotelScreen } from '../screens/HotelScreen';
import { OnboardingFlow } from '../onboarding/OnboardingFlow';
import { InboxScreen } from '../screens/InboxScreen';
import { MatchScreen } from '../screens/MatchScreen';
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
        backgroundColor: focused ? color.accentDeep : 'transparent',
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
    <Screen safeTop testID="screen-bootstrap">
      <ActivityIndicator
        accessibilityLabel={COPY.bootstrap.loading}
        testID="bootstrap-spinner"
      />
      <Body>{COPY.bootstrap.loading}</Body>
    </Screen>
  );
}

function AccountLoadErrorScreen() {
  const { dispatch } = useAppStore();
  return (
    <Screen safeTop testID="screen-account-load-error">
      <Notice message={COPY.bootstrap.accountLoadError} tone="error" />
      <Button
        label={COPY.common.retry}
        onPress={() => dispatch({ type: 'RETRY_ACCOUNT_HYDRATION' })}
        testID="account-load-retry"
      />
    </Screen>
  );
}

function MainTabs() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs.Navigator
      // Onboarding ends by choosing a hotel, so opening on the hotel screen
      // asks the same question twice. The rooms are what was just explained.
      initialRouteName="Rooms"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.accentDeep,
        tabBarInactiveTintColor: color.inkMuted,
        tabBarStyle: {
          backgroundColor: color.background,
          borderTopColor: color.rule,
          // Explicit, because the default height left the mark and the label
          // together taller than the bar and clipped every label's descenders.
          height: 64 + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom + 10,
        },
        // A mark from the system rather than five emoji, which read as clip art
        // next to this type and — in the case of the green heart — argued with
        // the brand. The slot stays occupied: emptying it pushes the label out
        // of the bar entirely, which is how this was found.
        tabBarIcon: tabMark,
        // The icon slot flexes by default and took the whole item, squeezing
        // the label's box to 7px — which, with `overflow: hidden`, cut every
        // label in half. Pinning the slot to the mark's own size gives the
        // label back its line.
        tabBarIconStyle: { flex: 0, height: 10 },
        tabBarLabelStyle: {
          fontFamily: fontFamily.bodySemi,
          fontSize: 11,
          // Explicit: without it the label box collapsed to 7px and the
          // descenders rendered below the bar.
          lineHeight: 14,
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
 * skips straight to the tabs after its retryable account hydration completes.
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
  if (state.accountLoadStatus === 'loading') {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Bootstrap" component={BootstrapScreen} />
      </Stack.Navigator>
    );
  }
  if (state.accountLoadStatus === 'error') {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Bootstrap" component={AccountLoadErrorScreen} />
      </Stack.Navigator>
    );
  }
  // One wizard covers the whole way in: the age promise, the account, the
  // profile, the photo and the hotel. Which step it opens on is derived from
  // what the server already knows, so a restart resumes without anything having
  // been written down — and an account that is already complete never sees it.
  // Finished, not merely present: a profile row exists from the birthdate step
  // onward, and an active hotel is no longer part of finishing. Somebody with a
  // complete profile and no hotel belongs in the app — the hotel is asked for
  // at the point they reach for something that needs one.
  if (!state.profile?.onboardingCompletedAt) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Onboarding" component={OnboardingFlow} />
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
        // The screen carries its own display-size title; a header repeating it
        // above a back arrow made the moment read like a form.
        options={{ headerShown: false, presentation: 'modal' }}
      />
      <Stack.Screen name="Chat" component={ChatScreen} options={{ title: 'Chat' }} />
      <Stack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{ title: COPY.editProfile.title }}
      />
      <Stack.Screen
        name="ChooseHotel"
        component={ChooseHotelScreen}
        options={{ title: COPY.hotel.chooseTitle, presentation: 'modal' }}
      />
      <Stack.Screen name="ReportBlock" component={ReportBlockScreen} options={{ title: 'Safety' }} />
    </Stack.Navigator>
  );
}
