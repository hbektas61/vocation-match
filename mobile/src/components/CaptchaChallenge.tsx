/**
 * The Turnstile challenge, in the only place a native app can run one.
 *
 * Turnstile has no native SDK; Cloudflare's supported route for a mobile app
 * is the managed widget rendered in a WebView. So this is a modal that loads
 * one page — ours, over HTTPS — waits for it to post a result, and closes.
 *
 * What it refuses to do is as much of the design as what it does:
 *
 *   * It navigates nowhere. `onShouldStartLoadWithRequest` allows the
 *     configured origin and Cloudflare's, and refuses everything else,
 *     including a redirect the page asks for. A WebView that follows arbitrary
 *     navigation is a browser wearing the app's name.
 *   * It reads nothing it was not sent. The message payload is parsed by
 *     `parseCaptchaMessage`, which treats it as untrusted and returns null for
 *     any shape it does not recognise.
 *   * It cannot hang. A challenge that is never answered — no network, a page
 *     that fails to load, somebody who walks away — resolves as a timeout
 *     rather than leaving the caller waiting on a promise forever.
 *   * It can always be left. Cancel is a first-class outcome, not an error.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { Body, Button, Notice, Title } from './ui';
import {
  allowedCaptchaOrigin,
  allowedTopLevelNavigation,
  captchaRequestUrl,
  CAPTCHA_TIMEOUT_MS,
  isCaptchaMessageOrigin,
  parseCaptchaMessage,
} from '../data/captcha';
import { COPY } from '../copy';
import { color, spacing } from '../theme';

export type CaptchaResult =
  | { kind: 'token'; token: string }
  | { kind: 'cancelled' }
  | { kind: 'failed'; reason: 'error' | 'expired' | 'timeout' | 'misconfigured' };

export function CaptchaChallenge({
  visible,
  onResult,
  testID = 'captcha-challenge',
}: {
  visible: boolean;
  onResult: (result: CaptchaResult) => void;
  testID?: string;
}) {
  // One value, built with `searchParams`, and null unless *both* the page and
  // the site key are configured and the page survives parsing.
  const requestUrl = captchaRequestUrl();
  const [problem, setProblem] = useState<string | null>(null);
  /** One result per challenge. A late message must not resolve a second time. */
  const settled = useRef(false);

  const settle = useCallback(
    (result: CaptchaResult) => {
      if (settled.current) return;
      settled.current = true;
      onResult(result);
    },
    [onResult],
  );

  useEffect(() => {
    if (!visible) {
      settled.current = false;
      setProblem(null);
      return;
    }
    // Misconfiguration is settled immediately rather than shown as a spinner
    // that never ends: an https page URL and a site key are both required, and
    // neither can appear while the modal is open.
    if (!requestUrl) {
      settle({ kind: 'failed', reason: 'misconfigured' });
      return;
    }
    const timer = setTimeout(() => {
      setProblem(COPY.errors.captchaRequired);
      settle({ kind: 'failed', reason: 'timeout' });
    }, CAPTCHA_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [visible, requestUrl, settle]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      // Where it came from, before what it says.
      //
      // The `source` field inside the JSON is not evidence: whatever document
      // the WebView has loaded can write it. `nativeEvent.url` is the frame
      // that posted, and it is the one part of a message the page cannot
      // forge — so a token from any other path, any other origin, or from
      // Cloudflare's iframe directly is dropped without being read.
      if (!isCaptchaMessageOrigin(event.nativeEvent?.url)) return;
      const outcome = parseCaptchaMessage(event.nativeEvent?.data);
      if (!outcome) return;
      if (outcome.kind === 'success') {
        settle({ kind: 'token', token: outcome.token });
        return;
      }
      setProblem(COPY.errors.captchaRequired);
      settle({ kind: 'failed', reason: outcome.kind === 'expired' ? 'expired' : 'error' });
    },
    [settle],
  );

  if (!visible) return null;

  return (
    <Modal
      visible
      animationType="slide"
      onRequestClose={() => settle({ kind: 'cancelled' })}
      testID={testID}
    >
      <View style={styles.sheet}>
        <Title>{COPY.phoneAuth.captchaTitle}</Title>
        <Body>{COPY.phoneAuth.captchaBody}</Body>
        {problem ? <Notice message={problem} tone="error" testID={`${testID}-error`} /> : null}
        {requestUrl ? (
          <View style={styles.frame}>
            <WebView
              source={{ uri: requestUrl }}
              onMessage={onMessage}
              // Two different questions, deliberately kept apart. A *top-level*
              // navigation may only ever be our own page; a subresource may
              // also come from Cloudflare, because that is where the widget's
              // script and iframe live. Allowing Cloudflare to become the
              // document would let a redirect chain end up on somebody else's
              // page with our bridge attached to it.
              onShouldStartLoadWithRequest={(request) =>
                request.isTopFrame === false
                  ? allowedCaptchaOrigin(request.url)
                  : allowedTopLevelNavigation(request.url)
              }
              onError={() => {
                setProblem(COPY.errors.captchaRequired);
                settle({ kind: 'failed', reason: 'error' });
              }}
              onHttpError={() => {
                setProblem(COPY.errors.captchaRequired);
                settle({ kind: 'failed', reason: 'error' });
              }}
              // Cloudflare's mobile guidance: the widget is JavaScript and it
              // keeps state in DOM storage, so both are on explicitly rather
              // than left to a platform default that differs between iOS and
              // Android.
              javaScriptEnabled
              domStorageEnabled
              // `incognito` was here and is gone. Turnstile needs cookies and
              // storage to run its checks; an incognito WebView discards them
              // and the widget fails in ways that look like a network problem.
              // Nothing sensitive is kept either way — the page holds a public
              // site key and a token that is spent within seconds — and the
              // WebView is torn down when the modal closes.
              sharedCookiesEnabled
              thirdPartyCookiesEnabled
              setSupportMultipleWindows={false}
              testID={`${testID}-webview`}
            />
          </View>
        ) : null}
        <Button
          label={COPY.common.cancel}
          variant="secondary"
          onPress={() => settle({ kind: 'cancelled' })}
          testID={`${testID}-cancel`}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: color.background,
    padding: spacing.md,
    gap: spacing.sm,
  },
  /** The widget draws itself; the frame only gives it somewhere to be. */
  frame: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: color.surface,
  },
});
