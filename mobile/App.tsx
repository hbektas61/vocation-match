import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RootNavigator } from './src/navigation/RootNavigator';
import { AppStoreProvider } from './src/state/AppStore';

export default function App() {
  return (
    <SafeAreaProvider>
      <AppStoreProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </AppStoreProvider>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
