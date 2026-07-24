import React, { useState } from 'react';

import { Body, Button, Field, Gap, Notice, Screen, Title } from '../components/ui';
import { SELF_ID } from '../fixtures/candidates';
import { useAppStore } from '../state/AppStore';

export function ProfileSetupScreen() {
  const { dispatch } = useAppStore();
  const [displayName, setDisplayName] = useState('');
  const [age, setAge] = useState('');
  const [bio, setBio] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const trimmedName = displayName.trim();
    const parsedAge = Number(age);
    if (!trimmedName) {
      setError('Please enter a display name.');
      return;
    }
    if (!Number.isInteger(parsedAge) || parsedAge < 18 || parsedAge > 120) {
      setError('Age must be a whole number of 18 or more.');
      return;
    }
    setError(null);
    dispatch({
      type: 'SAVE_PROFILE',
      profile: {
        id: SELF_ID,
        displayName: trimmedName,
        age: parsedAge,
        bio: bio.trim(),
        interests: [],
      },
    });
  };

  return (
    <Screen testID="screen-profile-setup">
      <Title>Your profile</Title>
      <Body>Only your display name, age, and bio are shown to others.</Body>
      <Gap size="sm" />
      <Field
        label="Display name"
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="How should we show you?"
        testID="profile-name"
      />
      <Field
        label="Age"
        value={age}
        onChangeText={setAge}
        placeholder="18+"
        keyboardType="number-pad"
        testID="profile-age"
      />
      <Field
        label="Bio"
        value={bio}
        onChangeText={setBio}
        placeholder="A sentence about you"
        multiline
        testID="profile-bio"
      />
      {error ? <Notice message={error} tone="error" /> : null}
      <Gap size="sm" />
      <Button label="Save profile" onPress={save} testID="save-profile" />
    </Screen>
  );
}
