/**
 * A phone number from anywhere, for the one screen that asks for one.
 *
 * D-022 fixed the field to `+90` and put a Turkey-only parser behind it, which
 * was right while the pilot was Turkish and wrong the moment somebody in
 * Amsterdam opens the app (owner, 2026-08-06). The country is now a choice, so
 * this module knows two things instead of one country:
 *
 *  - **Turkey, strictly.** Ten digits beginning with a five. The pilot's own
 *    market keeps the rule that rejects a landline before an SMS is paid for.
 *  - **Everywhere else, by the ITU's rule.** E.164 allows at most fifteen
 *    digits including the country code, and no national number worth dialling
 *    is shorter than four. Claiming to know each country's exact lengths
 *    without the metadata to back it would refuse real numbers, which is a
 *    worse failure than accepting a wrong one — the SMS that never arrives
 *    says so immediately, and costs one message.
 *
 * The dialling code is drawn beside the box and never enters the editable
 * value, so there is still no way to delete half of it: everything here talks
 * in *national* digits and E.164 is produced once, at the call.
 */
import { dialCode } from './dialCodes';

export type PhoneProblem = 'EMPTY' | 'INCOMPLETE' | 'NOT_MOBILE' | 'TOO_LONG';

/** Turkish mobile subscriber numbers: ten digits, and they all begin with 5. */
const TR_LENGTH = 10;
/** E.164's ceiling, country code included. */
const E164_MAX = 15;
const MIN_NATIONAL = 4;

function maxNational(country: string): number {
  const dial = dialCode(country) ?? '';
  return Math.max(MIN_NATIONAL, E164_MAX - dial.length);
}

/**
 * What somebody actually meant, from whatever they typed or pasted.
 *
 * People paste `0532…`, `+90 532…`, `90532…` and `532 123 45 67`, and all four
 * mean the same number. The alternative to reading them is rejecting them,
 * which reads as the app being broken rather than as the paste being wrong.
 */
export function toNationalDigits(input: string, country: string): string {
  const trimmed = input.trim();
  /** The two ways somebody writes an international number down. */
  const international = trimmed.startsWith('+') || trimmed.startsWith('00');
  let digits = trimmed.replace(/\D/g, '');
  if (international && digits.startsWith('00')) digits = digits.slice(2);
  const dial = dialCode(country);
  const limit = maxNational(country);

  // The country code, however it arrived. Stripping it is only safe when the
  // input said it was international, or when what remains is still clearly a
  // whole number — otherwise an American number beginning with a 1 loses its
  // first digit to the +1 it merely resembles.
  if (dial && digits.startsWith(dial)) {
    const rest = digits.slice(dial.length);
    const strip = international
      ? rest.length >= MIN_NATIONAL
      : country === 'TR'
        ? rest.length === TR_LENGTH
        : dial.length >= 2 && rest.length >= 6;
    if (strip) digits = rest;
  }
  // The trunk prefix. Written on every domestic number in most of the world
  // and never part of the international form. North America has no trunk zero,
  // so a leading zero there is somebody's typo rather than a prefix — either
  // way dropping it is what they meant.
  if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  return digits.slice(0, limit);
}

/** `532 123 45 67` — how a number is read aloud, so it is how it is shown. */
export function formatNational(digits: string, country: string): string {
  if (country === 'TR') {
    const d = digits.slice(0, TR_LENGTH);
    return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10)].filter(Boolean).join(' ');
  }
  // Everywhere else: threes, which is how most of the world groups digits and
  // is honest about the fact that we do not know this country's own habit.
  return (digits.match(/.{1,3}/g) ?? []).join(' ');
}

/**
 * Why a number is not usable yet, or `null` when it is.
 *
 * Distinct answers rather than one, because "check your number" tells somebody
 * nothing about which part of it to look at.
 */
export function phoneProblem(digits: string, country: string): PhoneProblem | null {
  if (digits.length === 0) return 'EMPTY';
  if (country === 'TR') {
    if (!digits.startsWith('5')) return 'NOT_MOBILE';
    if (digits.length < TR_LENGTH) return 'INCOMPLETE';
    return null;
  }
  if (digits.length > maxNational(country)) return 'TOO_LONG';
  if (digits.length < 6) return 'INCOMPLETE';
  return null;
}

export function isValidPhone(digits: string, country: string): boolean {
  return phoneProblem(digits, country) === null;
}

/** The one place the international form is built. */
export function toE164(digits: string, country: string): string {
  const dial = dialCode(country) ?? '';
  return `+${dial}${digits}`;
}

/**
 * The national digits inside an E.164 number, for a draft coming back the
 * other way. Returns null when the number does not belong to that country.
 */
export function fromE164(value: string, country: string): string | null {
  const dial = dialCode(country);
  const digits = value.replace(/\D/g, '');
  if (!dial || !digits.startsWith(dial)) return null;
  return digits.slice(dial.length);
}

/**
 * Which country an E.164 number belongs to, when it can be told. Longest
 * dialling code first, so +1 does not win a number that begins +1876.
 */
export function countryOfE164(value: string, candidates: string[]): string | null {
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  let best: { code: string; dial: string } | null = null;
  for (const code of candidates) {
    const dial = dialCode(code);
    if (!dial || !digits.startsWith(dial)) continue;
    if (!best || dial.length > best.dial.length) best = { code, dial };
  }
  return best?.code ?? null;
}
