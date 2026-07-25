import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { ProfilePhotoField } from '../components/ProfilePhoto';
import { Body, Button, Caption, Card, EmptyState, Heading, Notice, Screen, Title } from '../components/ui';
import { apiErrorMessage, COPY } from '../copy';
import { ApiError, getApi, type BlockedUser } from '../data';
import { toDomainProfile } from '../state/appReducer';
import { useAppStore } from '../state/AppStore';

export function SettingsScreen() {
  const { state, dispatch } = useAppStore();
  const [signingOut, setSigningOut] = useState(false);
  const [blocked, setBlocked] = useState<BlockedUser[] | null>(null);
  const [blockedError, setBlockedError] = useState<string | null>(null);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setBlockedError(null);
      (async () => {
        try {
          const fetched = await getApi().getBlockedUsers();
          if (!cancelled) {
            setBlocked(fetched);
            dispatch({ type: 'BLOCKED_USERS_LOADED', blockedUsers: fetched });
          }
        } catch (err) {
          if (!cancelled) {
            setBlockedError(err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown);
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [dispatch]),
  );

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await getApi().signOut();
    } finally {
      dispatch({ type: 'SIGN_OUT' });
    }
  };

  const unblock = async (userId: string) => {
    if (unblockingId) return;
    setUnblockingId(userId);
    try {
      await getApi().unblockUser(userId);
      dispatch({ type: 'USER_UNBLOCKED', userId });
      setBlocked((prev) => (prev ? prev.filter((b) => b.userId !== userId) : prev));
    } catch (err) {
      setBlockedError(err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown);
    } finally {
      setUnblockingId(null);
    }
  };

  return (
    <Screen testID="screen-settings">
      <Title>{COPY.settings.title}</Title>
      {state.profile ? (
        <Card testID="settings-profile">
          <Heading>{state.profile.displayName}</Heading>
          <Caption>Age {state.profile.age}</Caption>
          {state.profile.bio ? <Body>{state.profile.bio}</Body> : null}
        </Card>
      ) : null}
      {state.profile ? (
        <Card testID="settings-photo">
          <Heading>{COPY.photo.title}</Heading>
          <ProfilePhotoField
            displayName={state.profile.displayName}
            photoPath={state.profile.photoPath ?? null}
            onProfileChanged={(saved) =>
              dispatch({ type: 'SAVE_PROFILE', profile: toDomainProfile(saved) })
            }
          />
        </Card>
      ) : null}
      <Card>
        <Heading>{COPY.settings.accountTitle}</Heading>
        <Button
          label={COPY.settings.signOutButton}
          variant="secondary"
          onPress={signOut}
          disabled={signingOut}
          testID="sign-out"
        />
      </Card>
      <Card>
        <Heading>{COPY.settings.locationTitle}</Heading>
        <Body>{COPY.settings.locationNote}</Body>
        <Body>{COPY.trust.noExactLocation}</Body>
        <Body>{COPY.trust.oneHotel}</Body>
      </Card>
      <Card testID="settings-blocked">
        <Heading>{COPY.settings.blockedTitle}</Heading>
        {blockedError ? <Notice message={blockedError} tone="error" testID="blocked-error" /> : null}
        {blocked === null ? (
          <ActivityIndicator accessibilityLabel={COPY.common.loading} testID="blocked-loading" />
        ) : blocked.length === 0 ? (
          <EmptyState message={COPY.settings.blockedEmpty} />
        ) : (
          blocked.map((entry) => (
            <Card key={entry.userId}>
              <Body>{entry.displayName}</Body>
              <Button
                label={COPY.settings.unblockButton}
                variant="secondary"
                onPress={() => unblock(entry.userId)}
                disabled={unblockingId === entry.userId}
                testID={`unblock-${entry.userId}`}
              />
            </Card>
          ))
        )}
      </Card>
    </Screen>
  );
}
