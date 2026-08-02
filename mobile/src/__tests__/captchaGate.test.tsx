/**
 * The CAPTCHA in front of phone sign-in.
 *
 * Cloudflare publishes dummy site keys precisely so this can be exercised
 * without a production account, and they are what these tests configure:
 *
 *   1x00000000000000000000AA  always passes
 *   2x00000000000000000000AB  always blocks
 *   3x00000000000000000000FF  forces an interactive challenge
 *
 * What is *not* tested here is Cloudflare's widget itself, which needs a real
 * browser and a real device. Everything on our side of that boundary is: the
 * origin allowlist, the message parser, the single-use rule, and — the one
 * that matters most — that no SMS is requested until a token exists.
 */
import { act, renderAsync, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { CaptchaChallenge } from '../components/CaptchaChallenge';
import {
  allowedCaptchaOrigin,
  CaptchaToken,
  captchaRequired,
  parseCaptchaMessage,
} from '../data/captcha';
import { FakeApi, getApi, setApi } from '../data';
import { press } from '../testSupport/interact';
import { requestPhoneCode } from '../testSupport/onboarding';
import App from '../../App';

/** Cloudflare's published test keys. */
const ALWAYS_PASSES = '1x00000000000000000000AA';
const ALWAYS_BLOCKS = '2x00000000000000000000AB';
const PAGE = 'https://captcha.vocationmatch.test/challenge';

const message = (payload: Record<string, unknown>) =>
  JSON.stringify({ source: 'vocation-turnstile', ...payload });

/**
 * Posts a message the way the challenge page would.
 *
 * `url` is the frame it came from, and the component checks it before it reads
 * anything — so it is part of the fixture, not decoration. Wrapped in `act`
 * because the handler sets state: calling `onMessage` bare produced warnings
 * from our own component, which is exactly the noise that hides a real one.
 */
async function postFromPage(payload: Record<string, unknown>, url: string = PAGE) {
  const view = await screen.findByTestId('captcha-challenge-webview');
  await act(async () => {
    view.props.onMessage({ nativeEvent: { data: message(payload), url } });
  });
}

beforeEach(() => {
  setApi(new FakeApi());
  process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY = ALWAYS_PASSES;
  process.env.EXPO_PUBLIC_TURNSTILE_PAGE_URL = PAGE;
});

afterEach(() => {
  delete process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;
  delete process.env.EXPO_PUBLIC_TURNSTILE_PAGE_URL;
});

describe('what the challenge will and will not load', () => {
  it('allows our own page and Cloudflare, and nothing else', () => {
    expect(allowedCaptchaOrigin(`${PAGE}?sitekey=${ALWAYS_PASSES}`)).toBe(true);
    expect(allowedCaptchaOrigin('https://challenges.cloudflare.com/turnstile/v0/api.js')).toBe(true);
    // A redirect the page itself asks for is still a redirect.
    expect(allowedCaptchaOrigin('https://example.com/anything')).toBe(false);
    // The token would be on the wire in clear.
    expect(allowedCaptchaOrigin('http://captcha.vocationmatch.test/challenge')).toBe(false);
    expect(allowedCaptchaOrigin('javascript:alert(1)')).toBe(false);
    expect(allowedCaptchaOrigin('not a url at all')).toBe(false);
  });

  it('refuses everything when no page is configured', () => {
    delete process.env.EXPO_PUBLIC_TURNSTILE_PAGE_URL;
    expect(allowedCaptchaOrigin(`${PAGE}?x=1`)).toBe(false);
  });

  it('will not accept an http page even if one is configured', () => {
    process.env.EXPO_PUBLIC_TURNSTILE_PAGE_URL = 'http://captcha.vocationmatch.test/challenge';
    expect(allowedCaptchaOrigin('http://captcha.vocationmatch.test/challenge')).toBe(false);
  });
});

describe('what the challenge page is allowed to say', () => {
  it('reads the three shapes it knows', () => {
    expect(parseCaptchaMessage(message({ kind: 'success', token: 'tok_abc' }))).toEqual({
      kind: 'success',
      token: 'tok_abc',
    });
    expect(parseCaptchaMessage(message({ kind: 'expired' }))).toEqual({ kind: 'expired' });
    expect(parseCaptchaMessage(message({ kind: 'error', code: 'network' }))).toEqual({
      kind: 'error',
      code: 'network',
    });
  });

  it('ignores anything else, because a WebView hands up whatever the page posts', () => {
    expect(parseCaptchaMessage(message({ kind: 'success' }))).toBeNull();
    expect(parseCaptchaMessage(message({ kind: 'success', token: '' }))).toBeNull();
    expect(parseCaptchaMessage(JSON.stringify({ kind: 'success', token: 'x' }))).toBeNull();
    expect(parseCaptchaMessage('not json')).toBeNull();
    expect(parseCaptchaMessage(message({ kind: 'something-new' }))).toBeNull();
    expect(parseCaptchaMessage(null)).toBeNull();
    expect(parseCaptchaMessage(message({ kind: 'success', token: 'x'.repeat(5000) }))).toBeNull();
  });
});

describe('a token is used once', () => {
  it('is handed over exactly once and then gone', () => {
    const holder = new CaptchaToken('tok_abc');
    expect(holder.spent).toBe(false);
    expect(holder.take()).toBe('tok_abc');
    expect(holder.spent).toBe(true);
    // A second send must solve a fresh challenge rather than replay this one —
    // Cloudflare refuses a token it has seen, and the refusal would reach the
    // person as "the code did not send".
    expect(holder.take()).toBeUndefined();
  });
});

describe('the challenge modal', () => {
  const render = async (onResult: (r: unknown) => void) => {
    await renderAsync(<CaptchaChallenge visible onResult={onResult as never} />);
  };

  it('resolves with the token the page reports', async () => {
    const results: unknown[] = [];
    await render((r) => results.push(r));
    await postFromPage({ kind: 'success', token: 'tok_ok' });
    await waitFor(() => expect(results).toEqual([{ kind: 'token', token: 'tok_ok' }]));
  });

  it('reports a blocked challenge as a failure rather than a token', async () => {
    process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY = ALWAYS_BLOCKS;
    const results: unknown[] = [];
    await render((r) => results.push(r));
    await postFromPage({ kind: 'error', code: 'blocked' });
    await waitFor(() => expect(results).toEqual([{ kind: 'failed', reason: 'error' }]));
  });

  it('reports an expired challenge separately', async () => {
    const results: unknown[] = [];
    await render((r) => results.push(r));
    await postFromPage({ kind: 'expired' });
    await waitFor(() => expect(results).toEqual([{ kind: 'failed', reason: 'expired' }]));
  });

  it('lets somebody leave, and calls that cancelled rather than failed', async () => {
    const results: unknown[] = [];
    await render((r) => results.push(r));
    await press(await screen.findByTestId('captcha-challenge-cancel'));
    await waitFor(() => expect(results).toEqual([{ kind: 'cancelled' }]));
  });

  it('settles once, however many messages arrive', async () => {
    const results: unknown[] = [];
    await render((r) => results.push(r));
    await postFromPage({ kind: 'success', token: 'first' });
    await postFromPage({ kind: 'success', token: 'second' });
    await postFromPage({ kind: 'expired' });
    await waitFor(() => expect(results).toHaveLength(1));
    expect(results[0]).toEqual({ kind: 'token', token: 'first' });
  });

  it('ignores a token posted from any other page on the same host', async () => {
    const results: unknown[] = [];
    await render((r) => results.push(r));
    // Same origin, different path. `source` says the right thing and the JSON
    // is well-formed — the only thing wrong with it is where it came from,
    // and that is the only thing that cannot be forged.
    await postFromPage(
      { kind: 'success', token: 'tok_from_elsewhere' },
      'https://captcha.vocationmatch.test/some-other-page',
    );
    expect(results).toEqual([]);
  });

  it('ignores a token posted straight from Cloudflare', async () => {
    const results: unknown[] = [];
    await render((r) => results.push(r));
    // The widget lives in an iframe and reports to its parent; our page is
    // what calls the bridge. A token arriving from Cloudflare directly is not
    // the flow working.
    await postFromPage(
      { kind: 'success', token: 'tok_from_iframe' },
      'https://challenges.cloudflare.com/cdn-cgi/challenge-platform/',
    );
    expect(results).toEqual([]);
  });

  it('ignores a message with no origin at all', async () => {
    const results: unknown[] = [];
    await render((r) => results.push(r));
    await postFromPage({ kind: 'success', token: 'tok_nowhere' }, '');
    expect(results).toEqual([]);
  });

  it('gives up rather than waiting forever', async () => {
    jest.useFakeTimers();
    try {
      const results: unknown[] = [];
      await render((r) => results.push(r));
      // Nobody answers: no network, a page that never loads, somebody who put
      // the phone down. Advancing the clock is how this is tested without
      // anybody waiting 45 seconds.
      await act(async () => {
        jest.advanceTimersByTime(46_000);
      });
      expect(results).toEqual([{ kind: 'failed', reason: 'timeout' }]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('fails immediately when the build is half-configured', async () => {
    delete process.env.EXPO_PUBLIC_TURNSTILE_PAGE_URL;
    const results: unknown[] = [];
    await render((r) => results.push(r));
    await waitFor(() => expect(results).toEqual([{ kind: 'failed', reason: 'misconfigured' }]));
  });
});

describe('no SMS is requested before a token exists', () => {
  it('does not call the API when the check has not been solved', async () => {
    const api = getApi() as FakeApi;
    const spy = jest.spyOn(api, 'requestPhoneOtp');

    await renderAsync(<App />);
    await requestPhoneCode('+905551110001');

    // The phone step opened the challenge and is waiting on it. This is the
    // assertion the whole feature exists for: the billable endpoint has not
    // been touched.
    expect(await screen.findByTestId('captcha-challenge')).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();

    // Solve it, and only then does the request go — carrying the token.
    await postFromPage({ kind: 'success', token: 'tok_live' });

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy).toHaveBeenCalledWith('+905551110001', 'tok_live');
    spy.mockRestore();
  });

  it('sends nothing at all if the person closes the check', async () => {
    const api = getApi() as FakeApi;
    const spy = jest.spyOn(api, 'requestPhoneOtp');

    await renderAsync(<App />);
    await requestPhoneCode('+905551110002');
    await press(await screen.findByTestId('captcha-challenge-cancel'));

    await waitFor(() => expect(screen.queryByTestId('captcha-challenge')).toBeNull());
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does not send when a success arrives from somewhere else entirely', async () => {
    const api = getApi() as FakeApi;
    const spy = jest.spyOn(api, 'requestPhoneOtp');

    await renderAsync(<App />);
    await requestPhoneCode('+905551110004');
    expect(await screen.findByTestId('captcha-challenge')).toBeTruthy();

    // Well-formed, correctly tagged, and from the wrong page. The billable
    // endpoint stays untouched.
    await postFromPage(
      { kind: 'success', token: 'tok_forged' },
      'https://captcha.vocationmatch.test/evil',
    );

    expect(spy).not.toHaveBeenCalled();
    expect(screen.queryByTestId('captcha-challenge')).toBeTruthy();
    spy.mockRestore();
  });

  it('leaves a build with no site key exactly as it was', async () => {
    delete process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;
    expect(captchaRequired()).toBe(false);
    const api = getApi() as FakeApi;
    const spy = jest.spyOn(api, 'requestPhoneOtp');

    await renderAsync(<App />);
    await requestPhoneCode('+905551110003');

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy).toHaveBeenCalledWith('+905551110003', undefined);
    spy.mockRestore();
  });
});
