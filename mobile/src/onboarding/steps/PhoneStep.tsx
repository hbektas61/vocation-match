import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { Field } from '../../components/ui';
import { apiErrorMessage, COPY, getLocale } from '../../copy';
import { ApiError, getApi } from '../../data';
import { countryOptions, filterCountries, type CountryOption } from '../../domain/countries';
import { dialCode, dialableCountries } from '../../domain/dialCodes';
import {
  countryOfE164,
  formatNational,
  fromE164,
  isValidPhone,
  phoneProblem,
  toE164,
  toNationalDigits,
} from '../../domain/phoneNumber';
import { color, font, fontFamily, MIN_TOUCH, overlay, radius, spacing } from '../../theme';
import { OnboardingScaffold } from '../OnboardingScaffold';
import { useCaptchaGate } from '../useCaptchaGate';
import type { StepProps } from './types';

/**
 * The number, and the country it belongs to.
 *
 * D-022 drew `+90` as a permanent part of the control. That was right for a
 * Turkish pilot and wrong for the product this is — somebody flying from
 * Amsterdam cannot sign in at all (owner, 2026-08-06). The prefix is now a
 * *control*: it still never enters the editable value, so a number can still
 * not lose half its country code, but pressing it opens the same searchable
 * country list the venue and event flows use.
 *
 * Türkiye stays the default because that is where the product launches, and
 * the list is one press away rather than a setting.
 */
