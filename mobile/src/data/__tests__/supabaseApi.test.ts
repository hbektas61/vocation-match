/**
 * The parts of `SupabaseApi` that decide something rather than passing the
 * server's answer through: what happens to the session after a deletion, and
 * the one call that turns a returned value back into an error.
 *
 * H-204, H-205.
 *
 * This exercises `SupabaseApi`, not the in-memory fake, because the thing under
 * test is specific to it: the token lives in device storage, and after the
 * account is gone that token is a key to nothing. If it survives, the app comes
 * back on the next launch holding credentials for a user that does not exist —
 * which looks to the person like the deletion did not happen.
 *
 * The network is stubbed at `fetch`. Nothing here proves the server behaviour;
 * that is `supabase/tests/012_account_deletion.sql`.
 */
import { FAKE_PHONE_OTP, FakeApi } from '../fakeApi';
import { SupabaseApi } from '../supabaseApi';
import { createMemoryStorage } from '../secureStorage';

const URL = 'https://test.supabase.co';
const ANON_KEY = 'test-anon-key';
// Named explicitly by SupabaseApi rather than derived from the project ref,
// so the deletion path can clear it by hand without guessing.
const STORAGE_KEY = 'vocation-match-auth-token';
const USER_ID = '00000000-0000-4000-8000-000000000001';

function storedSession() {
  return JSON.stringify({
    access_token: 'access-token',
    token_type: 'bearer',
    refresh_token: 'refresh-token',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      phone: '+905551110001',
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  });
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

async function apiWithSession(rpcHandler: () => Response) {
  const storage = createMemoryStorage();
  await storage.setItem(STORAGE_KEY, storedSession());

  const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    void init;
    const url = String(input);
    if (url.includes('/rpc/delete_my_account')) {
      return rpcHandler();
    }
    // Anything else the client tries (a token refresh, a server-side sign-out)
    // is answered as if the user is already gone, which is exactly what a real
    // project would answer after the row is deleted.
    return jsonResponse({ message: 'User from sub claim in JWT does not exist' }, 401);
  });
  global.fetch = fetchMock as unknown as typeof fetch;

  return {
    api: new SupabaseApi({ url: URL, anonKey: ANON_KEY }, storage),
    storage,
    fetchMock,
  };
}

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

