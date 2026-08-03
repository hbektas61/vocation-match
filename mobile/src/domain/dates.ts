/**
 * Calendar dates in the app's own words.
 *
 * This file exists because a phone printed "Aug 3" on a Turkish screen.
 * `toLocaleDateString` needs locale data the runtime may not carry — Hermes
 * on device answered in English what jsdom in tests answered correctly, the
 * same divergence that once printed "TR" where "Türkiye" belonged (see
 * `countryNames.ts`). Twelve month names per language is not a job worth an
 * ICU dependency, so the app owns them.
 *
 * Everything here parses the ISO string directly. A `Date` round-trip is a
 * timezone hazard — the calendar date a person declared must never shift a
 * day because of where their phone woke up — and the callers that used
 * `new Date(`${iso}T12:00:00`)` were each re-defending against that
 * individually. Splitting the string defends by construction.
 */
import { getLocale } from '../copy';

const SHORT_MONTHS = {
  tr: ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
} as const;

const LONG_MONTHS = {
  tr: [
    'Ocak',
    'Şubat',
    'Mart',
    'Nisan',
    'Mayıs',
    'Haziran',
    'Temmuz',
    'Ağustos',
    'Eylül',
    'Ekim',
    'Kasım',
    'Aralık',
  ],
  en: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
} as const;

/** `YYYY-MM-DD` → its calendar parts, with no `Date` in between. */
function parts(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split('-').map(Number);
  return { year, month, day };
}

/** "3 Ağu" / "Aug 3" — the short line a card carries. */
export function formatDayMonth(iso: string): string {
  const { month, day } = parts(iso);
  const name = SHORT_MONTHS[getLocale()][month - 1] ?? '';
  return getLocale() === 'tr' ? `${day} ${name}` : `${name} ${day}`;
}

/** "19 Ağustos" / "August 19" — the month said in full, as the event cards say it. */
export function formatDayMonthLong(iso: string): string {
  const { month, day } = parts(iso);
  const name = LONG_MONTHS[getLocale()][month - 1] ?? '';
  return getLocale() === 'tr' ? `${day} ${name}` : `${name} ${day}`;
}

/** "12 Ağustos 2026" / "August 12, 2026" — the sheet's full date. */
export function formatLongDate(iso: string): string {
  const { year, month, day } = parts(iso);
  const name = LONG_MONTHS[getLocale()][month - 1] ?? '';
  return getLocale() === 'tr' ? `${day} ${name} ${year}` : `${name} ${day}, ${year}`;
}

/**
 * "12–17 Ağustos" / "August 12–17" — a stay, said the way T-01 draws it:
 * one month named once when the whole stay lives inside it, and two short
 * dates joined by a dash when it does not.
 */
export function formatStayRangeLabel(startIso: string, endIso: string): string {
  const a = parts(startIso);
  const b = parts(endIso);
  if (a.year === b.year && a.month === b.month) {
    const name = LONG_MONTHS[getLocale()][a.month - 1] ?? '';
    return getLocale() === 'tr'
      ? `${a.day}–${b.day} ${name}`
      : `${name} ${a.day}–${b.day}`;
  }
  return `${formatDayMonth(startIso)} – ${formatDayMonth(endIso)}`;
}
