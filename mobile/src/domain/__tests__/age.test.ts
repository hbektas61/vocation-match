import { ageYears, isAdult, parseIsoDate } from '../age';

describe('parseIsoDate', () => {
  it('accepts a real date', () => {
    expect(parseIsoDate('2000-02-29')).toEqual({ year: 2000, month: 2, day: 29 });
  });

  it.each(['2001-02-29', '2026-13-01', '2026-00-10', '2026-1-1', 'yesterday', ''])(
    'rejects %p',
    (value) => {
      expect(parseIsoDate(value)).toBeNull();
    },
  );
});

describe('ageYears', () => {
  it('counts whole years', () => {
    expect(ageYears('1990-07-25', '2026-07-25')).toBe(36);
  });

  it('does not count a birthday that has not happened yet', () => {
    expect(ageYears('1990-07-26', '2026-07-25')).toBe(35);
  });

  it('returns null for an invalid date', () => {
    expect(ageYears('not-a-date', '2026-07-25')).toBeNull();
  });
});

describe('isAdult', () => {
  it('accepts someone who turns 18 today', () => {
    expect(isAdult('2008-07-25', '2026-07-25')).toBe(true);
  });

  it('rejects someone one day short of 18', () => {
    expect(isAdult('2008-07-26', '2026-07-25')).toBe(false);
  });

  it('rejects an unparseable birthdate rather than defaulting to allowed', () => {
    expect(isAdult('', '2026-07-25')).toBe(false);
  });
});
