import React, { useState } from 'react';

import { todayIsoDate } from '../clock';
import { Body, Button, Field, Gap, Notice, Screen, Title } from '../components/ui';
import { apiErrorMessage, COPY } from '../copy';
import { ApiError, getApi } from '../data';
import { isAdult, parseIsoDate } from '../domain/age';
import { toDomainProfile } from '../state/appReducer';
import { useAppStore } from '../state/AppStore';

export function ProfileSetupScreen() {
  const { dispatch } = useAppStore();
  const [displayName, setDisplayName] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [bio, setBio] = useState('');
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
    // `app.enforce_adult_profile` is the real enforcement point, and a
    // rejected save below shows this same message.
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
      });
      dispatch({ type: 'SAVE_PROFILE', profile: toDomainProfile(saved) });
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen testID="screen-profile-setup">
      <Title>{COPY.profileSetup.title}</Title>
      <Body>{COPY.profileSetup.intro}</Body>
      <Gap size="sm" />
      <Field
        label={COPY.profileSetup.nameLabel}
        value={displayName}
        onChangeText={setDisplayName}
        placeholder={COPY.profileSetup.namePlaceholder}
        editable={!submitting}
        testID="profile-name"
      />
      <Field
        label={COPY.profileSetup.birthdateLabel}
        value={birthdate}
        onChangeText={setBirthdate}
        placeholder={COPY.profileSetup.birthdatePlaceholder}
        keyboardType="numbers-and-punctuation"
        editable={!submitting}
        testID="profile-birthdate"
      />
      <Field
        label={COPY.profileSetup.bioLabel}
        value={bio}
        onChangeText={setBio}
        placeholder={COPY.profileSetup.bioPlaceholder}
        multiline
        editable={!submitting}
        testID="profile-bio"
      />
      {error ? <Notice message={error} tone="error" testID="profile-error" /> : null}
      <Gap size="sm" />
      <Button
        label={submitting ? COPY.profileSetup.saving : COPY.profileSetup.saveButton}
        onPress={save}
        disabled={submitting}
        testID="save-profile"
      />
    </Screen>
  );
}
