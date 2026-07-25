import React, { useState } from 'react';

import { apiErrorMessage, COPY } from '../../copy';
import { ApiError, MAX_INTERESTS } from '../../data';
import { INTEREST_CHOICES } from '../../fixtures/interests';
import { ChoiceChip, ChoiceGroup } from '../ChoiceChip';
import { OnboardingScaffold } from '../OnboardingScaffold';
import type { SavingStepProps } from './types';

export function InterestsStep({
  step,
  total,
  draft,
  patch,
  go,
  profile,
  onBack,
  saveProfile,
}: SavingStepProps) {
  const [chosen, setChosen] = useState<string[]>(
    draft.interests.length ? draft.interests : profile?.interests ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const full = chosen.length >= MAX_INTERESTS;

  const toggle = (value: string) => {
    setChosen((current) =>
      current.includes(value)
        ? current.filter((v) => v !== value)
        : current.length >= MAX_INTERESTS
          ? current
          : [...current, value],
    );
  };

  const save = async (values: string[]) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      patch({ interests: values });
      await saveProfile({ interests: values });
      go('photo');
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
      headline={COPY.onboarding.interests.headline}
      body={COPY.onboarding.interests.body}
      onBack={onBack}
      onSkip={() => save([])}
      actionLabel={COPY.onboarding.continueButton}
      actionEnabled={chosen.length > 0 && !busy}
      actionBusy={busy}
      onAction={() => save(chosen)}
      error={error}
      testID="screen-onboarding-interests"
    >
      <ChoiceGroup
        hint={
          full
            ? COPY.onboarding.interests.atLimit(MAX_INTERESTS)
            : COPY.onboarding.interests.limit(MAX_INTERESTS)
        }
        testID="interest-choices"
      >
        {INTEREST_CHOICES.map((choice) => {
          const selected = chosen.includes(choice);
          return (
            <ChoiceChip
              key={choice}
              label={choice}
              selected={selected}
              disabled={!selected && full}
              onPress={() => toggle(choice)}
              testID={`interest-${choice.toLowerCase().replace(/\s+/g, '-')}`}
            />
          );
        })}
      </ChoiceGroup>
    </OnboardingScaffold>
  );
}
