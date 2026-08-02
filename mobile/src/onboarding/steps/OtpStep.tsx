import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { Body, Button, Caption, Field, Notice } from '../../components/ui';
import { apiErrorMessage, COPY } from '../../copy';
import {
  ApiError,
  FAKE_PHONE_OTP,
  getApi,
  isFakeApiEnabled,
  maskPhone,
} from '../../data';
import { useAppStore } from '../../state/AppStore';
import { OnboardingScaffold } from '../OnboardingScaffold';
import { useCaptchaGate } from '../useCaptchaGate';
import type { StepProps } from './types';

const RESEND_COOLDOWN_SECONDS = 60;

export function OtpStep({ step, total, draft, patch, onBack }: StepProps) {
  const { challenge, solve } = useCaptchaGate();
  const { dispatch } = useAppStore();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [resendAvailableAt, setResendAvailableAt] = useState(
    () => (draft.otpRequestedAt ?? Date.now()) + RESEND_COOLDOWN_SECONDS * 1_000,
  );
  const [now, setNow] = useState(Date.now);
  const [error, setError] = useState<string | null>(null);
  const resendAvailableIn = Math.max(0, Math.ceil((resendAvailableAt - now) / 1_000));

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [resendAvailableAt]);

  const verify = async () => {
    if (busy || resending || !/^\d{6}$/.test(code)) return;
    setBusy(true);
    setError(null);
    try {
      const api = getApi();
      const session = await api.verifyPhoneOtp(draft.phone, code);
      // The authentication proof is no longer needed once it has produced a
      // session. Do not retain the phone or code through the profile wizard.
      setCode('');
      patch({
        phone: '',
        otpRequested: false,
        otpRequestedAt: null,
        otpRequestUncertain: false,
      });
      dispatch({
        type: 'AUTH_SUCCESS',
        session,
        profile: null,
      });
    } catch (err) {
      // Backing out of the security check is a decision, not a failure. Nothing
      // was sent and nothing went wrong, so the screen says nothing — a red
      // banner for closing a modal you opened is the app telling you off.
      if (err instanceof ApiError && err.code === 'CAPTCHA_CANCELLED') {
        setBusy(false);
        return;
      }
      setError(err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (resending || busy || resendAvailableIn > 0) return;
    setResending(true);
    setResent(false);
    setError(null);
    try {
      // A *fresh* token. Cloudflare refuses one it has already seen, and the
      // refusal would reach the person as "the code did not send".
      const captchaToken = await solve();
      await getApi().requestPhoneOtp(draft.phone, captchaToken);
      setResent(true);
      const requestedAt = Date.now();
      setNow(requestedAt);
      setResendAvailableAt(requestedAt + RESEND_COOLDOWN_SECONDS * 1_000);
      patch({ otpRequestedAt: requestedAt, otpRequestUncertain: false });
    } catch (err) {
      // Same rule on the resend: closing the check sent nothing, so it says
      // nothing.
      if (err instanceof ApiError && err.code === 'CAPTCHA_CANCELLED') {
        setResending(false);
        return;
      }
      // As with the first send, a timeout may happen after the provider accepts
      // the SMS. Treat that as a possibly-successful send and start a fresh
      // cooldown, otherwise the button invites an immediate duplicate charge.
      if (err instanceof ApiError && err.code === 'NETWORK') {
        const requestedAt = Date.now();
        setNow(requestedAt);
        setResendAvailableAt(requestedAt + RESEND_COOLDOWN_SECONDS * 1_000);
        patch({ otpRequestedAt: requestedAt, otpRequestUncertain: true });
        return;
      }
      setError(err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown);
    } finally {
      setResending(false);
    }
  };

  return (
    <>
      {challenge}
    <OnboardingScaffold
      step={step}
      total={total}
      headline={COPY.onboarding.otp.headline}
      body={COPY.onboarding.otp.body}
      onBack={onBack}
      actionLabel={busy ? COPY.phoneAuth.verifying : COPY.phoneAuth.verify}
      actionEnabled={/^\d{6}$/.test(code) && !busy && !resending}
      actionBusy={busy}
      onAction={verify}
      error={error}
      testID="screen-onboarding-otp"
      errorTestID="otp-error"
    >
      <Body>{COPY.phoneAuth.destination(maskPhone(draft.phone))}</Body>
      {draft.otpRequestUncertain ? (
        <Notice message={COPY.phoneAuth.requestUncertain} tone="info" />
      ) : null}
      <Field
        label={COPY.phoneAuth.codeLabel}
        hideLabel
        value={code}
        onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
        placeholder={COPY.phoneAuth.codePlaceholder}
        keyboardType="number-pad"
        textContentType={Platform.OS === 'ios' ? 'oneTimeCode' : undefined}
        autoComplete={Platform.OS === 'android' ? 'sms-otp' : undefined}
        autoFocus
        editable={!busy}
        maxLength={6}
        testID="auth-otp"
      />
      {resent ? (
        <Notice message={COPY.phoneAuth.resent} tone="success" testID="otp-resent" />
      ) : null}
      <Button
        label={
          resending
            ? COPY.phoneAuth.sending
            : resendAvailableIn > 0
              ? COPY.phoneAuth.resendIn(resendAvailableIn)
              : COPY.phoneAuth.resend
        }
        variant="secondary"
        busy={resending}
        disabled={resending || busy || resendAvailableIn > 0}
        onPress={resend}
        testID="otp-resend"
      />
      {isFakeApiEnabled() ? (
        <Caption>{COPY.phoneAuth.previewCode(FAKE_PHONE_OTP)}</Caption>
      ) : null}
    </OnboardingScaffold>
    </>
  );
}