export function PhoneStep({ step, total, draft, patch, go, onBack }: StepProps) {
  const { challenge, solve } = useCaptchaGate();
  /** Only the countries we can actually dial; the picker shows no dead rows. */
  const countries = useMemo(() => {
    const dialable = new Set(dialableCountries());
    return countryOptions(getLocale()).filter((option) => dialable.has(option.code));
  }, []);
  const [country, setCountry] = useState<string>(
    () => countryOfE164(draft.phone, dialableCountries()) ?? 'TR',
  );
  const [digits, setDigits] = useState(() => {
    const national = fromE164(draft.phone, country);
    return national ?? toNationalDigits(draft.phone, country);
  });
  const [picking, setPicking] = useState(false);
  const [countryQuery, setCountryQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const problem = phoneProblem(digits, country);
  // Only once somebody has left the field. Telling a person their number is
  // too short while they are still typing it is not help.
  const visibleProblem =
    !touched || problem === null || problem === 'EMPTY'
      ? null
      : problem === 'NOT_MOBILE'
        ? COPY.phoneAuth.notMobile
        : problem === 'TOO_LONG'
          ? COPY.phoneAuth.tooLong
          : COPY.phoneAuth.incomplete;

  const sendCode = async () => {
    if (busy || !isValidPhone(digits, country)) return;
    setBusy(true);
    setError(null);
    const normalized = toE164(digits, country);
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
      // The token is obtained *before* the request and never after: no SMS is
      // asked for until the check has actually been solved.
      const captchaToken = await solve();
      await getApi().requestPhoneOtp(normalized, captchaToken);
      patch({
        phone: normalized,
        otpRequested: true,
        otpRequestedAt: Date.now(),
        otpRequestUncertain: false,
      });
      go('otp');
    } catch (err) {
      // Backing out of the security check is a decision, not a failure. Nothing
      // was sent and nothing went wrong, so the screen says nothing — a red
      // banner for closing a modal you opened is the app telling you off.
      if (err instanceof ApiError && err.code === 'CAPTCHA_CANCELLED') {
        setBusy(false);
        return;
      }
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

  const chooseCountry = (option: CountryOption) => {
    setCountry(option.code);
    // The digits belong to the country they were typed for: keeping them under
    // a new dialling code would silently invent a different number.
    setDigits('');
    setTouched(false);
    setPicking(false);
    setCountryQuery('');
  };

  return (
    <>
      {challenge}
    <OnboardingScaffold
      step={step}
      total={total}
      headline={COPY.onboarding.phone.headline}
      body={COPY.onboarding.phone.body}
      onBack={onBack}
      actionLabel={busy ? COPY.phoneAuth.sending : COPY.phoneAuth.sendCode}
      actionEnabled={isValidPhone(digits, country) && !busy}
      actionBusy={busy}
      onAction={sendCode}
      error={error ?? visibleProblem}
      testID="screen-onboarding-phone"
      errorTestID="phone-error"
    >
      <Field
        // The box cannot speak the dialling code drawn next to it, so the
        // accessible name carries the country instead.
        label={COPY.phoneAuth.phoneAccessibleLabel}
        hideLabel
        invalid={visibleProblem !== null}
        prefix={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={COPY.phoneAuth.changeCountry}
            onPress={() => setPicking(true)}
            disabled={busy}
            hitSlop={6}
            style={styles.prefixButton}
            testID="phone-country"
          >
            <Text style={styles.prefix}>{`+${dialCode(country) ?? ''}`}</Text>
            <Text style={styles.prefixChevron}>{'▾'}</Text>
          </Pressable>
        }
        value={formatNational(digits, country)}
        onChangeText={(text) => setDigits(toNationalDigits(text, country))}
        onBlur={() => setTouched(true)}
        placeholder={
          country === 'TR' ? COPY.phoneAuth.phonePlaceholder : COPY.phoneAuth.phonePlaceholderAny
        }
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoFocus
        editable={!busy}
        testID="auth-phone"
      />

      {/* The country list, over the page rather than under it — the same sheet
          the events area picker uses. */}
      <Modal
        transparent
        visible={picking}
        animationType="fade"
        onRequestClose={() => setPicking(false)}
      >
        <Pressable
          style={styles.sheetScrim}
          onPress={() => setPicking(false)}
          accessibilityRole="button"
          accessibilityLabel={COPY.common.cancel}
        >
          <Pressable style={styles.sheetCard} onPress={() => {}} testID="phone-country-sheet">
            <Field
              label={COPY.venue.countryLabel}
              hideLabel
              pill
              value={countryQuery}
              onChangeText={setCountryQuery}
              placeholder={COPY.venue.countryPlaceholder}
              testID="phone-country-input"
            />
            <ScrollView
              style={styles.sheetScroll}
              contentContainerStyle={styles.sheetBody}
              keyboardShouldPersistTaps="handled"
            >
              {filterCountries(countries, countryQuery, 40).map((option) => (
                <Pressable
                  key={option.code}
                  accessibilityRole="button"
                  accessibilityLabel={`${option.name} +${dialCode(option.code) ?? ''}`}
                  accessibilityState={{ selected: option.code === country }}
                  onPress={() => chooseCountry(option)}
                  style={({ pressed }) => [styles.countryRow, pressed && styles.countryRowPressed]}
                  testID={`phone-country-${option.code}`}
                >
                  <Text style={styles.countryName} numberOfLines={1}>
                    {option.name}
                  </Text>
                  <Text style={styles.countryDial}>{`+${dialCode(option.code) ?? ''}`}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </OnboardingScaffold>
    </>
  );
}

/** The country sheet rides high, clear of the keyboard under the filter. */
const SHEET_TOP = 96;

const styles = StyleSheet.create({
  /** The dialling code, and the fact that it can be changed. */
  prefixButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: MIN_TOUCH,
    paddingRight: spacing.sm,
  },
  prefix: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.body,
    // The same text metrics as the input beside it — natural line box, no
    // Android font padding, same size in the same family. Different metrics
    // were half of why +90 and the digits refused to sit on one line.
    includeFontPadding: false,
    color: color.ink,
  },
  prefixChevron: { fontFamily: fontFamily.bodySemi, fontSize: font.label, color: color.accent },
  sheetScrim: {
    flex: 1,
    backgroundColor: overlay.photo,
    justifyContent: 'flex-start',
    paddingHorizontal: spacing.wide,
    paddingTop: SHEET_TOP,
  },
  sheetCard: {
    backgroundColor: color.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.snug,
    maxHeight: '78%',
  },
  sheetScroll: { flexGrow: 0 },
  sheetBody: { gap: spacing.xs },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: MIN_TOUCH,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.rule,
    backgroundColor: color.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.snug,
  },
  countryRowPressed: { backgroundColor: color.accentWash, borderColor: color.accent },
  countryName: { flex: 1, fontFamily: fontFamily.bodyMedium, fontSize: font.body, color: color.ink },
  countryDial: { fontFamily: fontFamily.bodySemi, fontSize: font.caption, color: color.inkMuted },
});
