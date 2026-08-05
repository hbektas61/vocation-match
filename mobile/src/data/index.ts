/**
 * Chooses the backend implementation.
 *
 * With `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` set the
 * app talks to a real project. The in-memory backend is deliberately opt-in:
 * a missing production/staging configuration must fail closed instead of
 * quietly exposing the preview build's universal OTP.
 */
import { isFakeApiEnabled, readBackendConfig } from './config';
import type { VocationApi } from './contracts';
import { FakeApi } from './fakeApi';
import { SupabaseApi } from './supabaseApi';

export * from './contracts';
export { FAKE_PHONE_OTP, FakeApi } from './fakeApi';
export { isE164Phone, maskPhone, normalizePhone } from './phone';
export {
  formatNationalTr,
  isValidNationalTr,
  nationalTrProblem,
  toE164Tr,
  toNationalDigits,
  type PhoneProblem,
} from './phoneTr';
export { hasBackendConfig, isFakeApiEnabled, readBackendConfig } from './config';
export {
  describeNeighborhood,
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
    } else if (isFakeApiEnabled()) {
      instance = new FakeApi();
    } else {
      throw new Error(
        'Backend configuration is missing. Use an explicit preview build to enable FakeApi.',
      );
    }
  }
  return instance;
}

/** Test seam: replace the process-wide client. */
export function setApi(api: VocationApi | null): void {
  instance = api;
}
