import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ToggleRow } from '../../components/ui';
import { apiErrorMessage, COPY } from '../../copy';
import { ApiError } from '../../data';
import { genderLabel, MORE_GENDERS, PRIMARY_GENDERS } from '../../fixtures/identity';
import { spacing } from '../../theme';
import { ChoiceChip } from '../ChoiceChip';
import { OnboardingScaffold } from '../OnboardingScaffold';
import type { SavingStepProps } from './types';

/**
 * Gender, and separately whether it is published.
 *
 * Two answers on one screen because they are one decision made twice — people
 * who are happy to say are not always happy to broadcast, and collapsing the
 * two would answer the second question for them. The publish toggle is off
 * until it is turned on.
 *
 * "More" opens the rest of the list in place rather than going somewhere: it
 * is the same question with more answers, and a second screen would imply the
 * options behind it are a different kind of thing.
 */
export function GenderStep({ step, total, draft, patch, go, onBack, saveProfile }: SavingStepProps) {
  const [chosen, setChosen] = useState(draft.gender);
  const [show, setShow] = useState(draft.showGender);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (busy || !chosen) return;
    setBusy(true);
    setError(null);
    try {
      patch({ gender: chosen, showGender: show });
      await saveProfile({ gender: chosen, showGender: show });
      go('orientation');
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
      headline={COPY.onboarding.gender.headline}
      body={COPY.onboarding.gender.body}
      onBack={onBack}
      actionLabel={COPY.onboarding.continueButton}
      actionEnabled={chosen !== '' && !busy}
      actionBusy={busy}
      onAction={save}
      error={error}
      testID="screen-onboarding-gender"
    >
      <View style={styles.options}>
        {/* Every answer, stacked. There used to be a "More" expander hiding
            most of the list; the owner asked for the whole list, and the
            expander's implication — that the options behind it are a
            different kind of answer — was never a good one.

            No glyph beside the label any more (180:6158): the contract draws
            these as plain pills, and D-058 had already emptied the per-answer
            marks of the colour that made them mean anything. */}
        {[...PRIMARY_GENDERS, ...MORE_GENDERS].map((value) => (
          <ChoiceChip
            key={value}
            label={genderLabel(value)}
            selected={chosen === value}
            wide
            onPress={() => setChosen(value)}
            testID={`gender-${value.toLowerCase().replace(/\s+/g, '-')}`}
          />
        ))}
      </View>

      {/* The publish decision (180:6164) moved out of the footer and into the
          answer it belongs to: a card under the options rather than a tick
          floating above the button, which read as a condition of continuing. */}
      <ToggleRow
        label={COPY.onboarding.gender.showOnProfile}
        value={show}
        onChange={setShow}
        testID="show-gender"
      />
    </OnboardingScaffold>
  );
}


const styles = StyleSheet.create({
  options: { gap: spacing.md },
});
