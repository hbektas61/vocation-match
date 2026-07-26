import React, { useState } from 'react';

import { ProfilePhotoField } from '../../components/ProfilePhoto';
import { apiErrorMessage, COPY } from '../../copy';
import { ApiError } from '../../data';
import { toDomainProfile } from '../../state/appReducer';
import { useAppStore } from '../../state/AppStore';
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
  const { state, dispatch } = useAppStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = state.profile?.photoPath ?? profile?.photoPath ?? null;

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
      <ProfilePhotoField
        // The step's own subtitle already says where the photo lives and who
        // can see it; printing the same paragraph twice on one screen reads as
        // a mistake rather than as emphasis.
        showExplainer={false}
        chooseVariant="secondary"
        displayName={state.profile?.displayName ?? profile?.displayName ?? ''}
        photoPath={current}
        onProfileChanged={(saved) =>
          dispatch({ type: 'SAVE_PROFILE', profile: toDomainProfile(saved) })
        }
      />
    </OnboardingScaffold>
  );
}