describe('SupabaseApi phone OTP', () => {
  function otpApi(handler: (url: string, init?: RequestInit) => Response) {
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
      handler(String(input), init),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    return {
      api: new SupabaseApi({ url: URL, anonKey: ANON_KEY }, createMemoryStorage()),
      fetchMock,
    };
  }

  it('requests one SMS for a normalized E.164 number and allows account creation', async () => {
    const { api, fetchMock } = otpApi(() => jsonResponse({}));

    await api.requestPhoneOtp('+90 (555) 111-00-21');

    const call = fetchMock.mock.calls.find(([input]) => String(input).includes('/auth/v1/otp'));
    expect(call).toBeDefined();
    expect(JSON.parse((call?.[1] as RequestInit).body as string)).toMatchObject({
      phone: '+905551110021',
      create_user: true,
    });
  });

  it('confirms a six-digit SMS code with the sms verification type', async () => {
    const session = JSON.parse(storedSession());
    const { api, fetchMock } = otpApi((url) =>
      url.includes('/auth/v1/verify')
        ? jsonResponse(session)
        : jsonResponse({ message: 'unexpected call' }, 500),
    );

    await expect(api.verifyPhoneOtp('+905551110021', '123456')).resolves.toMatchObject({
      userId: USER_ID,
    });

    const call = fetchMock.mock.calls.find(([input]) => String(input).includes('/auth/v1/verify'));
    expect(call).toBeDefined();
    expect(JSON.parse((call?.[1] as RequestInit).body as string)).toMatchObject({
      phone: '+905551110021',
      token: '123456',
      type: 'sms',
    });
  });

  it('reports a rejected code as OTP_INVALID even when GoTrue returns a generic 401', async () => {
    const { api } = otpApi(() => jsonResponse({ message: 'Invalid login credentials' }, 401));

    await expect(api.verifyPhoneOtp('+905551110021', '000000')).rejects.toMatchObject({
      code: 'OTP_INVALID',
    });
  });

  it('rejects malformed numbers before making a network request', async () => {
    const { api, fetchMock } = otpApi(() => jsonResponse({}));

    await expect(api.requestPhoneOtp('0555 111 00 21')).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('SupabaseApi.deleteAccount', () => {
  it('removes the stored session once the server confirms the deletion', async () => {
    const { api, storage } = await apiWithSession(() => jsonResponse(null));

    await api.deleteAccount();

    expect(await storage.getItem(STORAGE_KEY)).toBeNull();
    expect(await api.currentSession()).toBeNull();
  });

  it('sends no user id — the account comes from the token', async () => {
    const { api, fetchMock } = await apiWithSession(() => jsonResponse(null));

    await api.deleteAccount();

    const call = fetchMock.mock.calls.find(([input]) =>
      String(input).includes('/rpc/delete_my_account'),
    );
    expect(call).toBeDefined();
    const body = (call?.[1] as RequestInit | undefined)?.body as string | undefined;
    // Either no body at all or an empty one. What must not be there is an id:
    // a deletion endpoint that takes one is a deletion endpoint that can be
    // pointed at somebody else.
    expect(body ?? '{}').not.toContain(USER_ID);
  });

  it('keeps the session when the server refuses, and reports the failure', async () => {
    const { api, storage } = await apiWithSession(() =>
      jsonResponse({ code: '42501', message: 'permission denied' }, 403),
    );

    await expect(api.deleteAccount()).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // Still signed in. A screen that had cleared the session here would have
    // shown a login page after a deletion that never happened.
    expect(await storage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(await api.currentSession()).not.toBeNull();
  });
});

/**
 * The same behaviour in the in-memory implementation, which is what every
 * component test runs against. If the two drift, a screen can pass its tests
 * while doing the wrong thing against a real project.
 */
describe('FakeApi.deleteAccount', () => {
  const ADULT_BIRTHDATE = '1994-03-01';

  async function signedIn(api = new FakeApi(), phone = '+905551110001'): Promise<FakeApi> {
    await api.requestPhoneOtp(phone);
    await api.verifyPhoneOtp(phone, FAKE_PHONE_OTP);
    await api.saveOwnProfile({ displayName: 'Deniz', birthdate: ADULT_BIRTHDATE });
    return api;
  }

  it('leaves no record of the account anywhere', async () => {
    const api = await signedIn();
    const before = (await api.getOwnProfile())!.id;
    await api.uploadProfilePhoto({ uri: 'file:///tmp/pick.jpg', mimeType: 'image/jpeg' });
    await api.setActiveHotel('hotel-lara-shore');
    await api.declareUpcomingStay('2026-08-01', '2026-08-08');
    const swiped = await api.swipe('cand-derya', 'UPCOMING', 'LIKE');
    expect(swiped.matched).toBe(true);
    await api.sendMessage(swiped.matchId!, 'Hello');
    await api.blockUser('cand-mert');
    // Asserted so the check below cannot pass on an account that had nothing.
    expect(api.recordsFor(before)).toBeGreaterThan(6);

    await api.deleteAccount();

    // Looks at the stored records rather than at the public API, because every
    // public call fails for lack of a session first and would pass whether or
    // not anything was actually removed.
    expect(api.recordsFor(before)).toBe(0);
    expect(await api.currentSession()).toBeNull();
    await expect(api.verifyPhoneOtp('+905551110001', FAKE_PHONE_OTP)).rejects.toMatchObject({
      code: 'OTP_INVALID',
    });
  });

  it('leaves everyone else alone', async () => {
    const api = await signedIn();
    await api.setActiveHotel('hotel-lara-shore');
    await api.signOut();

    await signedIn(api, '+905551110002');
    await api.setActiveHotel('hotel-lara-shore');
    await api.declareUpcomingStay('2026-08-01', '2026-08-08');
    const survivor = (await api.getOwnProfile())!.id;
    await api.signOut();

    await api.verifyPhoneOtp('+905551110001', FAKE_PHONE_OTP);
    await api.deleteAccount();

    await api.verifyPhoneOtp('+905551110002', FAKE_PHONE_OTP);
    expect(api.recordsFor(survivor)).toBeGreaterThan(3);
    expect((await api.getActiveHotel())?.hotelId).toBe('hotel-lara-shore');
  });

  it('needs a session', async () => {
    const api = await signedIn();
    await api.signOut();
    await expect(api.deleteAccount()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});

describe('SupabaseApi.deleteAccount — an answer that never arrived', () => {
  it('treats "that account no longer exists" as done, not as a failure', async () => {
    // The retry after a lost response. The account really is gone, so telling
    // the person it still exists would be the wrong answer, and leaving the
    // token on the device would be worse.
    const { api, storage } = await apiWithSession(() =>
      jsonResponse({ code: 'P0002', message: 'That account no longer exists.' }, 400),
    );

    await expect(api.deleteAccount()).resolves.toBeUndefined();

    expect(await storage.getItem(STORAGE_KEY)).toBeNull();
    expect(await api.currentSession()).toBeNull();
  });
});

/**
 * The one piece of `SupabaseApi` that turns a *returned* value back into an
 * error, rather than passing a server error through.
 *
 * `public.swipe` answers "that person is not in this room" by returning
 * `refused` instead of raising, so that the rate-limit row it wrote a moment
 * earlier survives the statement — a raise would roll both back together. That
 * makes the mapping here load-bearing: if it were dropped, the app would show
 * an empty card as a successful pass.
 */
describe('SupabaseApi.swipe', () => {
  function swipeApi(row: Record<string, unknown>) {
    const storage = createMemoryStorage();
    global.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes('/rpc/swipe')) {
        return jsonResponse([row]);
      }
      return jsonResponse({ message: 'unexpected call' }, 500);
    }) as unknown as typeof fetch;
    return new SupabaseApi({ url: URL, anonKey: ANON_KEY }, storage);
  }

  it('turns a refusal into the same error the person has always seen', async () => {
    const api = swipeApi({ matched: false, match_id: null, refused: 'NOT_IN_ROOM' });

    await expect(api.swipe('someone', 'HERE_NOW', 'LIKE')).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'That person is not in this room.',
    });
  });

  it('passes an ordinary answer straight through', async () => {
    const api = swipeApi({ matched: true, match_id: 'match-1', refused: null });

    await expect(api.swipe('someone', 'HERE_NOW', 'LIKE')).resolves.toEqual({
      matched: true,
      matchId: 'match-1',
    });
  });
});
