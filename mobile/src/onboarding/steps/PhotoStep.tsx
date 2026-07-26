import React, { useEffect, useState } from 'react';

import { PhotoGrid } from '../../components/PhotoGrid';
import { apiErrorMessage, COPY } from '../../copy';
import { ApiError, getApi, type ProfilePhoto } from '../../data';
import { OnboardingScaffold } from '../OnboardingScaffold';
import type { StepProps } from './types';

/**
 * One photo, because one is what the backend stores. A three-by-three grid
 * would be a picture of a product that does not exist.
 *
 * Everything about how a photo is handled — the private bucket, the EXIF strip
 * before upload, the refused-permission message, the failed-upload behaviour —
 * is `ProfilePhotoField`, unchanged. This screen only frames it.
 */
export function PhotoStep({
  step,
  total,
  profile,
  onBack,
  finish,
}: StepProps & { finish: () => Promise<void> }) {
  const [photos, setPhotos] = useState<ProfilePhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The last step, so it finishes rather than navigating. A photo is not
  // required (D-024), which is why Done is live either way — but the profile
  // is a draft until this call returns, and a failed call must leave it one.
  const done = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await finish();
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown);
    } finally {
      setBusy(false);
    }
  };

  // The set already on the account, so coming back to this step shows what is
  // there rather than an empty grid over a profile that has photos.
  useEffect(() => {
    let cancelled = false;
    getApi()
      .getOwnPhotos()
      .then((existing) => {
        if (!cancelled) setPhotos(existing);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <OnboardingScaffold
      step={step}
      total={total}
      headline={COPY.onboarding.photo.headline}
      body={COPY.onboarding.photo.body}
      onBack={onBack}
      actionLabel={COPY.onboarding.photo.done}
      actionEnabled={!busy}
      actionBusy={busy}
      onAction={done}
      error={error}
      testID="screen-onboarding-photo"
    >
      <PhotoGrid photos={photos} onChanged={setPhotos} />
    </OnboardingScaffold>
  );
}
