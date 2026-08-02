/**
 * "Solve a challenge, then ask for a code" — as one call.
 *
 * Both places that request an SMS need the identical dance: open the
 * challenge, wait for a token, use it once, throw it away. Written twice it
 * would be wrong in one of them eventually, and the way it would be wrong is
 * the expensive way — a reused token reads to Cloudflare as a replay and to
 * the person as "the code did not send".
 *
 * `solve()` resolves with a token or throws an `ApiError`. It never resolves
 * with the same token twice: the holder is taken from and forgotten.
 */
import React, { useCallback, useRef, useState } from 'react';

import { CaptchaChallenge, type CaptchaResult } from '../components/CaptchaChallenge';
import { ApiError } from '../data';
import { captchaRequired, CaptchaToken } from '../data/captcha';
import { COPY } from '../copy';

export function useCaptchaGate(): {
  /** Render this. It draws nothing until a challenge is open. */
  challenge: React.ReactNode;
  /**
   * A fresh single-use token, or `undefined` when this build has no CAPTCHA
   * configured. Throws if the person cancels or the challenge fails — the
   * caller must not fall through to the SMS request in either case.
   */
  solve: () => Promise<string | undefined>;
} {
  const [open, setOpen] = useState(false);
  const pending = useRef<((result: CaptchaResult) => void) | null>(null);

  const onResult = useCallback((result: CaptchaResult) => {
    setOpen(false);
    const resolve = pending.current;
    pending.current = null;
    resolve?.(result);
  }, []);

  const solve = useCallback(async (): Promise<string | undefined> => {
    // Two solves at once would strand the first promise forever: the second
    // overwrites `pending`, and nothing ever resolves the one it replaced.
    // Refusing the second is the honest answer — there is one modal, one
    // challenge, and one token in flight.
    if (pending.current) {
      throw new ApiError('CAPTCHA_REQUIRED', COPY.errors.captchaRequired);
    }
    // A build with no site key is a build whose project does not demand one.
    // Returning undefined rather than throwing keeps that path exactly as it
    // was — and `requestPhoneOtp` fails closed if the two ever disagree.
    if (!captchaRequired()) return undefined;

    const result = await new Promise<CaptchaResult>((resolve) => {
      pending.current = resolve;
      setOpen(true);
    });

    if (result.kind === 'token') {
      // Wrapped and immediately taken: the holder exists so that the
      // single-use rule is expressed in the type rather than remembered.
      const holder = new CaptchaToken(result.token);
      const token = holder.take();
      if (!token) throw new ApiError('CAPTCHA_REQUIRED', COPY.errors.captchaRequired);
      return token;
    }
    if (result.kind === 'cancelled') {
      // Backing out is not a failure to report. The caller stops, quietly.
      throw new ApiError('CAPTCHA_CANCELLED', COPY.errors.captchaCancelled);
    }
    throw new ApiError('CAPTCHA_REQUIRED', COPY.errors.captchaRequired);
  }, []);

  return {
    challenge: <CaptchaChallenge visible={open} onResult={onResult} />,
    solve,
  };
}
