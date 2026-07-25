import React from 'react';

import { ProfileForm } from '../components/ProfileForm';
import { Body, Gap, Screen, Title } from '../components/ui';
import { COPY } from '../copy';
import { toDomainProfile } from '../state/appReducer';
import { useAppStore } from '../state/AppStore';

/** The first save. Everything after it goes through Settings → Edit profile. */
export function ProfileSetupScreen() {
  const { dispatch } = useAppStore();

  return (
    <Screen testID="screen-profile-setup">
      <Title>{COPY.profileSetup.title}</Title>
      <Body>{COPY.profileSetup.intro}</Body>
      <Gap size="sm" />
      <ProfileForm
        initial={null}
        submitLabel={COPY.profileSetup.saveButton}
        submittingLabel={COPY.profileSetup.saving}
        onSaved={(saved) => dispatch({ type: 'SAVE_PROFILE', profile: toDomainProfile(saved) })}
      />
      {/* A photo needs a profile row to point at, so it is the next step
          rather than part of this one. Settings is where it lives. */}
      <Body>{COPY.profileSetup.photoLater}</Body>
    </Screen>
  );
}
