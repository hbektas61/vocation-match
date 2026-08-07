import React, { useState } from 'react';

import { Field } from '../../components/ui';
import { COPY } from '../../copy';
import { OnboardingScaffold } from '../OnboardingScaffold';
import type { StepProps } from './types';

export function NameStep({ step, total, draft, patch, go, profile }: StepProps) {
  const [name, setName] = useState(draft.displayName || profile?.displayName || '');
  const ready = name.trim().length >= 2;

  return (
    <OnboardingScaffold
      step={step}
      total={total}
      headline={COPY.onboarding.name.headline}
      body={COPY.onboarding.name.body}
      actionLabel={COPY.onboarding.continueButton}
      actionEnabled={ready}
      onAction={() => {
        patch({ displayName: name.trim() });
        go('birthdate');
      }}
      testID="screen-onboarding-name"
    >
      {/* The contract's one big box (180:6026): the name is the only thing on
          this screen, so it is drawn at the size of the only thing offered. */}
      <Field
        label={COPY.profileSetup.nameLabel}
        hideLabel
        tall
        value={name}
        onChangeText={setName}
        placeholder={COPY.profileSetup.namePlaceholder}
        autoFocus
        testID="profile-name"
      />
    </OnboardingScaffold>
  );
}
