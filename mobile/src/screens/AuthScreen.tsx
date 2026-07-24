import React from 'react';

import { Body, Button, Gap, Screen, Title } from '../components/ui';
import { COPY } from '../copy';
import { useAppStore } from '../state/AppStore';

/** Placeholder sign-in. Real authentication ships with the backend milestone. */
export function AuthScreen() {
  const { dispatch } = useAppStore();
  return (
    <Screen testID="screen-auth">
      <Title>{COPY.auth.title}</Title>
      <Body>{COPY.auth.body}</Body>
      <Gap />
      <Button
        label={COPY.auth.continueButton}
        onPress={() => dispatch({ type: 'SIGN_IN' })}
        testID="sign-in"
      />
    </Screen>
  );
}
