/**
 * The two things worth testing here are the calendar and the clock.
 *
 * The calendar, because `31/02` is the input everyone forgets and the one that
 * quietly becomes the 3rd of March if you let `Date` normalise it. The clock,
 * because a birthdate converted through local time lands on the previous day
 * for anybody west of Greenwich — a bug that only shows up for some users, in
 * some months, which is the worst kind.
 */
import {
  dateDigitsFromIso,
  dateProblem,
  formatDateInput,
  isoFromDateDigits,
  toDateDigits,
} from '../dateInput';

const TODAY = '2026-07-26';

describe('typing', () => {
  it('adds the separators as they are earned', () => {
    expect(formatDateInput('')).toBe('');
    expect(formatDateInput('0')).toBe('0');
    expect(formatDateInput('01')).toBe('01');
    expect(formatDateInput('013')).toBe('01/3');
    expect(formatDateInput('0103')).toBe('01/03');
    expect(formatDateInput('01031994')).toBe('01/03/1994');
  });

  it('never leaves a trailing separator to be deleted twice', () => {
    // Backspacing from `01/03` gives `01/0`, then `01`. If the slash were
    // added ahead of the segment it precedes, the middle state would be `01/`
    // and one press of backspace would appear to do nothing.
    expect(formatDateInput('010')).toBe('01/0');
    expect(formatDateInput('01')).toBe('01');
  });

  it('takes a pasted date in almost any punctuation', () => {
    for (const pasted of ['01/03/1994', '01.03.1994', '01-03-1994', '01 03 1994']) {
      expect(toDateDigits(pasted)).toBe('01031994');
    }
  });

  it('ignores anything past a full date worth of digits', () => {
    expect(toDateDigits('010319941234')).toBe('01031994');
  });
});

describe('converting to what is stored', () => {
  it('produces ISO, not a localised string', () => {
    expect(isoFromDateDigits('01031994')).toBe('1994-03-01');
  });

  it('round-trips through ISO without moving a day', () => {
    // The timezone trap: this is the assertion that fails if anything in the
    // chain goes through local time.
    expect(dateDigitsFromIso('1994-03-01')).toBe('01031994');
    expect(isoFromDateDigits(dateDigitsFromIso('1994-03-01'))).toBe('1994-03-01');
    expect(isoFromDateDigits(dateDigitsFromIso('1994-01-01'))).toBe('1994-01-01');
    expect(isoFromDateDigits(dateDigitsFromIso('1994-12-31'))).toBe('1994-12-31');
  });

  it('refuses a date the calendar does not have', () => {
    expect(isoFromDateDigits('31021994')).toBeNull();
    expect(isoFromDateDigits('32011994')).toBeNull();
    expect(isoFromDateDigits('01131994')).toBeNull();
  });

  it('knows which Februaries have a 29th', () => {
    expect(isoFromDateDigits('29021996')).toBe('1996-02-29');
    expect(isoFromDateDigits('29021995')).toBeNull();
    // 1900 was not a leap year; 2000 was.
    expect(isoFromDateDigits('29021900')).toBeNull();
    expect(isoFromDateDigits('29022000')).toBe('2000-02-29');
  });

  it('gives nothing back for a half-typed date', () => {
    expect(isoFromDateDigits('0103')).toBeNull();
  });
});

describe('why a date is not usable', () => {
  it('accepts an adult’s real birthdate', () => {
    expect(dateProblem('01031994', TODAY)).toBeNull();
  });

  it('does not call a half-typed date invalid', () => {
    expect(dateProblem('', TODAY)).toBe('EMPTY');
    expect(dateProblem('0103', TODAY)).toBe('INCOMPLETE');
  });

  it('calls an impossible date invalid rather than underage', () => {
    // Both are true of `31/02/2020`; only one of them helps.
    expect(dateProblem('31022020', TODAY)).toBe('INVALID');
  });

  it('names a future date as a future date', () => {
    expect(dateProblem('01032030', TODAY)).toBe('FUTURE');
  });

  it('holds the 18+ line exactly', () => {
    // Eighteen today is allowed; eighteen tomorrow is not.
    expect(dateProblem('26072008', TODAY)).toBeNull();
    expect(dateProblem('27072008', TODAY)).toBe('UNDERAGE');
  });

  it('does not move that line by a day in any timezone', () => {
    // Run the boundary again with the process pinned either side of UTC. If
    // any conversion used local time, one of these would disagree.
    const original = process.env.TZ;
    for (const zone of ['UTC', 'Pacific/Kiritimati', 'Pacific/Midway']) {
      process.env.TZ = zone;
      expect(dateProblem('26072008', TODAY)).toBeNull();
      expect(dateProblem('27072008', TODAY)).toBe('UNDERAGE');
      expect(isoFromDateDigits('01031994')).toBe('1994-03-01');
    }
    process.env.TZ = original;
  });
});
