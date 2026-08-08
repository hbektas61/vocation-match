/**
 * The month names, in both languages, for the reason the file itself gives:
 * a runtime without ICU data answers in English whatever the locale says.
 *
 * The suite exists because a date plate on the owner's phone (2026-08-07)
 * printed "7 Aug 2026" over a Turkish "Cuma" — two halves of one plate in two
 * languages. Only the second half was this file's work; the first was iOS's
 * compact picker printing its own value in the device's language. Both halves
 * are pinned here now, because the fault was that they could disagree at all.
 */
import { setLocale } from '../../copy';
import {
  formatDayMonth,
  formatDayMonthLong,
  formatLongDate,
  formatStayRangeLabel,
  formatWeekday,
  languageTag,
} from '../dates';

/** A Friday in August: the exact date the owner's screenshot was taken on. */
const REPORTED = '2026-08-07';

afterEach(() => setLocale('en'));

describe('the plate a stay is declared on', () => {
  it('names the month in Turkish when the app is Turkish', () => {
    setLocale('tr');
    expect(formatDayMonthLong(REPORTED)).toBe('7 Ağustos');
    expect(formatWeekday(REPORTED)).toBe('Cuma');
  });

  it('names it in English when the app is English', () => {
    setLocale('en');
    expect(formatDayMonthLong(REPORTED)).toBe('August 7');
    expect(formatWeekday(REPORTED)).toBe('Friday');
  });

  it('puts the day before the month in Turkish and after it in English', () => {
    // Not a formatting nicety: "7 Ağustos" and "August 7" are the two orders,
    // and a shared template would have to pick one and be wrong somewhere.
    setLocale('tr');
    expect(formatDayMonth(REPORTED)).toBe('7 Ağu');
    expect(formatLongDate(REPORTED)).toBe('7 Ağustos 2026');
    expect(formatStayRangeLabel('2026-08-07', '2026-08-12')).toBe('7–12 Ağustos');
    setLocale('en');
    expect(formatDayMonth(REPORTED)).toBe('Aug 7');
    expect(formatLongDate(REPORTED)).toBe('August 7, 2026');
    expect(formatStayRangeLabel('2026-08-07', '2026-08-12')).toBe('August 7–12');
  });
});

describe('the tag handed to a control that prints its own date', () => {
  it('follows the app, not the device', () => {
    // The whole defect: iOS's picker asked the *phone* what language it was
    // in. A Turkish app on an English phone is a supported combination.
    setLocale('tr');
    expect(languageTag()).toBe('tr-TR');
    setLocale('en');
    expect(languageTag()).toBe('en-US');
  });
});
