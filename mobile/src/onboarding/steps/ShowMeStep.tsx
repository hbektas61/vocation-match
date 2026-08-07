import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { apiErrorMessage, COPY } from '../../copy';
import { ApiError, type ShowMe } from '../../data';
import { SHOW_ME_VALUES } from '../../fixtures/identity';

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
      {/* Three stacked pills (180:6386), the same shape the gender answers
          take. D-044's three square tiles are gone with their marks: at three
          answers a row of cards was a picture of a choice, and the contract
          asks the question the same way twice in a row on purpose — the
          second one is easier because the first one taught it. */}
      <View style={styles.options}>
        {SHOW_ME_VALUES.map((value) => (
          <ChoiceChip
            key={value}
            label={COPY.identity.showMe[value] ?? value}
            selected={chosen === value}
            wide
            onPress={() => setChosen(value)}
            testID={`show-me-${value.toLowerCase()}`}
          />
        ))}
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  options: { gap: spacing.md },
});
