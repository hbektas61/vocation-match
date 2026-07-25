/**
 * The only way to set a profile photo in the app.
 *
 * There is no text field here and there never will be one: the server accepts
 * an object path under the caller's own prefix and nothing else, so "paste a
 * link to your picture" has no representation any more (decision D-014).
 */
import React, { useCallback, useEffect, useState } from 'react';

import { Avatar, Body, Button, Caption, Gap, Notice } from './ui';
import { apiErrorMessage, COPY } from '../copy';
import { ApiError, getApi, type OwnProfile } from '../data';
import { pickProfilePhoto } from '../data/imagePicker';

export function ProfilePhotoField({
  displayName,
  photoPath,
  onProfileChanged,
  showExplainer = true,
  chooseVariant = 'primary',
}: {
  displayName: string;
  photoPath: string | null;
  onProfileChanged: (profile: OwnProfile) => void;
  /** Off where the surrounding screen already carries the same sentence. */
  showExplainer?: boolean;
  /**
   * Secondary where the screen already has one primary action in its footer.
   * Two identical wide fills, stacked, say the two are equally important when
   * one of them is "move on".
   */
  chooseVariant?: 'primary' | 'secondary';
}) {
  // Kept with the path it belongs to, so removing a photo shows the fallback
  // on the same render rather than briefly showing the old one.
  const [resolved, setResolved] = useState<{ path: string | null; url: string | null }>({
    path: null,
    url: null,
  });
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const url = resolved.path === photoPath ? resolved.url : null;

  useEffect(() => {
    if (!photoPath) return;
    let cancelled = false;
    (async () => {
      try {
        const urls = await getApi().getPhotoUrls([photoPath]);
        if (!cancelled) setResolved({ path: photoPath, url: urls[photoPath] ?? null });
      } catch {
        // A photo that will not load is a cosmetic failure, not a reason to
        // put an error banner in front of someone editing their name.
        if (!cancelled) setResolved({ path: photoPath, url: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [photoPath]);

  const choose = useCallback(async () => {
    if (busy) return;
    setError(null);
    setBusy('upload');
    try {
      const picked = await pickProfilePhoto();
      if (picked.status === 'permission-denied') {
        setError(COPY.photo.permissionDenied);
        return;
      }
      if (picked.status === 'cancelled') {
        return;
      }
      const saved = await getApi().uploadProfilePhoto(picked.upload);
      onProfileChanged(saved);
    } catch (err) {
      // The upload failed, so the profile still points at whatever it pointed
      // at before. Saying so beats a spinner that stops with no explanation.
      setError(err instanceof ApiError ? apiErrorMessage(err.code) : COPY.photo.uploadError);
    } finally {
      setBusy(null);
    }
  }, [busy, onProfileChanged]);

  const remove = useCallback(async () => {
    if (busy) return;
    setError(null);
    setBusy('remove');
    try {
      const saved = await getApi().removeProfilePhoto();
      onProfileChanged(saved);
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorMessage(err.code) : COPY.photo.removeError);
    } finally {
      setBusy(null);
    }
  }, [busy, onProfileChanged]);

  return (
    <>
      <Avatar url={url} name={displayName} size="lg" testID="profile-photo" />
      {showExplainer ? <Caption>{COPY.photo.explainer}</Caption> : null}
      {error ? <Notice message={error} tone="error" testID="photo-error" /> : null}
      {!photoPath ? <Body>{COPY.photo.noPhoto}</Body> : null}
      <Gap size="xs" />
      <Button
        label={
          busy === 'upload'
            ? COPY.photo.uploading
            : photoPath
              ? COPY.photo.replaceButton
              : COPY.photo.addButton
        }
        variant={chooseVariant}
        busy={busy === 'upload'}
        disabled={busy !== null}
        onPress={choose}
        testID="choose-photo"
      />
      {photoPath ? (
        <Button
          label={busy === 'remove' ? COPY.photo.removing : COPY.photo.removeButton}
          variant="secondary"
          busy={busy === 'remove'}
          disabled={busy !== null}
          onPress={remove}
          testID="remove-photo"
        />
      ) : null}
    </>
  );
}
