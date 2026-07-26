/**
 * The device half of push notifications.
 *
 * The server decides who gets told what (see the notifications migration);
 * this module only earns the device a place on that list: ask permission,
 * fetch the Expo token, hand it to the backend with the device's language —
 * because the words of a push are fixed at send time — and take it back off
 * the list before sign-out, since afterwards the API would rightly refuse.
 *
 * Everything here is best-effort by design. A refused permission, a simulator
 * without a push service, Expo Go (which cannot receive remote pushes since
 * SDK 53) — none of these are errors a person should see; the app simply
 * works without pushes. That is also why the import is dynamic and every step
 * is caught: jest and the web build load this file and must not explode.
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

import type { VocationApi } from '../data';

let registeredToken: string | null = null;

export async function registerForPush(api: VocationApi, locale: string): Promise<void> {
  // Expo Go cannot receive remote pushes since SDK 53, so nothing that
  // follows can succeed there — and the attempt is what crashed the first
  // device run. Skipped before anything notification-shaped is even loaded.
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return;
  }
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return;
  }
  try {
    // Still dynamic: jest and the web export load this file, and neither
    // should pay for (or choke on) the notifications module. Never
    // `import('react-native')`, though — Metro's dynamic import builds the
    // namespace with importAll, which runs every lazy getter on the RN index,
    // including PushNotificationIOS's, whose native module does not exist in
    // Expo Go. That one evaluation was the whole red screen.
    const Notifications = await import('expo-notifications');

    // Foreground presentation: a banner, quietly — the user is already here.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });

    const current = await Notifications.getPermissionsAsync();
    const granted = current.granted
      ? true
      : (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) {
      return;
    }

    const token = (await Notifications.getExpoPushTokenAsync()).data;
    await api.registerPushToken(token, Platform.OS, locale);
    registeredToken = token;
  } catch {
    // No pushes on this device, and nothing else changes.
  }
}

/** Must run while still signed in — the server refuses anonymous callers. */
export async function unregisterPush(api: VocationApi): Promise<void> {
  if (!registeredToken) {
    return;
  }
  try {
    await api.unregisterPushToken(registeredToken);
    registeredToken = null;
  } catch {
    // A token that outlives its account stops matching anyone on next sign-in.
  }
}
