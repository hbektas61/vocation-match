import React, { useState } from 'react';

import { Field } from '../../components/ui';
import { apiErrorMessage, COPY } from '../../copy';
import { ApiError, getApi } from '../../data';
import { toDomainProfile } from '../../state/appReducer';
import { useAppStore } from '../../state/AppStore';
import { OnboardingScaffold } from '../OnboardingScaffold';
import type { StepProps } from './types';

/**
 * Where the account is actually made — or where a returning person signs in.
 *
 * Both outcomes of `signUp` are handled, because a project that confirms
 * addresses answers every successful sign-up with no session at all, and
 * treating that as a failure was the bug this flow inherited.
 */
export function PasswordStep({ step, total, draft, patch, go, onBack }: StepProps) {
  const { dispatch } = useAppStore();
  const [password, setPassword] = useState(draft.password);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const api = getApi();
      patch({ password });

      if (draft.returning) {
        const session = await api.signIn(draft.email, password);
        const remote = await api.getOwnProfile();
        const activeHotel = remote ? await api.getActiveHotel() : null;
        patch({ password: '' });
        setPassword('');
        dispatch({
          type: 'AUTH_SUCCESS',
          session,
          profile: remote ? toDomainProfile(remote) : null,
        });
        // Same reason bootstrap does it: without this, signing back in looks
        // like an account that never chose a hotel and asks for one again.
        if (activeHotel) dispatch({ type: 'ACTIVE_HOTEL_LOADED', activeHotel });
        return;
      }

      const result = await api.signUp(draft.email, password);
      if (result.status === 'CONFIRMATION_REQUIRED') {
        patch({ password: '', awaitingConfirmation: true, confirmReason: 'signed-up' });
        setPassword('');
        go('confirmEmail');
        return;
      }
      patch({ password: '' });
      setPassword('');
      dispatch({ type: 'AUTH_SUCCESS', session: result.session, profile: null });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_NOT_CONFIRMED') {
        patch({ password: '', awaitingConfirmation: true, confirmReason: 'not-confirmed' });
        setPassword('');
        go('confirmEmail');
        return;
      }
      setError(err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown);
    } finally {
      setBusy(false);
    }
  };

  return (
    <OnboardingScaffold
      step={step}
      total={total}
      headline={draft.returning ? COPY.auth.signInTitle : COPY.onboarding.password.headline}
      body={draft.returning ? COPY.auth.signInBody : COPY.onboarding.password.body}
      onBack={onBack}
      actionLabel={draft.returning ? COPY.auth.signInButton : COPY.onboarding.continueButton}
      actionEnabled={password.length > 0 && !busy}
      actionBusy={busy}
      onAction={submit}
      error={error}
      testID="screen-onboarding-password"
    >
      <Field
        label={COPY.auth.passwordLabel}
        hideLabel
        value={password}
        onChangeText={setPassword}
        placeholder={COPY.auth.passwordPlaceholder}
        secureTextEntry
        autoCapitalize="none"
        textContentType="password"
        autoFocus
        editable={!busy}
        testID="auth-password"
      />
    </OnboardingScaffold>
  );
}
