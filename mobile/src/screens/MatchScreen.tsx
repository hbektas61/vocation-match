import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatar, Body, Button, Display, Gap, Notice, RoomRibbon, Screen } from '../components/ui';
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
      <Screen testID="screen-match">
        <Notice message={COPY.match.notAvailable} />
        <Button label={COPY.common.back} variant="secondary" onPress={() => navigation.goBack()} />
      </Screen>
    );
  }

  return (
    <Screen testID="screen-match">
      {/* Two faces, overlapping. The only screen in the app that is allowed to
          be a moment rather than a form. */}
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
      {hotel ? <RoomRibbon room={match.room} hotelName={hotel.name} /> : null}
      <Body>
        {`You and ${match.displayName} liked each other. `}
        {COPY.match.body}
      </Body>
      <Gap />
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
  faces: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingTop: spacing.lg,
  },
  facesOverlap: { marginLeft: -spacing.lg },
});
