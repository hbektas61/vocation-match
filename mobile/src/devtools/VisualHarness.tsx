/**
 * The visual gate's harness — D-057's "compare each frame against a real
 * render" requirement, for the states the app cannot be walked into.
 *
 * Two kinds of screen are unreachable by driving the UI:
 *
 *   * the Here Now outcomes (`T-19`–`T-22`), because their simulate controls
 *     only exist for a venue with a stored coordinate and a Google venue by
 *     definition has none;
 *   * the deck, the match moment, the inbox and the chat (`D-01`–`C-03`),
 *     because reaching them needs two accounts liking each other.
 *
 * The alternative — adding simulate buttons to the product — was explicitly
 * refused, and rightly: a control that exists so screenshots are easy is a
 * control somebody will find. So this renders the real screens against a
 * seeded in-memory backend instead, and:
 *
 *   1. **It is not in the production bundle.** `EXPO_PUBLIC_VISUAL_HARNESS` is
 *      inlined at build time, so the branch below is `if ('' === '1')` in a
 *      production build and the minifier drops it along with everything it
 *      references. `scripts/verify-harness-absent.js` greps the built bundle
 *      for `VISUAL_HARNESS_MARKER` and fails if it is there.
 *   2. **It changes no production route.** It replaces the root, rather than
 *      adding a screen to the navigator somebody could reach.
 *   3. **It is deterministic.** A fixed clock, a fixed account, fixed readings.
 */
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { COPY, setLocale } from '../copy';
import {
  FakeApi,
  fixedLocation,
  getApi,
  setApi,
  type ForegroundLocationReader,
} from '../data';
import { DiscoveryScreen } from '../screens/DiscoveryScreen';
import { HereNowScreen } from '../screens/HereNowScreen';
import { InboxScreen } from '../screens/InboxScreen';
import type { RootScreenProps } from '../navigation/types';
import { AppStoreProvider } from '../state/AppStore';
import { color, fontFamily } from '../theme';

/** Grepped for by the build check. Must appear nowhere in a production bundle. */
export const VISUAL_HARNESS_MARKER = 'VOCATION_VISUAL_HARNESS_ONLY';

/** The clock every scene runs on, so a screenshot is the same tomorrow. */
const FIXED_NOW = Date.parse('2026-08-12T18:30:00Z');
const PILOT_HOTEL = 'hotel-lara-shore';

/** A reading inside the radius, and one far outside it. */
const AT_VENUE: ForegroundLocationReader = fixedLocation(36.8531, 30.7995, 12);
const FAR_AWAY: ForegroundLocationReader = fixedLocation(41.0082, 28.9784, 12);
/** D-055a's own example: usable, but far too coarse to be believed. */
const COARSE: ForegroundLocationReader = fixedLocation(36.8531, 30.7995, 900);

type Scene = {
  /** The Figma frame this render is to be compared against. */
  frame: string;
  label: string;
  /** Puts the backend into the state the frame describes. */
  seed?: () => Promise<void>;
  /** Rendered inside a one-screen stack, so `useNavigation` works as usual. */
  render: (props: RootScreenProps<'HereNow'>) => React.ReactElement;
};

/** Signs in a fixed account and gives it the pilot hotel. */
async function baseAccount(): Promise<void> {
  const api = getApi();
  await api.requestPhoneOtp('+905551110099');
  await api.verifyPhoneOtp('+905551110099', '123456');
  await api.saveOwnProfile({
    displayName: 'Deniz',
    birthdate: '1994-03-01',
    bio: 'Deniz, kahve ve uzun yürüyüşler.',
  });
  await api.setActiveHotel(PILOT_HOTEL);
}

/** The account, plus a fresh proximity answer so the live room is open. */
async function verifiedAtVenue(): Promise<void> {
  await baseAccount();
  const reading = await AT_VENUE.read();
  if (reading.status === 'granted') {
    await getApi().recordPresenceCheck(reading.latitude, reading.longitude, reading.accuracyMeters);
  }
}

const SCENES: Record<string, Scene> = {
  'T-19': {
    frame: '36:171',
    label: 'Oteldeyim — konum hassas değil',
    seed: baseAccount,
    render: (p) => <HereNowScreen {...p} reader={COARSE} />,
  },
  'T-20': {
    frame: '36:192',
    label: 'Oteldeyim — çok uzakta',
    seed: baseAccount,
    render: (p) => <HereNowScreen {...p} reader={FAR_AWAY} />,
  },
  'T-21': {
    frame: '36:213',
    label: 'Oteldeyim — açık',
    seed: baseAccount,
    render: (p) => <HereNowScreen {...p} reader={AT_VENUE} />,
  },
  'D-02': {
    frame: '45:793',
    label: 'Keşfet — Oteldeyim bağlamı',
    seed: verifiedAtVenue,
    render: () => <DiscoveryScreen />,
  },
  'I-02': {
    frame: '46:985',
    label: 'Gelen kutusu — boş',
    seed: baseAccount,
    render: () => <InboxScreen />,
  },
};

export const SCENE_IDS = Object.keys(SCENES);

/** `?scene=T-21` on web; the picker below everywhere else. */
function requestedScene(): string | null {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('scene');
  return value && SCENES[value] ? value : null;
}

const Stack = createNativeStackNavigator();

function Stage({ scene }: { scene: Scene }) {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Scene">
          {(props) => scene.render(props as unknown as RootScreenProps<'HereNow'>)}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export function VisualHarness() {
  const [id, setId] = useState<string | null>(requestedScene());
  const [seeded, setSeeded] = useState(false);

  // Seed before the store mounts: `AppStoreProvider` hydrates itself from the
  // session it finds, exactly as it does at a real launch, so the screens see
  // what they see in the app rather than a hand-poked store.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setSeeded(false);
    setLocale('tr');
    setApi(new FakeApi({ now: () => FIXED_NOW }));
    (async () => {
      await SCENES[id].seed?.();
      if (!cancelled) setSeeded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) {
    return (
      <SafeAreaProvider>
        <ScrollView contentContainerStyle={styles.picker}>
          <Text style={styles.title}>{VISUAL_HARNESS_MARKER}</Text>
          <Text style={styles.note}>{COPY.appName} — D-057 visual gate</Text>
          {SCENE_IDS.map((key) => (
            <Pressable key={key} onPress={() => setId(key)} style={styles.row} testID={`scene-${key}`}>
              <Text style={styles.rowKey}>{key}</Text>
              <Text style={styles.rowLabel}>{`${SCENES[key].label}  ·  ${SCENES[key].frame}`}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaProvider>
    );
  }

  if (!seeded) return <View style={styles.blank} />;
  return (
    <SafeAreaProvider>
      <AppStoreProvider>
        <Stage scene={SCENES[id]} />
      </AppStoreProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  blank: { flex: 1, backgroundColor: color.background },
  picker: { padding: 20, gap: 10, backgroundColor: color.background, minHeight: '100%' },
  title: { fontFamily: fontFamily.display, fontSize: 18, color: color.ink },
  note: { fontFamily: fontFamily.body, fontSize: 12, color: color.inkMuted, marginBottom: 8 },
  row: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: color.rule },
  rowKey: { fontFamily: fontFamily.bodySemi, fontSize: 14, color: color.accent },
  rowLabel: { fontFamily: fontFamily.body, fontSize: 12, color: color.inkMuted },
});
