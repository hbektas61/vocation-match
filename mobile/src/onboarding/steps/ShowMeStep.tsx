import React, { useState } from 'react';
import { StyleSheet, View , Pressable, Text } from 'react-native';

import { apiErrorMessage, COPY } from '../../copy';
import { ApiError, type ShowMe } from '../../data';
import { SHOW_ME_VALUES } from '../../fixtures/identity';

import { color, font, fontFamily, radius, spacing } from '../../theme';
import { OnboardingScaffold } from '../OnboardingScaffold';
import { CheckBadge, showMeIcon } from '../stepIcons';
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
      {/* The designer's three cards (D-044): the mark above the word, the
          check badge on the chosen one. */}
      <View style={styles.options}>
        {SHOW_ME_VALUES.map((value) => {
          const selected = chosen === value;
          return (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityLabel={COPY.identity.showMe[value] ?? value}
              accessibilityState={{ selected }}
              onPress={() => setChosen(value)}
              style={({ pressed }) => [
                styles.card,
                selected && styles.cardSelected,
                pressed && styles.cardPressed,
              ]}
              testID={`show-me-${value.toLowerCase()}`}
            >
              {selected ? (
                <View style={styles.cardBadge}>
                  <CheckBadge />
                </View>
              ) : null}
              {showMeIcon(value)}
              <Text style={styles.cardLabel}>{COPY.identity.showMe[value] ?? value}</Text>
            </Pressable>
          );
        })}
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  options: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  card: {
    flex: 1,
    aspectRatio: 0.82,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: color.rule,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  cardSelected: {
    borderColor: color.border,
    shadowColor: color.border,
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  cardPressed: { opacity: 0.85 },
  cardBadge: { position: 'absolute', top: 8, right: 8 },
  cardLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.body,
    color: color.ink,
  },
});
