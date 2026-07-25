import React, { useState } from 'react';

import { Field } from '../../components/ui';
import { todayIsoDate } from '../../clock';
import { apiErrorMessage, COPY } from '../../copy';
import { ApiError } from '../../data';
import { isAdult, parseIsoDate } from '../../domain/age';
import { OnboardingScaffold } from '../OnboardingScaffold';
import type { SavingStepProps } from './types';

/**
 * The first step that writes anything, because `saveOwnProfile` needs a name
 * and a birthdate together.
 *
 * The 18+ check here is only for a fast answer. `app.enforce_adult_profile`
 * refuses an underage date on insert and on update, so a client that skipped
 * this would be refused by the database — which is where the rule lives.
 */
export function BirthdateStep({
  step,
  total,
  draft,
  patch,
  go,
  profile,
  onBack,
  saveProfile,
}: SavingStepProps) {
  const [birthdate, setBirthdate] = useState(draft.birthdate || profile?.birthdate || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    if (!parseIsoDate(birthdate)) {
      setError(COPY.profileSetup.invalidBirthdate);
      return;
    }
    if (!isAdult(birthdate, todayIsoDate())) {
      setError(COPY.profileSetup.underAge);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      patch({ birthdate });
      await saveProfile({ birthdate });
      go('bio');
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown);
    } finally {
      setBusy(false);
    }
  };

  return (
    <OnboardingScaffold
      step={step}
      total={total}
      headline={COPY.onboarding.birthdate.headline}
      body={COPY.onboarding.birthdate.body}
      onBack={onBack}
      actionLabel={COPY.onboarding.continueButton}
      actionEnabled={birthdate.trim().length > 0 && !busy}
      actionBusy={busy}
      onAction={submit}
      error={error}
      testID="screen-onboarding-birthdate"
    >
      <Field
        label={COPY.profileSetup.birthdateLabel}
        hideLabel
        hint={COPY.profileSetup.birthdateHint}
        value={birthdate}
        onChangeText={setBirthdate}
        placeholder={COPY.profileSetup.birthdatePlaceholder}
        keyboardType="numbers-and-punctuation"
        autoFocus
        editable={!busy}
        testID="profile-birthdate"
      />
    </OnboardingScaffold>
  );
}
