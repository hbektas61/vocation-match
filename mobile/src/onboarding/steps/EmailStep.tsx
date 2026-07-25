import React, { useState } from 'react';

import { Field } from '../../components/ui';
import { COPY } from '../../copy';
import { OnboardingScaffold } from '../OnboardingScaffold';
import type { StepProps } from './types';

export function EmailStep({ step, total, draft, patch, go, onBack }: StepProps) {
  const [email, setEmail] = useState(draft.email);
  const ready = email.trim().includes('@') && email.trim().length > 3;

  return (
    <OnboardingScaffold
      step={step}
      total={total}
      headline={COPY.onboarding.email.headline}
      body={COPY.onboarding.email.body}
      onBack={onBack}
      actionLabel={COPY.onboarding.continueButton}
      actionEnabled={ready}
      onAction={() => {
        patch({ email: email.trim() });
        go('password');
      }}
      testID="screen-onboarding-email"
    >
      <Field
        label={COPY.auth.emailLabel}
        hideLabel
        value={email}
        onChangeText={setEmail}
        placeholder={COPY.auth.emailPlaceholder}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoFocus
        testID="auth-email"
      />
    </OnboardingScaffold>
  );
}
