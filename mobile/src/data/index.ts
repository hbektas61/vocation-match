/**
 * Chooses the backend implementation.
 *
 * With `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` set the
 * app talks to a real project; without them it runs on the in-memory fake so
 * the build stays usable and testable with no credentials present.
 */
import { readBackendConfig } from './config';
import type { VocationApi } from './contracts';
import { FakeApi } from './fakeApi';
import { SupabaseApi } from './supabaseApi';

export * from './contracts';
export { FakeApi } from './fakeApi';
export { hasBackendConfig, readBackendConfig } from './config';
export {
  deviceLocation,
  deniedLocation,
  fixedLocation,
  type ForegroundLocationReader,
  type LocationOutcome,
} from './foregroundLocation';

let instance: VocationApi | null = null;

export function getApi(): VocationApi {
  if (!instance) {
    const config = readBackendConfig();
    if (config) {
      instance = new SupabaseApi(config);
    } else {
      instance = new FakeApi();
    }
  }
  return instance;
}

/** Test seam: replace the process-wide client. */
export function setApi(api: VocationApi | null): void {
  instance = api;
}
