import { isFakeApiEnabled, readBackendConfig } from '../config';
import { getApi, setApi } from '../index';

describe('backend configuration', () => {
  const originalUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const originalFake = process.env.EXPO_PUBLIC_USE_FAKE_API;

  afterEach(() => {
    restoreEnv('EXPO_PUBLIC_SUPABASE_URL', originalUrl);
    restoreEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY', originalKey);
    restoreEnv('EXPO_PUBLIC_USE_FAKE_API', originalFake);
    setApi(null);
  });

  it('accepts a complete public Supabase configuration', () => {
    expect(
      readBackendConfig({
        EXPO_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
        EXPO_PUBLIC_SUPABASE_ANON_KEY: 'publishable-key',
      }),
    ).toEqual({
      url: 'https://test.supabase.co',
      anonKey: 'publishable-key',
    });
  });

  it('rejects a half-configured backend', () => {
    expect(() =>
      readBackendConfig({ EXPO_PUBLIC_SUPABASE_URL: 'https://test.supabase.co' }),
    ).toThrow(/Both EXPO_PUBLIC/);
  });

  it('enables FakeApi only with an explicit preview flag', () => {
    expect(isFakeApiEnabled({})).toBe(false);
    expect(isFakeApiEnabled({ EXPO_PUBLIC_USE_FAKE_API: 'true' })).toBe(true);
  });

  it('fails closed instead of silently selecting the universal preview code', () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.EXPO_PUBLIC_USE_FAKE_API;
    setApi(null);

    expect(() => getApi()).toThrow(/explicit preview build/);
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
