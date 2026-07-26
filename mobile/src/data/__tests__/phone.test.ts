import { isE164Phone, maskPhone, normalizePhone } from '../phone';

describe('phone numbers at the auth boundary', () => {
  it('normalizes presentation characters without changing the country code', () => {
    expect(normalizePhone(' +90 (555) 111-22-33 ')).toBe('+905551112233');
  });

  it('masks the number before it is rendered on the OTP screen', () => {
    expect(maskPhone('+90 (555) 111-22-33')).toBe('+••••••2233');
  });

  it.each([
    '+905551112233',
    '+442071838750',
    '+12025550123',
  ])('accepts an E.164 number: %s', (phone) => {
    expect(isE164Phone(phone)).toBe(true);
  });

  it.each([
    '05551112233',
    '+0123456789',
    '+90 call-me',
    '+1234567',
    '+1234567890123456',
  ])('rejects a malformed or non-E.164 number: %s', (phone) => {
    expect(isE164Phone(phone)).toBe(false);
  });
});
