import React, { useState } from 'react';

import { Body, Button, Caption, Notice } from '../../components/ui';
import { COPY } from '../../copy';
import { FakeApi, getApi, hasBackendConfig } from '../../data';
import { OnboardingScaffold } from '../OnboardingScaffold';
import type { StepProps } from './types';

/**
 * Waiting on the link, with the same three exits the old screen had: send it
 * again, go back and sign in instead, and — only when there is no backend
 * configured — a labelled stand-in for opening it.
 *
 * The body says which of the two ways this screen was reached, because a
 * refused sign-in did not send anything and telling somebody otherwise costs
 * them an hour of watching an inbox.
 */
export function ConfirmEmailStep({ step, total, draft, onBack }: StepProps) {
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reason =
    draft.confirmReason === 'signed-up'
      ? COPY.confirmEmail.body
      : COPY.confirmEmail.notConfirmedYet;

  const resend = async () => {
    if (resending) return;
    setResending(true);
    setError(null);
    try {
      await getApi().resendConfirmationEmail(draft.email);
      setResent(true);
    } catch {
      setError(COPY.confirmEmail.resendError);
    } finally {
      setResending(false);
    }
  };

  // Every way off this screen is the same way: back to signing in. The flow
  // owns it, so it also knows to stop treating the address as unconfirmed.
  const backToSignIn = () => onBack?.();

  const simulate = () => {
    const api = getApi();
    if (api instanceof FakeApi) {
      api.confirmEmail(draft.email);
    }
    backToSignIn();
  };

  return (
    <OnboardingScaffold
      step={step}
      total={total}
      headline={COPY.confirmEmail.title}
      body={reason}
      onBack={onBack}
      actionLabel={resending ? COPY.confirmEmail.resending : COPY.confirmEmail.resendButton}
      actionEnabled={!resending}
      actionBusy={resending}
      onAction={resend}
      error={error}
      testID="screen-confirm-email"
      actionTestID="confirm-resend"
      errorTestID="confirm-error"
    >
      <Body>{draft.email}</Body>
      {resent ? (
        <Notice message={COPY.confirmEmail.resent} tone="success" testID="confirm-resent" />
      ) : null}
      <Button
        label={COPY.confirmEmail.backButton}
        variant="secondary"
        onPress={backToSignIn}
        testID="confirm-back"
      />
      {/* Preview build only: there is no mailbox behind the in-memory backend. */}
      {!hasBackendConfig() ? (
        <>
          <Caption>{COPY.confirmEmail.simulateIntro}</Caption>
          <Button
            label={COPY.confirmEmail.simulateButton}
            variant="secondary"
            onPress={simulate}
            testID="simulate-confirm-email"
          />
        </>
      ) : null}
    </OnboardingScaffold>
  );
}
