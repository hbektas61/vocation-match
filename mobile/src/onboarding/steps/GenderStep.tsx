import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Checkbox } from '../../components/ui';
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
  const [expanded, setExpanded] = useState(() => isMore(draft.gender));
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
      headline={expanded ? COPY.onboarding.gender.moreHeadline : COPY.onboarding.gender.headline}
      body={COPY.onboarding.gender.body}
      onBack={onBack}
      actionLabel={COPY.onboarding.continueButton}
      actionEnabled={chosen !== '' && !busy}
      actionBusy={busy}
      onAction={save}
      error={error}
      testID="screen-onboarding-gender"
      footer={
        <Checkbox
          label={COPY.onboarding.gender.showOnProfile}
          checked={show}
          onChange={setShow}
          testID="show-gender"
        />
      }
    >
      <View style={styles.options}>
        {PRIMARY_GENDERS.map((value) => (
          <ChoiceChip
            key={value}
            label={genderLabel(value)}
            selected={chosen === value}
            wide
            onPress={() => setChosen(value)}
            testID={`gender-${value.toLowerCase()}`}
          />
        ))}
        {expanded ? (
          MORE_GENDERS.map((value) => (
            <ChoiceChip
              key={value}
              label={value}
              selected={chosen === value}
              wide
              onPress={() => setChosen(value)}
              testID={`gender-${value.toLowerCase().replace(/\s+/g, '-')}`}
            />
          ))
        ) : (
          <ChoiceChip
            label={COPY.onboarding.gender.more}
            selected={false}
            wide
            trailing="›"
            onPress={() => setExpanded(true)}
            testID="gender-more"
          />
        )}
      </View>
    </OnboardingScaffold>
  );
}

function isMore(value: string): boolean {
  return value !== '' && !PRIMARY_GENDERS.includes(value as (typeof PRIMARY_GENDERS)[number]);
}

const styles = StyleSheet.create({
  options: { gap: spacing.sm, marginTop: spacing.md },
});
