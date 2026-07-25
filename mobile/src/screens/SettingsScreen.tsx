import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { ProfilePhotoField } from '../components/ProfilePhoto';
import { Body, Button, Caption, Card, EmptyState, Heading, Notice, Screen, Title } from '../components/ui';
import { apiErrorMessage, COPY } from '../copy';
import { ApiError, getApi, type BlockedUser } from '../data';
import { toDomainProfile } from '../state/appReducer';
import { useAppStore } from '../state/AppStore';

/**
 * What the app is entitled to claim about a deletion that did not visibly work.
 *
 * A refusal from the server is a fact: it answered, and nothing was deleted.
 * A dropped connection is not — the transaction may have committed and only the
 * response been lost. Telling someone "nothing was deleted" in that case is a
 * confident statement about something the client cannot know, and it is the
 * wrong half of H-205 to get wrong.
 */
function deletionFailureMessage(error: unknown): string {
  if (error instanceof ApiError && error.code !== 'NETWORK' && error.code !== 'UNKNOWN') {
    // `apiErrorMessage` is written for sign-in and says "email or password is
    // incorrect" for UNAUTHENTICATED, which is nonsense on this screen.
    return error.code === 'UNAUTHENTICATED'
      ? COPY.deleteAccount.unconfirmed
      : COPY.deleteAccount.refused;
  }
  return COPY.deleteAccount.unconfirmed;
}

export function SettingsScreen() {
  const { state, dispatch } = useAppStore();
  const [signingOut, setSigningOut] = useState(false);
  const [blocked, setBlocked] = useState<BlockedUser[] | null>(null);
  const [blockedError, setBlockedError] = useState<string | null>(null);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  const deleteAccount = async () => {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await getApi().deleteAccount();
      // Only now. Signing out first would hide a failure behind a login screen
      // and leave someone believing an account was deleted when it was not.
      dispatch({ type: 'SIGN_OUT' });
    } catch (err) {
      setDeleteError(deletionFailureMessage(err));
      setDeleting(false);
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
      <Card testID="settings-delete-account">
        <Heading>{COPY.deleteAccount.title}</Heading>
        <Body>{COPY.deleteAccount.intro}</Body>
        {deleteError ? (
          <Notice message={deleteError} tone="error" testID="delete-account-error" />
        ) : null}
        {confirmingDelete ? (
          <>
            {/* Everything irreversible is said before the tap that does it,
                not after. Two taps, and the second one is labelled with what
                it actually does. */}
            <Body>{COPY.deleteAccount.whatGoes}</Body>
            <Body>{COPY.deleteAccount.whatStays}</Body>
            {/* `error` tone, not `info`: only that tone is announced by a
                screen reader (see `Notice`). Someone using VoiceOver can reach
                the delete button without their cursor ever passing over the
                paragraphs above it, so all three sentences are announced
                together rather than only the last one. */}
            <Notice
              message={`${COPY.deleteAccount.noUndo} ${COPY.deleteAccount.whatGoes} ${COPY.deleteAccount.whatStays}`}
              tone="error"
              testID="delete-account-warning"
            />
            <Button
              label={deleting ? COPY.deleteAccount.deleting : COPY.deleteAccount.confirmButton}
              variant="danger"
              busy={deleting}
              disabled={deleting}
              onPress={deleteAccount}
              testID="delete-account-confirm"
            />
            <Button
              label={COPY.deleteAccount.cancelButton}
              variant="secondary"
              disabled={deleting}
              onPress={() => {
                setConfirmingDelete(false);
                setDeleteError(null);
              }}
              testID="delete-account-cancel"
            />
          </>
        ) : (
          <Button
            label={COPY.deleteAccount.startButton}
            variant="danger"
            onPress={() => setConfirmingDelete(true)}
            testID="delete-account"
          />
        )}
      </Card>
    </Screen>
  );
}
