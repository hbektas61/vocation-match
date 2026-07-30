import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { LanguageSwitch } from '../components/LanguageSwitch';
import { unregisterPush } from '../notifications/push';
import { PhotoGrid } from '../components/PhotoGrid';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';

import { Avatar, Body, Button, Caption, Card, EmptyState, Heading, Notice, Screen, SectionLabel, Title } from '../components/ui';
import { apiErrorMessage, COPY } from '../copy';
import { ApiError, getApi, type BlockedUser, type ProfilePhoto } from '../data';
import { resetDeckLabels } from '../data/venueLabels';
import type { RootStackParamList } from '../navigation/types';
import { usePhotoUrls } from '../state/usePhotoUrls';
import { useAppStore } from '../state/AppStore';
import { color, gradient, spacing } from '../theme';

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
    // The ordinary UNAUTHENTICATED copy asks the person to sign in, but a
    // deletion with a lost/expired session has an uncertain server outcome.
    return error.code === 'UNAUTHENTICATED'
      ? COPY.deleteAccount.unconfirmed
      : COPY.deleteAccount.refused;
  }
  return COPY.deleteAccount.unconfirmed;
}

export function SettingsScreen() {
  const { state, dispatch } = useAppStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [signingOut, setSigningOut] = useState(false);
  const [blocked, setBlocked] = useState<BlockedUser[] | null>(null);
  const [blockedError, setBlockedError] = useState<string | null>(null);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<ProfilePhoto[]>([]);
  const profileUrls = usePhotoUrls([state.profile?.photoPath ?? null]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setBlockedError(null);
      // The photo set, so the grid shows what is actually there rather than
      // filling in from a cached primary.
      getApi()
        .getOwnPhotos()
        .then((existing) => {
          if (!cancelled) setPhotos(existing);
        })
        .catch(() => undefined);
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
    // While still signed in — the server rightly refuses this afterwards.
    await unregisterPush(getApi());
    if (signingOut) return;
    setSigningOut(true);
    try {
      await getApi().signOut();
      // V-011: the deck's resolved venue labels are one person's session, and
      // the next person to sign in on this device gets their own budget.
      resetDeckLabels();
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
    <Screen safeTop testID="screen-settings">
      <Title>{COPY.settings.title}</Title>
      {state.profile ? (
        <Card testID="settings-profile">
          {/* The face first: this screen's subject is the person, and a card
              that opens with a section label reads as a form about them. */}
          <View style={styles.profileHead}>
            {/* The designer's ring (D-044): the avatar inside the brand
                gradient, the crown only when Premium is actually true. */}
            <View>
              <LinearGradient
                colors={[...gradient.primary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.avatarRing}
              >
                <View style={styles.avatarSeat}>
                  <Avatar
                    url={state.profile.photoPath ? profileUrls[state.profile.photoPath] ?? null : null}
                    name={state.profile.displayName}
                    size="md"
                  />
                </View>
              </LinearGradient>
              {state.profile.isPremium ? (
                <View style={styles.crownBadge} testID="settings-premium-crown">
                  <Svg width={14} height={14} viewBox="0 0 24 24" fill="#FBBF24">
                    <Path d="M3 8l4.5 4L12 5l4.5 7L21 8l-1.8 10H4.8z" />
                  </Svg>
                </View>
              ) : null}
            </View>
            <View style={styles.profileText}>
              <Heading>{`${state.profile.displayName}, ${state.profile.age}`}</Heading>
              {state.profile.bio ? <Body numberOfLines={2}>{state.profile.bio}</Body> : null}
            </View>
          </View>
          {/* Until this existed, a name typed wrong during onboarding was
              permanent — on a product where the name is most of what a
              stranger has to go on. */}
          <Button
            label={COPY.editProfile.openButton}
            variant="secondary"
            onPress={() => navigation.navigate('EditProfile')}
            testID="open-edit-profile"
          />
        </Card>
      ) : null}
      {state.profile ? (
        <Card testID="settings-photo">
          <SectionLabel>{COPY.photo.title}</SectionLabel>
          {/* The same grid as onboarding. Two photo components meant two photo
              models, and the single-photo one deleted every object under the
              prefix except the one it knew about — which, once a profile could
              hold nine, meant changing your photo here silently destroyed the
              other eight. One model, one code path. */}
          <Caption>{COPY.photo.explainer}</Caption>
          <PhotoGrid photos={photos} onChanged={setPhotos} testID="settings-photo-grid" />
        </Card>
      ) : null}
      <Card>
        <SectionLabel>{COPY.language.label}</SectionLabel>
        <LanguageSwitch testID="settings-language" />
      </Card>
      <Card>
        <SectionLabel>{COPY.settings.accountTitle}</SectionLabel>
        <Button
          label={COPY.settings.signOutButton}
          variant="secondary"
          onPress={signOut}
          disabled={signingOut}
          testID="sign-out"
        />
      </Card>
      <Card>
        <SectionLabel>{COPY.settings.locationTitle}</SectionLabel>
        <Body>{COPY.settings.locationNote}</Body>
        <Body>{COPY.trust.noExactLocation}</Body>
        <Body>{COPY.trust.oneHotel}</Body>
      </Card>
      {/* D-053 §6: the provider disclosure sits beside the location note,
          where somebody looking for it would look, and says what is actually
          stored rather than gesturing at a policy page we do not have yet. */}
      <Card testID="settings-providers">
        <SectionLabel>{COPY.settings.providersTitle}</SectionLabel>
        <Body>{COPY.settings.providersOpen}</Body>
        <Body>{COPY.settings.providersGoogle}</Body>
        <Body>{COPY.settings.providersGoogleStorage}</Body>
        <Body>{COPY.settings.providersVenue}</Body>
        <Body>{COPY.settings.providersRetention}</Body>
        <Body>{COPY.settings.providersTerms}</Body>
      </Card>
      <Card testID="settings-blocked">
        <SectionLabel>{COPY.settings.blockedTitle}</SectionLabel>
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
        <SectionLabel>{COPY.deleteAccount.title}</SectionLabel>
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

const styles = StyleSheet.create({
  profileHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatarRing: { borderRadius: 999, padding: 3 },
  avatarSeat: { borderRadius: 999, padding: 3, backgroundColor: color.surface },
  crownBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: color.background,
    borderWidth: 1.5,
    borderColor: '#FBBF24',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileText: { flex: 1, gap: 2 },
});
