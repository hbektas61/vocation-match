/**
 * Backend configuration. Values come from the environment only — no URL and
 * no key is committed to the repository. Copy `.env.example` to `.env.local`
 * and fill it in to point the app at a real Supabase project.
 *
 * Both values are public client credentials (the anon key is designed to be
 * shipped in a client); row level security is what protects the data.
 */
export interface BackendConfig {
  url: string;
  anonKey: string;
}

export function readBackendConfig(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): BackendConfig | null {
  const url = env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if ((url && !anonKey) || (!url && anonKey)) {
    throw new Error(
      'Both EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are required.',
    );
  }
  if (!url || !anonKey) {
    return null;
  }
  return { url, anonKey };
}

/** The universal-code backend is available only in an explicitly marked preview. */
export function isFakeApiEnabled(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): boolean {
  return ['1', 'true'].includes(env.EXPO_PUBLIC_USE_FAKE_API?.trim().toLowerCase() ?? '');
}

/** True when the app is wired to a real backend rather than the in-memory fake. */
export function hasBackendConfig(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): boolean {
  return readBackendConfig(env) !== null;
}
