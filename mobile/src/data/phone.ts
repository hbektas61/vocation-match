/**
 * Supabase phone auth expects E.164. Spaces, parentheses and dashes are only
 * presentation; the leading `+` and country code are part of the identity.
 */
export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  return `${trimmed.startsWith('+') ? '+' : ''}${trimmed.replace(/\D/g, '')}`;
}

export function isE164Phone(value: string): boolean {
  return /^\+[\d\s()-]+$/.test(value.trim()) && /^\+[1-9]\d{7,14}$/.test(normalizePhone(value));
}

/** Safe confirmation text for a screen that may appear in app-switcher snapshots. */
export function maskPhone(value: string): string {
  const digits = normalizePhone(value).replace(/\D/g, '');
  return `+••••••${digits.slice(-4)}`;
}
