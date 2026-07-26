/**
 * The one place a profile is written from.
 *
 * There used to be exactly one: the screen you see once, during onboarding.
 * That meant a typo in your own name was permanent — on a product where the
 * name is most of what a stranger has to go on. Now the same form serves both
 * the first save and every edit after it, so the validation, the copy, and the
 * 18+ message cannot drift between the two.
 */
import React, { useState } from 'react';

import { Body, Button, Caption, Checkbox, Field, Gap, Notice } from './ui';
import { todayIsoDate } from '../clock';
import { apiErrorMessage, birthdateMessage, COPY } from '../copy';
import {
  ApiError,
  getApi,
  MAX_INTERESTS,
  MAX_ORIENTATIONS,
  type OwnProfile,
  type ShowMe,
} from '../data';
import {
  dateDigitsFromIso,
  dateProblem,
  formatDateInput,
  isoFromDateDigits,
  toDateDigits,
} from '../domain/dateInput';
import {
  genderLabel,
  MORE_GENDERS,
  ORIENTATIONS,
  PRIMARY_GENDERS,
  SHOW_ME_OPTIONS,
} from '../fixtures/identity';
import { INTEREST_CHOICES } from '../fixtures/interests';
import { ChoiceChip, ChoiceGroup, ChoiceRow } from '../onboarding/ChoiceChip';

