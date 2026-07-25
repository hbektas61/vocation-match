import React from 'react';

import { ProfilePhotoField } from '../../components/ProfilePhoto';
import { COPY } from '../../copy';
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
export function PhotoStep({ step, total, go, profile, onBack }: StepProps) {
  const { state, dispatch } = useAppStore();
  const current = state.profile?.photoPath ?? profile?.photoPath ?? null;

  return (
    <OnboardingScaffold
      step={step}
      total={total}
      headline={COPY.onboarding.photo.headline}
      body={COPY.onboarding.photo.body}
      onBack={onBack}
      onSkip={() => go('hotel')}
      actionLabel={COPY.onboarding.continueButton}
      actionEnabled
      onAction={() => go('hotel')}
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
