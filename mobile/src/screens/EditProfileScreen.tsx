import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { ProfileForm } from '../components/ProfileForm';
import { Body, Notice, Screen, Title } from '../components/ui';
import { apiErrorMessage, COPY } from '../copy';
import { ApiError, getApi, type OwnProfile } from '../data';
import type { RootScreenProps } from '../navigation/types';
import { toDomainProfile } from '../state/appReducer';
import { useAppStore } from '../state/AppStore';

/**
 * Changing your name, your bio, or a birthdate you typed wrong.
 *
 * The form is loaded from the server rather than from the cached domain
 * profile, because that one drops the exact birthdate for everyone but its
 * owner and an edit form has to start from what is actually stored — a form
 * that silently prefills an empty date and saves it would be worse than no
 * form at all.
 */
export function EditProfileScreen({ navigation }: RootScreenProps<'EditProfile'>) {
  const { dispatch } = useAppStore();
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const loaded = await getApi().getOwnProfile();
          if (!cancelled) {
            setProfile(loaded);
            if (!loaded) setError(COPY.editProfile.loadError);
          }
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof ApiError ? apiErrorMessage(err.code) : COPY.editProfile.loadError);
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  if (error) {
    return (
      <Screen testID="screen-edit-profile">
        <Title>{COPY.editProfile.title}</Title>
        <Notice message={error} tone="error" testID="edit-profile-load-error" />
      </Screen>
    );
  }

  if (!profile) {
    return (
      <Screen testID="screen-edit-profile">
        <Title>{COPY.editProfile.title}</Title>
        <ActivityIndicator accessibilityLabel={COPY.common.loading} testID="edit-profile-loading" />
      </Screen>
    );
  }

  return (
    <Screen testID="screen-edit-profile">
      <Title>{COPY.editProfile.title}</Title>
      <Body>{COPY.editProfile.intro}</Body>
      <ProfileForm
        initial={profile}
        submitLabel={COPY.editProfile.saveButton}
        submittingLabel={COPY.editProfile.saving}
        testIDPrefix="edit-profile"
        onSaved={(saved) => {
          dispatch({ type: 'SAVE_PROFILE', profile: toDomainProfile(saved) });
          navigation.goBack();
        }}
      />
    </Screen>
  );
}
