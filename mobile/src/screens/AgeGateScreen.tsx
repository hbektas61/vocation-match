import React from 'react';

import { Body, Button, Caption, Gap, Screen, Title } from '../components/ui';
import { COPY } from '../copy';
import { useAppStore } from '../state/AppStore';

export function AgeGateScreen() {
  const { dispatch } = useAppStore();
  return (
    <Screen testID="screen-age-gate">
      <Title>{COPY.appName}</Title>
      <Body>{COPY.tagline}</Body>
      <Gap size="lg" />
      <Title>{COPY.ageGate.title}</Title>
      <Body>{COPY.ageGate.body}</Body>
      <Gap />
      <Button
        label={COPY.ageGate.confirm}
        onPress={() => dispatch({ type: 'CONFIRM_AGE' })}
        testID="confirm-age"
      />
      <Gap size="sm" />
      <Caption>{COPY.trust.noExactLocation}</Caption>
    </Screen>
  );
}
