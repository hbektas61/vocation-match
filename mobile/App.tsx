import { NavigationContainer } from '@react-navigation/native';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PrivacyShield } from './src/components/PrivacyShield';
import { ToastHost } from './src/components/ToastHost';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AppStoreProvider } from './src/state/AppStore';

/**
 * D-057's visual gate. `EXPO_PUBLIC_VISUAL_HARNESS` is inlined at build time,
 * so in a production build this reads `if ('' === '1')`, the minifier drops the
 * branch and everything it reaches, and `scripts/verify-harness-absent.js`
 * proves it against the built bundle rather than trusting the comment.
 */
export default function App() {
  if (process.env.EXPO_PUBLIC_VISUAL_HARNESS === '1') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { VisualHarness } = require('./src/devtools/VisualHarness');
    return <VisualHarness />;
  }
  return <ProductApp />;
}

function ProductApp() {

  // Deliberately not a gate. The app renders on the platform face for the
  // moment before the files arrive, which is a slightly different shape rather
  // than a blank screen — and a blank screen while a network fetches a font is
  // a worse first impression than either.
  // D-058 retired the rounded display face: the one display voice is now the
  // platform serif, which is already on the device. Only the reading family
  // has to arrive.
  useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  return (
    <SafeAreaProvider>
      <AppStoreProvider>
        {/* One host over the whole app (owner, 2026-08-05): a refusal is said
            once, in one place, instead of every screen finding somewhere on
            its own page to put it. */}
        <ToastHost>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
        </ToastHost>
      </AppStoreProvider>
      <StatusBar style="dark" />
      <PrivacyShield />
    </SafeAreaProvider>
  );
}
