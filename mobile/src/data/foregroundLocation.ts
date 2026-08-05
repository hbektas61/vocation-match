/**
 * One foreground location read, and nothing else.
 *
 * This is the only place in the app that touches the device's location. The
 * reading is handed straight to `recordPresenceCheck`, which answers with a
 * boolean, and then it is gone: it is never stored, logged, put in app state,
 * or shown (owner decision D-005).
 *
 * Foreground only. `app.json` blocks ACCESS_BACKGROUND_LOCATION on Android and
 * leaves background modes off on iOS, so there is no code path that could
 * follow anyone around.
 */
import * as Location from 'expo-location';

export type LocationOutcome =
  | {
      status: 'granted';
      latitude: number;
      longitude: number;
      /**
       * The radius the device believes the fix is good to, in metres, or null
       * when it would not say. Travels no further than the presence check
       * (V-010): the server refuses to learn a venue's coarse cell from a fix
       * vaguer than the cell, and a reading with no stated accuracy is not
       * evidence about anywhere.
       */
      accuracyMeters: number | null;
    }
  | { status: 'denied' }
  | { status: 'unavailable' };

export interface ForegroundLocationReader {
  read(): Promise<LocationOutcome>;
}

export const deviceLocation: ForegroundLocationReader = {
  async read(): Promise<LocationOutcome> {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        return { status: 'denied' };
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      return {
        status: 'granted',
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy ?? null,
      };
    } catch {
      // A simulator with no location fix, an airplane-mode device, or a web
      // browser that refuses geolocation all land here. "Unavailable" is
      // distinct from "denied" so the UI can say something true.
      return { status: 'unavailable' };
    }
  },
};

/**
 * Names the neighbourhood a reading falls in, for the reader's own eyes only
 * (owner, 2026-08-05): a check-in card that says "Bulunduğun yer" tells the
 * person nothing — "Kocatepe Mah." does. The platform's own geocoder answers
 * on-device; the name is displayed and never sent anywhere, so D-005's "the
 * reading travels no further than the presence check" still holds. Any
 * failure — no geocoder, no network, an unnamed cell — is simply no name.
 */
export async function describeNeighborhood(
  latitude: number,
  longitude: number,
): Promise<string | null> {
  try {
    const places = await Location.reverseGeocodeAsync({ latitude, longitude });
    const first = places[0];
    if (!first) return null;
    // iOS puts the neighbourhood ("Kocatepe Mahallesi") in `district`;
    // Android often leaves it null and knows only the wider subregion.
    return first.district ?? first.subregion ?? first.city ?? null;
  } catch {
    return null;
  }
}

/** Deterministic reader for tests and for the credential-free demo controls. */
export function fixedLocation(
  latitude: number,
  longitude: number,
  accuracyMeters: number | null = 20,
): ForegroundLocationReader {
  // A simulated reading claims a good fix by default, because that is what a
  // real device standing still reports and what the tests are about.
  return { read: async () => ({ status: 'granted', latitude, longitude, accuracyMeters }) };
}

export function deniedLocation(): ForegroundLocationReader {
  return { read: async () => ({ status: 'denied' }) };
}
