/**
 * The one place the app speaks from — now in two languages.
 *
 * `COPY` is a live module binding: `setLocale` reassigns it and every importer
 * sees the new language on its next render. Call sites did not change when the
 * second language arrived, which is the point of the arrangement — a screen
 * says `COPY.chat.title` and never knows which language it is speaking.
 *
 * The re-render itself is the store's job: `SET_LOCALE` changes app state, the
 * tree re-renders, and every `COPY.…` read resolves against the new binding.
 * A deliberately boring mechanism — no context, no proxy — because a proxy
 * over an empty target is invisible to `Object.entries`, which is exactly how
 * the trust-copy audit walks these sentences. The audit must see everything.
 *
 * English is the shape (`Copy` in `i18n/en.ts`); Turkish must match it key for
 * key or the build fails, which is what stops a sentence shipping in one
 * language only.
 */
import type { ApiErrorCode, ReportReason, RoomKey, RoomStatus } from './data';
import type { DateProblem } from './domain/dateInput';
import { en, enFor, type Copy, type CopyFor } from './i18n/en';
import { tr, trFor } from './i18n/tr';

export type Locale = 'en' | 'tr';

let locale: Locale = 'en';

export let COPY: Copy = en;
export let COPY_FOR: CopyFor = enFor;

export function setLocale(next: Locale): void {
  locale = next;
  COPY = next === 'tr' ? tr : en;
  COPY_FOR = next === 'tr' ? trFor : enFor;
}

export function getLocale(): Locale {
  return locale;
}

/**
 * Uppercase that speaks the current language. CSS-style `textTransform:
 * 'uppercase'` turns the Turkish i into I instead of İ — "Giriş" became
 * "GIRIŞ" on a real screen — so every tracked label goes through here
 * instead.
 */
export function upperCase(text: string): string {
  return text.toLocaleUpperCase(locale === 'tr' ? 'tr-TR' : 'en-US');
}

/**
 * Why a birthdate was refused, in words that name the part to look at.
 *
 * Shared by onboarding and profile editing, because the two screens asking the
 * same question and answering it differently is how copy drifts.
 */
export function birthdateMessage(problem: DateProblem | null): string {
  switch (problem) {
    case 'INVALID':
      return COPY.profileSetup.invalidBirthdate;
    case 'FUTURE':
      return COPY.profileSetup.futureBirthdate;
    case 'UNDERAGE':
      return COPY.profileSetup.underAge;
    default:
      return COPY.profileSetup.incompleteBirthdate;
  }
}

/** Maps a typed `ApiError.code` onto reviewed, trust-copy-safe user text. */
export function apiErrorMessage(code: ApiErrorCode): string {
  switch (code) {
    case 'UNAUTHENTICATED':
      return COPY.errors.unauthenticated;
    case 'OTP_INVALID':
      return COPY.errors.otpInvalid;
    case 'SUSPENDED':
      return COPY.errors.suspended;
    case 'FORBIDDEN':
      return COPY.errors.forbidden;
    case 'UNDER_AGE':
      return COPY.errors.underAge;
    case 'INVALID_INPUT':
      return COPY.errors.invalidInput;
    case 'NOT_FOUND':
      return COPY.errors.notFound;
    case 'CONFLICT':
      return COPY.errors.conflict;
    case 'RATE_LIMITED':
      return COPY.errors.rateLimited;
    case 'PREMIUM_REQUIRED':
      return COPY.errors.premiumRequired;
    case 'NETWORK':
      return COPY.errors.network;
    case 'UNKNOWN':
    default:
      return COPY.errors.unknown;
  }
}

/**
 * The server decides room eligibility; this only translates its `reason`
 * into the reviewed explanation for the matching room (D-002, owner
 * decision D-007 — never claims a reservation or hotel approval).
 */
export function roomStatusExplanation(room: RoomKey, status: RoomStatus): string {
  if (room === 'NEARBY') {
    // Çevremde's status is its own vocabulary (D-039): a check-in clock,
    // not a stay or a proximity answer.
    return status.eligible ? COPY.checkin.statusOpen : COPY.checkin.statusClosed;
  }
  if (status.reason === 'ELIGIBLE') {
    return room === 'UPCOMING' ? COPY.roomReason.ELIGIBLE_UPCOMING : COPY.roomReason.ELIGIBLE_HERE_NOW;
  }
  return COPY.roomReason[status.reason];
}

/** The plate label for a room, wherever a match or card wears it. */
export function roomPlate(room: RoomKey): string {
  if (room === 'UPCOMING') return COPY.rooms.upcomingPlate;
  if (room === 'HERE_NOW') return COPY.rooms.hereNowPlate;
  return COPY.rooms.nearbyPlate;
}

/** Fixed, reviewed labels for the report-reason picker. */
export function reportReasonLabel(reason: ReportReason): string {
  return COPY.safety.reasons[reason];
}
