import { NavigationContainer } from '@react-navigation/native';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { Nunito_700Bold, Nunito_800ExtraBold } from '@expo-google-fonts/nunito';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PrivacyShield } from './src/components/PrivacyShield';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AppStoreProvider } from './src/state/AppStore';

export default function App() {
  // Deliberately not a gate. The app renders on the platform face for the
  // moment before the files arrive, which is a slightly different shape rather
  // than a blank screen — and a blank screen while a network fetches a font is
  // a worse first impression than either.
  useFonts({
    Nunito_700Bold,
    Nunito_800ExtraBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  return (
    <SafeAreaProvider>
      <AppStoreProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </AppStoreProvider>
      <StatusBar style="dark" />
      <PrivacyShield />
    </SafeAreaProvider>
  );
}
