import React, { useState } from 'react';

import { Field } from '../../components/ui';
import { apiErrorMessage, COPY } from '../../copy';
import { ApiError, getApi, isE164Phone, normalizePhone } from '../../data';
import { OnboardingScaffold } from '../OnboardingScaffold';
import type { StepProps } from './types';

export function PhoneStep({ step, total, draft, patch, go, onBack }: StepProps) {
  const [phone, setPhone] = useState(draft.phone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async () => {
    if (busy || !isE164Phone(phone)) return;
    setBusy(true);
    setError(null);
    const normalized = normalizePhone(phone);
    const requestedRecently =
      draft.phone === normalized &&
      draft.otpRequestedAt !== null &&
      Date.now() - draft.otpRequestedAt < 60_000;
    if (requestedRecently) {
      patch({ otpRequested: true });
      go('otp');
      setBusy(false);
      return;
    }
    try {
      await getApi().requestPhoneOtp(normalized);
      patch({
        phone: normalized,
        otpRequested: true,
        otpRequestedAt: Date.now(),
        otpRequestUncertain: false,
      });
      go('otp');
    } catch (err) {
      // A timeout cannot tell us whether the provider accepted the SMS. Let
      // the person enter a code that may already be on its way instead of
      // forcing another paid request that the server will rate-limit.
      if (err instanceof ApiError && err.code === 'NETWORK') {
        patch({
          phone: normalized,
          otpRequested: true,
          otpRequestedAt: Date.now(),
          otpRequestUncertain: true,
        });
        go('otp');
        return;
      }
      setError(err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown);
    } finally {
      setBusy(false);
    }
  };

  return (
    <OnboardingScaffold
      step={step}
      total={total}
      headline={COPY.onboarding.phone.headline}
      body={COPY.onboarding.phone.body}
      onBack={onBack}
      actionLabel={busy ? COPY.phoneAuth.sending : COPY.phoneAuth.sendCode}
      actionEnabled={isE164Phone(phone) && !busy}
      actionBusy={busy}
      onAction={sendCode}
      error={error}
      testID="screen-onboarding-phone"
      errorTestID="phone-error"
    >
      <Field
        label={COPY.phoneAuth.phoneLabel}
        hideLabel
        value={phone}
        onChangeText={setPhone}
        placeholder={COPY.phoneAuth.phonePlaceholder}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoFocus
        editable={!busy}
        testID="auth-phone"
      />
    </OnboardingScaffold>
  );
}
