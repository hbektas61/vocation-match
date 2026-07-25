import React, { useState } from 'react';

import { Field } from '../../components/ui';
import { apiErrorMessage, COPY } from '../../copy';
import { ApiError } from '../../data';
import { OnboardingScaffold } from '../OnboardingScaffold';
import type { SavingStepProps } from './types';

/** Optional, so it is one of the two steps that shows Skip. */
export function BioStep({
  step,
  total,
  draft,
  patch,
  go,
  profile,
  onBack,
  saveProfile,
}: SavingStepProps) {
  const [bio, setBio] = useState(draft.bio || profile?.bio || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (value: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      patch({ bio: value });
      await saveProfile({ bio: value });
      go('interests');
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
      headline={COPY.onboarding.bio.headline}
      body={COPY.onboarding.bio.body}
      onBack={onBack}
      onSkip={() => save('')}
      actionLabel={COPY.onboarding.continueButton}
      actionEnabled={bio.trim().length > 0 && !busy}
      actionBusy={busy}
      onAction={() => save(bio)}
      error={error}
      testID="screen-onboarding-bio"
    >
      <Field
        label={COPY.profileSetup.bioLabel}
        hideLabel
        value={bio}
        onChangeText={setBio}
        placeholder={COPY.profileSetup.bioPlaceholder}
        multiline
        autoFocus
        editable={!busy}
        testID="profile-bio"
      />
    </OnboardingScaffold>
  );
}
