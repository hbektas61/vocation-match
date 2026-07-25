import type { OwnProfile } from '../../data';
import type { OnboardingDraft, OnboardingStep } from '../OnboardingFlow';

/** What every step is given. A step supplies a question, never a layout. */
export interface StepProps {
  step: number;
  total: number;
  draft: OnboardingDraft;
  patch: (next: Partial<OnboardingDraft>) => void;
  go: (step: OnboardingStep) => void;
  profile: OwnProfile | null;
  /**
   * Going back one step, decided by the flow rather than by the step, so the
   * arrow and the Android back button cannot disagree. Absent where there is
   * nowhere to go, which is what makes the arrow absent too.
   */
  onBack?: () => void;
}

/** The steps that write the profile share the one call that does it. */
export interface SavingStepProps extends StepProps {
  saveProfile: (overrides: Partial<OnboardingDraft>) => Promise<void>;
}
