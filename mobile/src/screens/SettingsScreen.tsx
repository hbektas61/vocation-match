import React, { useState } from 'react';

import { Body, Button, Caption, Card, Heading, Screen, Title } from '../components/ui';
import { nowMs } from '../clock';
import { COPY } from '../copy';
import { useAppStore } from '../state/AppStore';

export function SettingsScreen() {
  const { state, dispatch } = useAppStore();
  const [confirmingReset, setConfirmingReset] = useState(false);

  return (
    <Screen testID="screen-settings">
      <Title>{COPY.settings.title}</Title>
      {state.profile ? (
        <Card>
          <Heading>{state.profile.displayName}</Heading>
          <Caption>Age {state.profile.age}</Caption>
          {state.profile.bio ? <Body>{state.profile.bio}</Body> : null}
        </Card>
      ) : null}
      <Card>
        <Heading>Location and privacy</Heading>
        <Body>{COPY.settings.locationNote}</Body>
        <Body>{COPY.trust.noExactLocation}</Body>
        <Body>{COPY.trust.oneHotel}</Body>
      </Card>
      <Card>
        <Heading>Preview data</Heading>
        <Body>Resetting clears your profile, hotel, rooms, matches, and chats on this device.</Body>
        {confirmingReset ? (
          <>
            <Button
              label="Yes, reset everything"
              variant="danger"
              onPress={() => dispatch({ type: 'RESET', now: nowMs() })}
              testID="reset-confirm"
            />
            <Button
              label="Cancel"
              variant="secondary"
              onPress={() => setConfirmingReset(false)}
              testID="reset-cancel"
            />
          </>
        ) : (
          <Button
            label={COPY.settings.resetButton}
            variant="secondary"
            onPress={() => setConfirmingReset(true)}
            testID="reset-start"
          />
        )}
      </Card>
    </Screen>
  );
}
