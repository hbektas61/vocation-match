/**
 * The database speaks SQLSTATE; the UI speaks error codes. This is the
 * translation, and it is the reason a rejected write shows the right message
 * instead of a raw Postgres string.
 */
import { toApiError } from '../supabaseApi';

describe('toApiError', () => {
  it('recognises the server-side 18+ trigger', () => {
    const error = toApiError({ code: '23514', message: 'Vocation Match is 18+ only.' }, 'fallback');
    expect(error.code).toBe('UNDER_AGE');
    expect(error.message).toBe('Vocation Match is 18+ only.');
  });

  it('treats other check violations as invalid input', () => {
    expect(
      toApiError({ code: '23514', message: 'profiles_display_name_length' }, 'fallback').code,
    ).toBe('INVALID_INPUT');
  });

  it('tells a suspension apart from any other refusal', () => {
    expect(toApiError({ code: '42501', message: 'Your account is suspended.' }, 'x').code).toBe(
      'SUSPENDED',
    );
  });

  it('maps "not signed in" to UNAUTHENTICATED rather than FORBIDDEN', () => {
    expect(toApiError({ code: '28000', message: 'Sign in to continue.' }, 'x').code).toBe(
      'UNAUTHENTICATED',
    );
  });

  it('maps an RLS refusal to FORBIDDEN', () => {
    expect(toApiError({ code: '42501', message: 'new row violates policy' }, 'x').code).toBe(
      'FORBIDDEN',
    );
  });

  it('maps a unique violation to CONFLICT', () => {
    expect(toApiError({ code: '23505', message: 'duplicate key' }, 'x').code).toBe('CONFLICT');
  });

  it('maps bad credentials to UNAUTHENTICATED', () => {
    expect(toApiError({ status: 400, message: 'Invalid login credentials' }, 'x').code).toBe(
      'UNAUTHENTICATED',
    );
  });

  it('maps transport failures to NETWORK', () => {
    expect(toApiError({ message: 'TypeError: fetch failed' }, 'x').code).toBe('NETWORK');
  });

  it('falls back without losing the message', () => {
    expect(toApiError(null, 'Could not save your profile.')).toMatchObject({
      code: 'UNKNOWN',
      message: 'Could not save your profile.',
    });
  });
});
