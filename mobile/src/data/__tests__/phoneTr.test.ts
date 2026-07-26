/**
 * The paste cases are the point of this file.
 *
 * A field with a fixed `+90` in front of it invites exactly the input it
 * cannot take literally: people paste the number as it is written down, which
 * in Turkey means a leading zero, and people paste it from a contact card,
 * which means a leading +90. Reading both is the difference between a field
 * that works and one that appears broken to anyone who does not type numbers
 * digit by digit.
 */
import {
  formatNationalTr,
  isValidNationalTr,
  nationalTrProblem,
  toE164Tr,
  toNationalDigits,
} from '../phoneTr';

describe('reading what was typed or pasted', () => {
  it.each([
    ['5321234567', 'plain national digits'],
    ['05321234567', 'with the trunk zero, as it is written down'],
    ['+905321234567', 'from a contact card'],
    ['905321234567', 'the country code without its plus'],
    ['+90 532 123 45 67', 'spaced the way it is read aloud'],
    ['0532-123-45-67', 'hyphenated'],
    ['(0532) 123 45 67', 'with the trunk code bracketed'],
    [' +90 532 123 45 67 ', 'with stray whitespace'],
  ])('reads %s — %s', (input) => {
    expect(toNationalDigits(input)).toBe('5321234567');
  });

  it('throws away letters rather than choking on them', () => {
    expect(toNationalDigits('0532abc1234567')).toBe('5321234567');
  });

  it('never returns more than the ten digits a number has', () => {
    expect(toNationalDigits('05321234567890')).toHaveLength(10);
  });

  it('keeps a partial number partial while it is being typed', () => {
    expect(toNationalDigits('532')).toBe('532');
    expect(toNationalDigits('0532')).toBe('532');
  });
});

describe('what counts as usable', () => {
  it('accepts a complete mobile number', () => {
    expect(isValidNationalTr('5321234567')).toBe(true);
    expect(nationalTrProblem('5321234567')).toBeNull();
  });

  it('refuses an empty field, which is what keeps the action inactive', () => {
    // The owner's rule: `+90` on its own is not a number.
    expect(nationalTrProblem('')).toBe('EMPTY');
    expect(isValidNationalTr('')).toBe(false);
  });

  it('tells a half-typed number apart from a wrong one', () => {
    expect(nationalTrProblem('53212')).toBe('INCOMPLETE');
    // A landline is complete and still not something that can receive an SMS.
    expect(nationalTrProblem('2121234567')).toBe('NOT_MOBILE');
  });

  it('calls a short landline wrong rather than unfinished', () => {
    // Said the other way round, somebody keeps typing to fix a number that
    // more digits will never fix.
    expect(nationalTrProblem('212')).toBe('NOT_MOBILE');
  });

  it('refuses eleven digits, since the eleventh is dropped and never invented', () => {
    expect(isValidNationalTr(toNationalDigits('53212345678'))).toBe(true);
    expect(toNationalDigits('53212345678')).toBe('5321234567');
  });
});

describe('how it is shown and what is sent', () => {
  it('groups the digits the way the number is read aloud', () => {
    expect(formatNationalTr('5321234567')).toBe('532 123 45 67');
  });

  it('groups a partial number without inventing separators after it', () => {
    expect(formatNationalTr('532')).toBe('532');
    expect(formatNationalTr('53212')).toBe('532 12');
    expect(formatNationalTr('')).toBe('');
  });

  it('sends E.164 and nothing else', () => {
    expect(toE164Tr('5321234567')).toBe('+905321234567');
  });

  it('round-trips a pasted contact-card number to the same E.164', () => {
    expect(toE164Tr(toNationalDigits('+90 532 123 45 67'))).toBe('+905321234567');
  });
});
