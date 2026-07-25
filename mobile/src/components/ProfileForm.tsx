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

import { Body, Button, Caption, Field, Gap, Notice } from './ui';
import { todayIsoDate } from '../clock';
import { apiErrorMessage, COPY } from '../copy';
import { ApiError, getApi, MAX_INTERESTS, type OwnProfile } from '../data';
import { isAdult, parseIsoDate } from '../domain/age';
import { INTEREST_CHOICES } from '../fixtures/interests';
import { ChoiceChip, ChoiceGroup } from '../onboarding/ChoiceChip';

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
  const [birthdate, setBirthdate] = useState(initial?.birthdate ?? '');
  const [bio, setBio] = useState(initial?.bio ?? '');
  const [interests, setInterests] = useState<string[]>(initial?.interests ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (submitting) return;
    const trimmedName = displayName.trim();
    if (trimmedName.length < 2) {
      setError(COPY.profileSetup.nameError);
      return;
    }
    if (!parseIsoDate(birthdate)) {
      setError(COPY.profileSetup.invalidBirthdate);
      return;
    }
    // Fast client-side feedback only — the database trigger
    // `app.enforce_adult_profile` is the real enforcement point, and it runs on
    // an update as well as an insert, so editing cannot get round it either.
    if (!isAdult(birthdate, todayIsoDate())) {
      setError(COPY.profileSetup.underAge);
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
        value={birthdate}
        onChangeText={setBirthdate}
        placeholder={COPY.profileSetup.birthdatePlaceholder}
        keyboardType="numbers-and-punctuation"
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
