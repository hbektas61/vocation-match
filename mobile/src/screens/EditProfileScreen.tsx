import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { ProfileForm } from '../components/ProfileForm';
import { Body, ErrorState, Screen, SkeletonRows } from '../components/ui';
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
  /**
   * Focus and the retry button run the same load, so the two cannot drift.
   * The guard is a ref rather than the effect's own `cancelled` flag because
   * the retry is not an effect and has no cleanup to hang one on.
   */
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const loaded = await getApi().getOwnProfile();
      if (!mounted.current) return;
      setProfile(loaded);
      if (!loaded) setError(COPY.editProfile.loadError);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof ApiError ? apiErrorMessage(err.code) : COPY.editProfile.loadError);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // The stack header (RootNavigator) already prints this screen's name and
  // draws the way back, which is what the contract's header row is (176:4431).
  // Printing a `Title` under it said "Profilini düzenle" twice — the same
  // duplication D-057 took out of Settings.
  if (error) {
    return (
      <Screen testID="screen-edit-profile">
        <ErrorState message={error} onRetry={() => void load()} testID="edit-profile-load-error" />
      </Screen>
    );
  }

  if (!profile) {
    return (
      <Screen testID="screen-edit-profile">
        {/* A form waits as the shape of a form (177:5316's sibling rule), not
            as an arc in a void. */}
        <SkeletonRows rows={4} avatar={false} testID="edit-profile-loading" />
      </Screen>
    );
  }

  return (
    <Screen testID="screen-edit-profile">
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
