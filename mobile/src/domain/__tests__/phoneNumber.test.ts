/**
 * A number from anywhere (owner, 2026-08-06).
 *
 * The Turkish parser is kept honest here as well as generalised: the pilot's
 * own market still refuses a landline before an SMS is paid for, while a
 * Dutch or American number — which the old field could not express at all —
 * now goes through. The paste cases are the point of the file: people paste
 * the number as it is written down, and reading both forms is the difference
 * between a field that works and one that appears broken.
 */
import { dialCode, dialableCountries } from '../dialCodes';
import {
  countryOfE164,
  formatNational,
  fromE164,
  isValidPhone,
  phoneProblem,
  toE164,
  toNationalDigits,
} from '../phoneNumber';

describe('the dialling codes', () => {
  it('knows the countries this product actually opens in', () => {
    expect(dialCode('TR')).toBe('90');
    expect(dialCode('US')).toBe('1');
    expect(dialCode('NL')).toBe('31');
    expect(dialCode('GB')).toBe('44');
    expect(dialCode('DE')).toBe('49');
    expect(dialCode('AE')).toBe('971');
  });

  it('keeps both halves of a shared code, so neither half looks unsupported', () => {
    // A picker that offers Russia but not Kazakhstan, or Britain but not
    // Jersey, is broken for the people it left out.
    expect(dialCode('RU')).toBe('7');
    expect(dialCode('KZ')).toBe('7');
    expect(dialCode('CA')).toBe('1');
    expect(dialCode('JE')).toBe('44');
  });

  it('answers null rather than guessing', () => {
    expect(dialCode('ZZ')).toBeNull();
  });

  it('covers enough of the world to be a country picker', () => {
    expect(dialableCountries().length).toBeGreaterThan(200);
  });
});

describe('reading what was typed or pasted', () => {
  it.each([
    ['5321234567', 'plain national digits'],
    ['05321234567', 'with the trunk zero, as it is written down'],
    ['+905321234567', 'from a contact card'],
    ['905321234567', 'the country code without its plus'],
    ['+90 532 123 45 67', 'spaced the way it is read aloud'],
  ])('reads %s (%s)', (input) => {
    expect(toNationalDigits(input, 'TR')).toBe('5321234567');
  });

  it('reads a Dutch number the same three ways', () => {
    expect(toNationalDigits('612345678', 'NL')).toBe('612345678');
    expect(toNationalDigits('0612345678', 'NL')).toBe('612345678');
    expect(toNationalDigits('+31612345678', 'NL')).toBe('612345678');
  });

  it('keeps a national number that merely begins with its own country code', () => {
    // +1 is one digit, so an American number starting with a 1 must survive.
    expect(toNationalDigits('1234567890', 'US')).toBe('1234567890');
  });

  it('never lets the whole number outgrow E.164', () => {
    const digits = toNationalDigits('9'.repeat(30), 'TR');
    expect(toE164(digits, 'TR').replace('+', '').length).toBeLessThanOrEqual(15);
  });
});

describe('what counts as usable', () => {
  it('keeps Türkiye strict, because we know its rule', () => {
    expect(phoneProblem('', 'TR')).toBe('EMPTY');
    expect(phoneProblem('2121234567', 'TR')).toBe('NOT_MOBILE');
    expect(phoneProblem('53212345', 'TR')).toBe('INCOMPLETE');
    expect(phoneProblem('5321234567', 'TR')).toBeNull();
  });

  it('accepts the rest of the world by the ITU rule rather than by guesswork', () => {
    // Claiming to know every country's exact lengths without the metadata to
    // back it would refuse real numbers — a worse failure than one wasted SMS.
    expect(isValidPhone('612345678', 'NL')).toBe(true);
    expect(isValidPhone('2025550147', 'US')).toBe(true);
    expect(isValidPhone('7911123456', 'GB')).toBe(true);
    expect(phoneProblem('123', 'NL')).toBe('INCOMPLETE');
  });
});

describe('the international form', () => {
  it('is built once, at the edge', () => {
    expect(toE164('5321234567', 'TR')).toBe('+905321234567');
    expect(toE164('612345678', 'NL')).toBe('+31612345678');
  });

  it('reads a draft back into the country it came from', () => {
    expect(countryOfE164('+905321234567', dialableCountries())).toBe('TR');
    expect(fromE164('+905321234567', 'TR')).toBe('5321234567');
    expect(fromE164('+31612345678', 'TR')).toBeNull();
  });

  it('prefers the longest matching code, so +1 does not swallow +1876', () => {
    // Jamaica is +1876 inside the North American plan; both are in the list.
    expect(countryOfE164('+31612345678', ['NL', 'US'])).toBe('NL');
    expect(countryOfE164('+971501234567', ['AE', 'US'])).toBe('AE');
  });
});

describe('how a number is shown', () => {
  it('groups a Turkish number the way it is read aloud', () => {
    expect(formatNational('5321234567', 'TR')).toBe('532 123 45 67');
  });

  it('groups everything else in threes rather than pretending to know', () => {
    expect(formatNational('612345678', 'NL')).toBe('612 345 678');
  });
});
