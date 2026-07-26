import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Avatar,
  Body,
  Button,
  Display,
  DoorPlate,
  Gap,
  Heading,
  KeyCard,
  Notice,
  RoomRibbon,
  Screen,
} from '../components/ui';
import { COPY } from '../copy';
import type { RootScreenProps } from '../navigation/types';
import { usePhotoUrls } from '../state/usePhotoUrls';
import { useAppStore } from '../state/AppStore';
import { spacing } from '../theme';

export function MatchScreen({ navigation, route }: RootScreenProps<'Match'>) {
  const { state } = useAppStore();
  const match = state.matches.find((m) => m.matchId === route.params.matchId) ?? null;
  const hotel = state.hotels.find((h) => h.id === state.activeHotel?.hotelId) ?? null;
  const photoPaths = useMemo(() => [match?.photoPath ?? null, state.profile?.photoPath ?? null], [
    match?.photoPath,
    state.profile?.photoPath,
  ]);
  const photoUrls = usePhotoUrls(photoPaths);

  if (!match) {
    return (
      <Screen safeTop testID="screen-match">
        <Notice message={COPY.match.notAvailable} />
        <Button label={COPY.common.back} variant="secondary" onPress={() => navigation.goBack()} />
      </Screen>
    );
  }

  return (
    <Screen safeTop testID="screen-match">
      {/* The one screen allowed to be a moment rather than a form. Faces
          first, then the fact no other app could print — the shared hotel —
          as the key card it would be in the world. */}
      <View style={styles.stage}>
        <View style={styles.faces}>
          <Avatar
            url={state.profile?.photoPath ? photoUrls[state.profile.photoPath] ?? null : null}
            name={state.profile?.displayName ?? 'You'}
            size="lg"
          />
          <View style={styles.facesOverlap}>
            <Avatar
              url={match.photoPath ? photoUrls[match.photoPath] ?? null : null}
              name={match.displayName}
              size="lg"
              testID="match-photo"
            />
          </View>
        </View>
        <Display>{COPY.match.title}</Display>
      </View>

      {hotel ? (
        <KeyCard open>
          <DoorPlate>{COPY.match.bothAtPlate}</DoorPlate>
          <Heading>{hotel.name}</Heading>
          {/* The heading above already names the hotel; the ribbon adds only
              the room, or it would say the same thing twice in one card. */}
          <RoomRibbon room={match.room} hotelName={null} />
        </KeyCard>
      ) : null}

      <Body>
        {`You and ${match.displayName} liked each other. `}
        {COPY.match.body}
      </Body>
      <Gap size="sm" />
      <Button
        label={`Say hello to ${match.displayName}`}
        onPress={() => navigation.replace('Chat', { matchId: match.matchId })}
        testID="match-open-chat"
      />
      <Button
        label={COPY.match.keepBrowsing}
        variant="secondary"
        onPress={() => navigation.goBack()}
        testID="match-keep-browsing"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stage: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.lg },
  faces: { flexDirection: 'row', justifyContent: 'center' },
  facesOverlap: { marginLeft: -spacing.lg },
});
