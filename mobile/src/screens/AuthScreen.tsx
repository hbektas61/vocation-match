import React, { useState } from 'react';

import { Body, Button, Field, Gap, Notice, Screen, Title } from '../components/ui';
import { apiErrorMessage, COPY } from '../copy';
import { ApiError, getApi } from '../data';
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

  const canSubmit = !submitting && email.trim().length > 0 && password.length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      const api = getApi();
      const session =
        mode === 'signUp' ? await api.signUp(email, password) : await api.signIn(email, password);
      // A new account has no profile yet; an existing one might, so look it
      // up rather than assuming the onboarding profile-setup step is next.
      const remoteProfile = mode === 'signUp' ? null : await api.getOwnProfile();
      dispatch({
        type: 'AUTH_SUCCESS',
        session,
        profile: remoteProfile ? toDomainProfile(remoteProfile) : null,
      });
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown);
    } finally {
      setSubmitting(false);
    }
  };

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
