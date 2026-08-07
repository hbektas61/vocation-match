import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Caption, Notice } from '../../components/ui';
import { apiErrorMessage, COPY } from '../../copy';
import {
  ApiError,
  FAKE_PHONE_OTP,
  getApi,
  isFakeApiEnabled,
  maskPhone,
} from '../../data';
import { useAppStore } from '../../state/AppStore';
import {
  ACTION_TOUCH,
  color,
  font,
  fontFamily,
  leading,
  MIN_TOUCH,
  radius,
  spacing,
} from '../../theme';
import { OnboardingScaffold } from '../OnboardingScaffold';
import { useCaptchaGate } from '../useCaptchaGate';
import type { StepProps } from './types';

const RESEND_COOLDOWN_SECONDS = 60;
const CODE_LENGTH = 6;

/**
 * The code, as the six boxes the contract draws (180:5994).
 *
 * Six real inputs would be six things to manage, and every one of them a place
 * for focus to get stuck — paste a code and you would be fighting the app. So
 * this is the same trick `DateField` uses: one invisible `TextInput` lies over
 * the whole row and owns the keyboard, the value, the SMS autofill and the
 * accessible name, and the six boxes underneath are a drawing of its state.
 * The box the next digit will land in wears the coral edge and a caret, which
 * is the only part of the design that is doing work rather than decoration.
 */
function CodeBoxes({
  value,
  onChangeText,
  editable,
  testID,
}: {
  value: string;
  onChangeText: (next: string) => void;
  editable: boolean;
  testID: string;
}) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const active = Math.min(value.length, CODE_LENGTH - 1);

  return (
    <Pressable accessible={false} onPress={() => inputRef.current?.focus()} style={styles.codeRow}>
      {Array.from({ length: CODE_LENGTH }, (_, index) => {
        const digit = value[index] ?? '';
        const here = focused && editable && index === active;
        return (
          <View key={index} style={[styles.codeBox, here && styles.codeBoxActive]}>
            {digit ? (
              <Text style={styles.codeDigit}>{digit}</Text>
            ) : here ? (
              <View style={styles.codeCaret} />
            ) : null}
          </View>
        );
      })}
      <TextInput
        ref={inputRef}
        accessibilityLabel={COPY.phoneAuth.codeLabel}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        textContentType={Platform.OS === 'ios' ? 'oneTimeCode' : undefined}
        autoComplete={Platform.OS === 'android' ? 'sms-otp' : undefined}
        autoFocus
        editable={editable}
        maxLength={CODE_LENGTH}
        caretHidden
        style={styles.hiddenInput}
        testID={testID}
      />
    </Pressable>
  );
}

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
      {/* Which number is waiting for it. The contract puts this in the header
          subtitle; here it stays a line of its own so the header can keep the
          sentence a screen reader is announced on arrival. */}
      <Text style={styles.destination}>{COPY.phoneAuth.destination(maskPhone(draft.phone))}</Text>
      {draft.otpRequestUncertain ? (
        <Notice message={COPY.phoneAuth.requestUncertain} tone="info" />
      ) : null}
      <CodeBoxes
        value={code}
        onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
        editable={!busy}
        testID="auth-otp"
      />
      {resent ? (
        <Notice message={COPY.phoneAuth.resent} tone="success" testID="otp-resent" />
      ) : null}
      {/* The contract's resend (180:6006): a coral word under the boxes, not a
          second slab. The cooldown is inside the label, so the one control
          says both what it does and when it will do it. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          resendAvailableIn > 0 ? COPY.phoneAuth.resendIn(resendAvailableIn) : COPY.phoneAuth.resend
        }
        accessibilityState={{
          disabled: resending || busy || resendAvailableIn > 0,
          busy: resending,
        }}
        disabled={resending || busy || resendAvailableIn > 0}
        onPress={resend}
        style={({ pressed }) => [styles.resend, pressed && styles.resendPressed]}
        testID="otp-resend"
      >
        <Text
          style={[
            styles.resendLabel,
            (resending || busy || resendAvailableIn > 0) && styles.resendLabelIdle,
          ]}
        >
          {resending
            ? COPY.phoneAuth.sending
            : resendAvailableIn > 0
              ? COPY.phoneAuth.resendIn(resendAvailableIn)
              : COPY.phoneAuth.resend}
        </Text>
      </Pressable>
      {isFakeApiEnabled() ? (
        <Caption>{COPY.phoneAuth.previewCode(FAKE_PHONE_OTP)}</Caption>
      ) : null}
    </OnboardingScaffold>
    </>
  );
}

const styles = StyleSheet.create({
  destination: {
    fontFamily: fontFamily.body,
    fontSize: font.body,
    lineHeight: font.body * leading.normal,
    color: color.inkMuted,
  },
  /** Six boxes across the column, spread to its full width (180:5994). */
  codeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  codeBox: {
    width: 48,
    height: ACTION_TOUCH,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.rule,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Where the next digit lands: the brand edge, drawn thicker as well. */
  codeBoxActive: { borderColor: color.accent, borderWidth: 2.5 },
  codeDigit: {
    fontFamily: fontFamily.displayHeavy,
    fontSize: font.title,
    lineHeight: font.title * leading.tight,
    color: color.ink,
  },
  codeCaret: { width: 2, height: 28, backgroundColor: color.accent },
  /** Owns the touch, the keyboard, the autofill and the value; draws nothing. */
  hiddenInput: { ...StyleSheet.absoluteFillObject, opacity: 0 },
  resend: {
    alignSelf: 'center',
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  resendPressed: { opacity: 0.7 },
  resendLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.control,
    color: color.accentDeep,
    textAlign: 'center',
  },
  /** During the cooldown it is a countdown, not an offer — so it reads quiet. */
  resendLabelIdle: { color: color.inkMuted },
});
