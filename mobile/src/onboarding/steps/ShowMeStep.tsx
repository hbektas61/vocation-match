import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { apiErrorMessage, COPY } from '../../copy';
import { ApiError, type ShowMe } from '../../data';
import { SHOW_ME_OPTIONS } from '../../fixtures/identity';
import { spacing } from '../../theme';
import { ChoiceChip } from '../ChoiceChip';
import { OnboardingScaffold } from '../OnboardingScaffold';
import type { SavingStepProps } from './types';

/**
 * The one preference on this run of screens that changes what somebody sees
 * rather than what others see of them.
 *
 * It is required, it is private, and it is enforced on the server in both
 * directions — `discovery_feed` applies the viewer's answer and the other
 * person's, so neither one overrides the other. A screen that collected this
 * and left the feed alone would be the exact thing the brief warns against.
 */
export function ShowMeStep({ step, total, draft, patch, go, onBack, saveProfile }: SavingStepProps) {
  const [chosen, setChosen] = useState<ShowMe | ''>(draft.showMe);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (busy || chosen === '') return;
    setBusy(true);
    setError(null);
    try {
      patch({ showMe: chosen });
      await saveProfile({ showMe: chosen });
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
      headline={COPY.onboarding.showMe.headline}
      body={COPY.onboarding.showMe.body}
      onBack={onBack}
      actionLabel={COPY.onboarding.continueButton}
      actionEnabled={chosen !== '' && !busy}
      actionBusy={busy}
      onAction={save}
      error={error}
      testID="screen-onboarding-show-me"
    >
      <View style={styles.options}>
        {SHOW_ME_OPTIONS.map((option) => (
          <ChoiceChip
            key={option.value}
            label={option.label}
            selected={chosen === option.value}
            wide
            onPress={() => setChosen(option.value)}
            testID={`show-me-${option.value.toLowerCase()}`}
          />
        ))}
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  options: { gap: spacing.sm, marginTop: spacing.md },
});
