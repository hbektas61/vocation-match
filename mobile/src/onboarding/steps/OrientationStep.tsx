import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Caption, Checkbox } from '../../components/ui';
import { apiErrorMessage, COPY } from '../../copy';
import { ApiError, MAX_ORIENTATIONS } from '../../data';
import { ORIENTATIONS, orientationLabel } from '../../fixtures/identity';
import { spacing } from '../../theme';
import { ChoiceRow } from '../ChoiceChip';
import { OnboardingScaffold } from '../OnboardingScaffold';
import type { SavingStepProps } from './types';

/**
 * Optional, capped at three, and never a filter.
 *
 * The last part is the one worth being explicit about: it would be very easy
 * to quietly use this to decide who somebody is shown, and people would
 * reasonably assume it already works that way. It does not — `discovery_feed`
 * matches on gender and show-me only — and the screen says so rather than
 * leaving it to be guessed.
 *
 * Skipping writes nothing. An empty list is a real answer here, not a default
 * to be filled in.
 */
export function OrientationStep({
  step,
  total,
  draft,
  patch,
  go,
  onBack,
  saveProfile,
}: SavingStepProps) {
  const [chosen, setChosen] = useState<string[]>(draft.orientations);
  const [show, setShow] = useState(draft.showOrientation);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const full = chosen.length >= MAX_ORIENTATIONS;

  const toggle = (value: string) =>
    setChosen((current) =>
      current.includes(value)
        ? current.filter((v) => v !== value)
        : current.length >= MAX_ORIENTATIONS
          ? current
          : [...current, value],
    );

  const save = async (values: string[], publish: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      patch({ orientations: values, showOrientation: publish });
      await saveProfile({ orientations: values, showOrientation: publish });
      go('showMe');
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
      headline={COPY.onboarding.orientation.headline}
      onBack={onBack}
      // Skipping means "no answer", so it must not carry a publish flag either.
      onSkip={() => save([], false)}
      actionLabel={COPY.onboarding.continueButton}
      actionEnabled={!busy}
      actionBusy={busy}
      onAction={() => save(chosen, show)}
      error={error}
      testID="screen-onboarding-orientation"
      footer={
        <Checkbox
          label={COPY.onboarding.orientation.showOnProfile}
          checked={show}
          onChange={setShow}
          testID="show-orientation"
        />
      }
    >
      <Caption>{COPY.onboarding.orientation.limit(MAX_ORIENTATIONS)}</Caption>
      <View style={styles.list} testID="orientation-choices">
        {ORIENTATIONS.map((value) => {
          const selected = chosen.includes(value);
          return (
            <ChoiceRow
              key={value}
              label={orientationLabel(value)}
              selected={selected}
              disabled={!selected && full}
              onPress={() => toggle(value)}
              testID={`orientation-${value.toLowerCase()}`}
            />
          );
        })}
      </View>
      <Caption>{COPY.onboarding.orientation.notAFilter}</Caption>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: spacing.xs },
});
