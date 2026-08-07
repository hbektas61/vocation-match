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
import { StyleSheet, View } from 'react-native';
import Eye from 'lucide-react-native/icons/eye';

import { DateField } from './DateField';
import { Body, Button, Caption, Card, Field, Gap, Notice, SectionLabel, ToggleRow } from './ui';
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
import { dateDigitsFromIso, dateProblem, isoFromDateDigits } from '../domain/dateInput';
import {
  genderLabel,
  MORE_GENDERS,
  ORIENTATIONS,
  orientationLabel,
  PRIMARY_GENDERS,
  SHOW_ME_VALUES,
} from '../fixtures/identity';
import { INTEREST_CHOICES } from '../fixtures/interests';
import { ChoiceChip, ChoiceGroup, ChoiceRow } from '../onboarding/ChoiceChip';
import { genderIcon, interestIcon, showMeIcon } from '../onboarding/stepIcons';
import { color } from '../theme';

/** The mark inside a `ToggleRow`'s leading tile (176:4488). */
const TOGGLE_GLYPH = 20;

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
      <DateField
        label={COPY.profileSetup.birthdateLabel}
        hint={COPY.profileSetup.birthdateHint}
        digits={birthdateDigits}
        onDigits={setBirthdateDigits}
        editable={!submitting}
        testID={`${testIDPrefix}-birthdate`}
      />
      <Body>{COPY.profileSetup.birthdateNote}</Body>

      {/* The contract's sections (176:4441/4455/4481): a tracked label above
          the thing it names, rather than a sentence in front of it. The label
          is found; the sentence under a field is read. */}
      <SectionLabel>{COPY.profileSetup.bioLabel}</SectionLabel>
      <Field
        label={COPY.profileSetup.bioLabel}
        hideLabel
        value={bio}
        onChangeText={setBio}
        placeholder={COPY.profileSetup.bioPlaceholder}
        multiline
        editable={!submitting}
        testID={`${testIDPrefix}-bio`}
      />
      <SectionLabel>{COPY.onboarding.interests.headline}</SectionLabel>
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
              icon={interestIcon(choice, selected ? color.accentDeep : color.inkMuted)}
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
      <SectionLabel>{COPY.onboarding.gender.headline}</SectionLabel>
      <ChoiceGroup testID={`${testIDPrefix}-gender`}>
        {[...PRIMARY_GENDERS, ...MORE_GENDERS].map((value) => (
          <ChoiceChip
            key={value}
            label={genderLabel(value)}
            icon={genderIcon(value)}
            selected={gender === value}
            onPress={() => setGender(value)}
            testID={`${testIDPrefix}-gender-${value.toLowerCase().replace(/\s+/g, '-')}`}
          />
        ))}
      </ChoiceGroup>

      <SectionLabel>{COPY.onboarding.orientation.headline}</SectionLabel>
      <ChoiceGroup
        hint={COPY.onboarding.orientation.limit(MAX_ORIENTATIONS)}
        testID={`${testIDPrefix}-orientations`}
      >
        {ORIENTATIONS.map((value) => {
          const selected = orientations.includes(value);
          return (
            <ChoiceRow
              key={value}
              label={orientationLabel(value)}
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
      <Caption>{COPY.onboarding.orientation.notAFilter}</Caption>

      <SectionLabel>{COPY.onboarding.showMe.headline}</SectionLabel>
      <ChoiceGroup hint={COPY.onboarding.showMe.body} testID={`${testIDPrefix}-show-me`}>
        {SHOW_ME_VALUES.map((value) => (
          <ChoiceChip
            key={value}
            label={COPY.identity.showMe[value] ?? value}
            icon={showMeIcon(value, TOGGLE_GLYPH)}
            selected={showMe === value}
            onPress={() => setShowMe(value)}
            testID={`${testIDPrefix}-show-me-${value.toLowerCase()}`}
          />
        ))}
      </ChoiceGroup>

      {/* The visibility card (176:4481–4503). The two answers about what other
          people see used to be checkboxes sitting under the group each one was
          about — a tick on the way to submitting a form. They are not that:
          they are two things about the profile that are on or off right now,
          which is what the contract draws and what a switch means. Gathering
          them into one card is also the only way the question "who sees what"
          gets answered in one place instead of twice, forty lines apart. */}
      <SectionLabel>{COPY.profileSetup.visibilityTitle}</SectionLabel>
      <Card>
        <ToggleRow
          label={COPY.onboarding.gender.showOnProfile}
          glyph={<Eye size={TOGGLE_GLYPH} color={color.accentDeep} strokeWidth={2} />}
          value={showGender}
          onChange={setShowGender}
          tone="flat"
          testID={`${testIDPrefix}-show-gender`}
        />
        <View style={styles.visibilityRule} />
        <ToggleRow
          label={COPY.onboarding.orientation.showOnProfile}
          glyph={<Eye size={TOGGLE_GLYPH} color={color.accentDeep} strokeWidth={2} />}
          value={showOrientation}
          onChange={setShowOrientation}
          tone="flat"
          testID={`${testIDPrefix}-show-orientation`}
        />
      </Card>
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

const styles = StyleSheet.create({
  /** The hairline between two rows inside one card (176:4517). */
  visibilityRule: { height: 1, backgroundColor: color.rule },
});
