import React, { useState } from 'react';

import { DateField } from '../../components/DateField';
import { DigitKeypad } from '../../components/DigitKeypad';
import { todayIsoDate } from '../../clock';
import { apiErrorMessage, birthdateMessage, COPY } from '../../copy';
import { ApiError } from '../../data';
import { dateDigitsFromIso, dateProblem, isoFromDateDigits } from '../../domain/dateInput';
import { OnboardingScaffold } from '../OnboardingScaffold';
import type { SavingStepProps } from './types';

/**
 * The first step that writes anything, because `saveOwnProfile` needs a name
 * and a birthdate together.
 *
 * The 18+ check here is only for a fast answer. `app.enforce_adult_profile`
 * refuses an underage date on insert and on update, so a client that skipped
 * this would be refused by the database — which is where the rule lives.
 */
export function BirthdateStep({
  step,
  total,
  draft,
  patch,
  go,
  profile,
  onBack,
  saveProfile,
}: SavingStepProps) {
  // Digits, not a date. The field shows `DD/MM/YYYY` and the server is given
  // ISO; keeping the digits as the state means neither form has to be parsed
  // back out of the other on every keystroke.
  const [digits, setDigits] = useState(() =>
    dateDigitsFromIso(draft.birthdate || profile?.birthdate || ''),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = todayIsoDate();
  const problem = dateProblem(digits, today);

  const submit = async () => {
    if (busy) return;
    if (problem !== null) {
      setError(birthdateMessage(problem));
      return;
    }
    const birthdate = isoFromDateDigits(digits);
    if (!birthdate) {
      setError(COPY.profileSetup.invalidBirthdate);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      patch({ birthdate });
      await saveProfile({ birthdate });
      go('gender');
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
      headline={COPY.onboarding.birthdate.headline}
      body={COPY.onboarding.birthdate.body}
      onBack={onBack}
      actionLabel={COPY.onboarding.continueButton}
      // Live as soon as the answer is a real date, not only once it is an
      // allowed one. A date that is refused has a reason worth hearing, and a
      // disabled button cannot give one — it just leaves somebody retyping a
      // birthday that will never be accepted.
      actionEnabled={isoFromDateDigits(digits) !== null && !busy}
      actionBusy={busy}
      onAction={submit}
      error={error}
      testID="screen-onboarding-birthdate"
    >
      <DateField
        label={COPY.profileSetup.birthdateLabel}
        hint={COPY.profileSetup.birthdateHint}
        invalid={error !== null}
        digits={digits}
        onDigits={setDigits}
        autoFocus
        editable={!busy}
        softKeyboard={false}
        testID="profile-birthdate"
      />
      {/* The designer's own keypad (D-044) instead of the system keyboard. */}
      <DigitKeypad
        onDigit={(digit) => setDigits((current) => (current + digit).slice(0, 8))}
        onDelete={() => setDigits((current) => current.slice(0, -1))}
        disabled={busy}
      />
    </OnboardingScaffold>
  );
}