export function ProfileForm({
  initial,
  submitLabel,
  submittingLabel,
  onSaved,
  testIDPrefix = 'profile',
}: {
  /** The profile being edited, or null on the first save. */
  initial: OwnProfile | null;
  submitLabel: string;
  submittingLabel: string;
  onSaved: (profile: OwnProfile) => void;
  testIDPrefix?: string;
}) {
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '');
  // The same digits-in, ISO-out arrangement the onboarding step uses, so a
  // date is written and read the one way everywhere in the app.
  const [birthdateDigits, setBirthdateDigits] = useState(() =>
    dateDigitsFromIso(initial?.birthdate ?? ''),
  );
  const [bio, setBio] = useState(initial?.bio ?? '');
  const [interests, setInterests] = useState<string[]>(initial?.interests ?? []);
  const [gender, setGender] = useState(initial?.gender ?? '');
  const [showGender, setShowGender] = useState(initial?.showGender ?? false);
  const [orientations, setOrientations] = useState<string[]>(initial?.orientations ?? []);
  const [showOrientation, setShowOrientation] = useState(initial?.showOrientation ?? false);
  const [showMe, setShowMe] = useState<ShowMe | ''>(initial?.showMe ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (submitting) return;
    const trimmedName = displayName.trim();
    if (trimmedName.length < 2) {
      setError(COPY.profileSetup.nameError);
      return;
    }
    // Fast client-side feedback only — the database trigger
    // `app.enforce_adult_profile` is the real enforcement point, and it runs on
    // an update as well as an insert, so editing cannot get round it either.
    const problem = dateProblem(birthdateDigits, todayIsoDate());
    const birthdate = isoFromDateDigits(birthdateDigits);
    if (problem !== null || !birthdate) {
      setError(birthdateMessage(problem));
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const saved = await getApi().saveOwnProfile({
        displayName: trimmedName,
        birthdate,
        bio: bio.trim() || null,
        interests,
        // Sent only when there is something to send. An empty gender here
        // would be a form clearing an answer it merely failed to load.
        ...(gender ? { gender } : {}),
        showGender,
        orientations,
        showOrientation,
        ...(showMe ? { showMe } : {}),
      });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Field
        label={COPY.profileSetup.nameLabel}
        value={displayName}
        onChangeText={setDisplayName}
        placeholder={COPY.profileSetup.namePlaceholder}
        editable={!submitting}
        testID={`${testIDPrefix}-name`}
      />
      <Field
        label={COPY.profileSetup.birthdateLabel}
        hint={COPY.profileSetup.birthdateHint}
        value={formatDateInput(birthdateDigits)}
        onChangeText={(text) => setBirthdateDigits(toDateDigits(text))}
        placeholder={COPY.profileSetup.birthdatePlaceholder}
        keyboardType="number-pad"
        editable={!submitting}
        testID={`${testIDPrefix}-birthdate`}
      />
      <Body>{COPY.profileSetup.birthdateNote}</Body>
      <Field
        label={COPY.profileSetup.bioLabel}
        value={bio}
        onChangeText={setBio}
        placeholder={COPY.profileSetup.bioPlaceholder}
        multiline
        editable={!submitting}
        testID={`${testIDPrefix}-bio`}
      />
      <Caption>{COPY.onboarding.interests.headline}</Caption>
      <ChoiceGroup
        hint={
          interests.length >= MAX_INTERESTS
            ? COPY.onboarding.interests.atLimit(MAX_INTERESTS)
            : COPY.onboarding.interests.limit(MAX_INTERESTS)
        }
        testID={`${testIDPrefix}-interests`}
      >
        {INTEREST_CHOICES.map((choice) => {
          const selected = interests.includes(choice);
          return (
            <ChoiceChip
              key={choice}
              label={choice}
              selected={selected}
              disabled={!selected && interests.length >= MAX_INTERESTS}
              onPress={() =>
                setInterests((current) =>
                  selected ? current.filter((c) => c !== choice) : [...current, choice],
                )
              }
              testID={`${testIDPrefix}-interest-${choice.toLowerCase().replace(/\s+/g, '-')}`}
            />
          );
        })}
      </ChoiceGroup>

      {/* The three identity answers, editable for the same reason the name is:
          onboarding asks them once, and being wrong about yourself forever is
          not a reasonable consequence of a mistap. `showMe` matters most —
          it decides whose cards this person is shown, so getting it wrong and
          having no way back would leave somebody with an empty deck and no
          explanation. */}
      <Caption>{COPY.onboarding.gender.headline}</Caption>
      <ChoiceGroup testID={`${testIDPrefix}-gender`}>
        {[...PRIMARY_GENDERS, ...MORE_GENDERS].map((value) => (
          <ChoiceChip
            key={value}
            label={genderLabel(value)}
            selected={gender === value}
            onPress={() => setGender(value)}
            testID={`${testIDPrefix}-gender-${value.toLowerCase().replace(/\s+/g, '-')}`}
          />
        ))}
      </ChoiceGroup>
      <Checkbox
        label={COPY.onboarding.gender.showOnProfile}
        checked={showGender}
        onChange={setShowGender}
        testID={`${testIDPrefix}-show-gender`}
      />

      <Caption>{COPY.onboarding.orientation.headline}</Caption>
      <ChoiceGroup
        hint={COPY.onboarding.orientation.limit(MAX_ORIENTATIONS)}
        testID={`${testIDPrefix}-orientations`}
      >
        {ORIENTATIONS.map((value) => {
          const selected = orientations.includes(value);
          return (
            <ChoiceRow
              key={value}
              label={value}
              selected={selected}
              disabled={!selected && orientations.length >= MAX_ORIENTATIONS}
              onPress={() =>
                setOrientations((current) =>
                  selected ? current.filter((v) => v !== value) : [...current, value],
                )
              }
              testID={`${testIDPrefix}-orientation-${value.toLowerCase()}`}
            />
          );
        })}
      </ChoiceGroup>
      <Checkbox
        label={COPY.onboarding.orientation.showOnProfile}
        checked={showOrientation}
        onChange={setShowOrientation}
        testID={`${testIDPrefix}-show-orientation`}
      />
      <Caption>{COPY.onboarding.orientation.notAFilter}</Caption>

      <Caption>{COPY.onboarding.showMe.headline}</Caption>
      <ChoiceGroup hint={COPY.onboarding.showMe.body} testID={`${testIDPrefix}-show-me`}>
        {SHOW_ME_OPTIONS.map((option) => (
          <ChoiceChip
            key={option.value}
            label={option.label}
            selected={showMe === option.value}
            onPress={() => setShowMe(option.value)}
            testID={`${testIDPrefix}-show-me-${option.value.toLowerCase()}`}
          />
        ))}
      </ChoiceGroup>
      {error ? <Notice message={error} tone="error" testID={`${testIDPrefix}-error`} /> : null}
      <Gap size="sm" />
      <Button
        label={submitting ? submittingLabel : submitLabel}
        busy={submitting}
        onPress={save}
        disabled={submitting}
        testID={`save-${testIDPrefix}`}
      />
    </>
  );
}
