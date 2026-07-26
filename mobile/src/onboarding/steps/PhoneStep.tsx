import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Field } from '../../components/ui';
import { apiErrorMessage, COPY } from '../../copy';
import {
  ApiError,
  formatNationalTr,
  getApi,
  isValidNationalTr,
  nationalTrProblem,
  toE164Tr,
  toNationalDigits,
} from '../../data';
import { color, font, fontFamily, spacing } from '../../theme';
import { OnboardingScaffold } from '../OnboardingScaffold';
import type { StepProps } from './types';

/**
 * The number, with its country fixed.
 *
 * `+90` is drawn beside the box and is never part of the editable value, which
 * is what makes it impossible to delete half of it or to send a number with no
 * country on it. The state here is therefore ten national digits; the E.164
 * form is produced once, at the call.
 *
 * The draft keeps E.164, because that is what the OTP step and the resend
 * window compare against. The grouped display is a view of those digits rather
 * than a second thing to keep in step.
 */
export function PhoneStep({ step, total, draft, patch, go, onBack }: StepProps) {
  const [digits, setDigits] = useState(() => toNationalDigits(draft.phone));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const problem = nationalTrProblem(digits);
  // Only once somebody has left the field. Telling a person their number is
  // too short while they are still typing it is not help.
  const visibleProblem =
    !touched || problem === null || problem === 'EMPTY'
      ? null
      : problem === 'NOT_MOBILE'
        ? COPY.phoneAuth.notMobile
        : COPY.phoneAuth.incomplete;

  const sendCode = async () => {
    if (busy || !isValidNationalTr(digits)) return;
    setBusy(true);
    setError(null);
    const normalized = toE164Tr(digits);
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
      actionEnabled={isValidNationalTr(digits) && !busy}
      actionBusy={busy}
      onAction={sendCode}
      error={error ?? visibleProblem}
      testID="screen-onboarding-phone"
      errorTestID="phone-error"
    >
      <Field
        // The box cannot speak the `+90` drawn next to it, so the accessible
        // name carries the country instead.
        label={COPY.phoneAuth.phoneAccessibleLabel}
        hideLabel
        invalid={visibleProblem !== null}
        prefix={
          <Text
            style={styles.prefix}
            accessibilityElementsHidden
            importantForAccessibility="no"
            testID="phone-prefix"
          >
            {COPY.phoneAuth.countryPrefix}
          </Text>
        }
        value={formatNationalTr(digits)}
        onChangeText={(text) => setDigits(toNationalDigits(text))}
        onBlur={() => setTouched(true)}
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

const styles = StyleSheet.create({
  prefix: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.body,
    // The same text metrics as the input beside it — natural line box, no
    // Android font padding, same size in the same family. Different metrics
    // were half of why +90 and the digits refused to sit on one line.
    includeFontPadding: false,
    color: color.ink,
    marginRight: spacing.sm,
  },
});
