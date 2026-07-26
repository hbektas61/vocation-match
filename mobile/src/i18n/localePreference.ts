/**
 * Where the language choice sleeps between launches.
 *
 * It rides the same storage adapter as the session — not because a language is
 * a secret, but because that adapter is the one place in the app that already
 * knows how to survive a keychain that refuses to work.
 */
import { createSessionStorage } from '../data/secureStorage';
import type { Locale } from '../copy';

const KEY = 'vocation-match-locale';
const storage = createSessionStorage();

export async function readLocalePreference(): Promise<Locale | null> {
  try {
    const stored = await storage.getItem(KEY);
    return stored === 'tr' || stored === 'en' ? stored : null;
  } catch {
    return null;
  }
}

export async function writeLocalePreference(locale: Locale): Promise<void> {
  try {
    await storage.setItem(KEY, locale);
  } catch {
    // A preference that fails to persist costs one extra tap next launch;
    // failing the flow over it would cost more.
  }
}
