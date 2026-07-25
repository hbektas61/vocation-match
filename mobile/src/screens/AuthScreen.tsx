import React, { useState } from 'react';

import { Body, Button, Caption, Field, Gap, Notice, Screen, Title } from '../components/ui';
import { apiErrorMessage, COPY } from '../copy';
import { ApiError, FakeApi, getApi, hasBackendConfig } from '../data';
import { toDomainProfile } from '../state/appReducer';
import { useAppStore } from '../state/AppStore';

type Mode = 'signIn' | 'signUp';

/** Real email + password authentication against the typed API boundary. */
export function AuthScreen() {
  const { dispatch } = useAppStore();
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Set once the server has said "an account exists for this address and it has
   * not been confirmed". Reached two ways: straight after a sign-up, and after
   * a sign-in the server refuses for that reason.
   */
  const [awaitingConfirmation, setAwaitingConfirmation] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  const canSubmit = !submitting && email.trim().length > 0 && password.length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      const api = getApi();
      if (mode === 'signUp') {
        const result = await api.signUp(email, password);
        if (result.status === 'CONFIRMATION_REQUIRED') {
          // Not a failure. This is what a correctly configured project answers
          // to every successful sign-up.
          setAwaitingConfirmation(result.email);
          return;
        }
        dispatch({ type: 'AUTH_SUCCESS', session: result.session, profile: null });
        return;
      }

      const session = await api.signIn(email, password);
      // An existing account might already have a profile, so look it up rather
      // than assuming the onboarding profile-setup step is next.
      const remoteProfile = await api.getOwnProfile();
      dispatch({
        type: 'AUTH_SUCCESS',
        session,
        profile: remoteProfile ? toDomainProfile(remoteProfile) : null,
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_NOT_CONFIRMED') {
        setAwaitingConfirmation(email.trim());
        return;
      }
      setError(err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown);
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    if (!awaitingConfirmation || resending) return;
    setResending(true);
    setError(null);
    try {
      await getApi().resendConfirmationEmail(awaitingConfirmation);
      setResent(true);
    } catch {
      setError(COPY.confirmEmail.resendError);
    } finally {
      setResending(false);
    }
  };

  const backToSignIn = () => {
    setAwaitingConfirmation(null);
    setResent(false);
    setError(null);
    setMode('signIn');
  };

  /** Preview build only: there is no mailbox behind the in-memory backend. */
  const simulateConfirmation = () => {
    const api = getApi();
    if (awaitingConfirmation && api instanceof FakeApi) {
      api.confirmEmail(awaitingConfirmation);
    }
    backToSignIn();
  };

  if (awaitingConfirmation) {
    return (
      <Screen testID="screen-confirm-email">
        <Title>{COPY.confirmEmail.title}</Title>
        <Body>{COPY.confirmEmail.body}</Body>
        <Body>{awaitingConfirmation}</Body>
        {error ? <Notice message={error} tone="error" testID="confirm-error" /> : null}
        {resent ? <Notice message={COPY.confirmEmail.resent} testID="confirm-resent" /> : null}
        <Gap size="sm" />
        <Button
          label={resending ? COPY.confirmEmail.resending : COPY.confirmEmail.resendButton}
          onPress={resend}
          busy={resending}
          disabled={resending}
          testID="confirm-resend"
        />
        <Button
          label={COPY.confirmEmail.backButton}
          variant="secondary"
          onPress={backToSignIn}
          testID="confirm-back"
        />
        {!hasBackendConfig() ? (
          <>
            <Gap size="sm" />
            <Caption>{COPY.confirmEmail.simulateIntro}</Caption>
            <Button
              label={COPY.confirmEmail.simulateButton}
              variant="secondary"
              onPress={simulateConfirmation}
              testID="simulate-confirm-email"
            />
          </>
        ) : null}
      </Screen>
    );
  }

  const switchMode = () => {
    setMode((current) => (current === 'signUp' ? 'signIn' : 'signUp'));
    setError(null);
  };

  return (
    <Screen testID="screen-auth">
      <Title>{mode === 'signUp' ? COPY.auth.signUpTitle : COPY.auth.signInTitle}</Title>
      <Body>{mode === 'signUp' ? COPY.auth.signUpBody : COPY.auth.signInBody}</Body>
      <Gap size="sm" />
      <Field
        label={COPY.auth.emailLabel}
        value={email}
        onChangeText={setEmail}
        placeholder={COPY.auth.emailPlaceholder}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        editable={!submitting}
        testID="auth-email"
      />
      <Field
        label={COPY.auth.passwordLabel}
        value={password}
        onChangeText={setPassword}
        placeholder={COPY.auth.passwordPlaceholder}
        secureTextEntry
        autoCapitalize="none"
        textContentType="password"
        editable={!submitting}
        testID="auth-password"
      />
      {error ? <Notice message={error} tone="error" testID="auth-error" /> : null}
      <Gap size="sm" />
      <Button
        label={
          submitting
            ? mode === 'signUp'
              ? COPY.auth.signUpSubmitting
              : COPY.auth.signInSubmitting
            : mode === 'signUp'
              ? COPY.auth.signUpButton
              : COPY.auth.signInButton
        }
        onPress={submit}
        disabled={!canSubmit}
        busy={submitting}
        testID="auth-submit"
      />
      <Gap size="sm" />
      <Button
        label={mode === 'signUp' ? COPY.auth.switchToSignIn : COPY.auth.switchToSignUp}
        variant="secondary"
        onPress={switchMode}
        disabled={submitting}
        testID="auth-switch-mode"
      />
    </Screen>
  );
}
