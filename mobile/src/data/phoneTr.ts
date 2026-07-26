/**
 * Turkish mobile numbers, for the one screen that asks for one.
 *
 * Deliberately separate from `phone.ts`. That module knows E.164 in general
 * and is what the API boundary uses; this one knows a single country and is
 * what the onboarding field uses. Keeping them apart is what lets the field be
 * strict — ten digits beginning with a five — without narrowing what the rest
 * of the app can ever accept.
 *
 * The `+90` is not placeholder text. It is drawn as a permanent part of the
 * control and never enters the editable value, so there is no way to delete
 * half of it and no way to end up with a number that is missing its country.
 * Everything here therefore talks in *national* digits, and E.164 is produced
 * once, at the edge.
 */

/** Turkish mobile subscriber numbers: ten digits, and they all begin with 5. */
const NATIONAL_LENGTH = 10;

/**
 * What somebody actually meant, from whatever they typed or pasted.
 *
 * People paste `0532…`, `+90 532…`, `90532…` and `532 123 45 67`, and all four
 * mean the same number. The alternative to reading them is rejecting them,
 * which reads as the app being broken rather than as the paste being wrong.
 */
export function toNationalDigits(input: string): string {
  let digits = input.replace(/\D/g, '');

  // Country code, however it arrived. Only stripped when what remains is the
  // right length, so a number that merely happens to start with 90 survives.
  if (digits.startsWith('90') && digits.length > NATIONAL_LENGTH) {
    digits = digits.slice(2);
  }
  // The trunk prefix, which is how the number is written down everywhere in
  // the country and is not part of the international form.
  if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  return digits.slice(0, NATIONAL_LENGTH);
}

/** `532 123 45 67` — how the number is read aloud, so it is how it is shown. */
export function formatNationalTr(digits: string): string {
  const d = digits.slice(0, NATIONAL_LENGTH);
  const parts = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10)];
  return parts.filter(Boolean).join(' ');
}

export type PhoneProblem = 'EMPTY' | 'INCOMPLETE' | 'NOT_MOBILE';

/**
 * Why a number is not usable yet, or `null` when it is.
 *
 * Three answers rather than one, because "check your number" tells somebody
 * nothing about which part of it to look at.
 */
export function nationalTrProblem(digits: string): PhoneProblem | null {
  if (digits.length === 0) return 'EMPTY';
  // Checked before length: a landline typed in full is complete and still
  // wrong, and "too short" would be a lie about it.
  if (!digits.startsWith('5')) return 'NOT_MOBILE';
  if (digits.length < NATIONAL_LENGTH) return 'INCOMPLETE';
  return null;
}

export function isValidNationalTr(digits: string): boolean {
  return nationalTrProblem(digits) === null;
}

/** The only form the API ever sees. */
export function toE164Tr(digits: string): string {
  return `+90${digits}`;
}
