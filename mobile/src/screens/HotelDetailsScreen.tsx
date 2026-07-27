/**
 * The room behind "Otel detaylarını gör" (designer, 2026-07-27).
 *
 * Deliberately only what the catalogue truly knows: the photograph with its
 * credit, the name, the place, the address when OSM recorded one, and where
 * the data comes from. No stars, no price, no amenities — inventing those
 * would be lying about a business.
 */
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { Body, Caption, Heading, Screen, Title } from '../components/ui';
import { HotelBuilding } from '../components/HotelIllustrations';
import { COPY, upperCase } from '../copy';
import { readBackendConfig } from '../data';
import type { RootScreenProps } from '../navigation/types';
import { useAppStore } from '../state/AppStore';
import { color, font, fontFamily, radius, spacing } from '../theme';

const PinIcon = () => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color.accentDeep} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <Circle cx={12} cy={10} r={3} />
  </Svg>
);

export function HotelDetailsScreen({ route }: RootScreenProps<'HotelDetails'>) {
  const { state } = useAppStore();
  const hotel = state.hotels.find((h) => h.id === route.params.hotelId) ?? null;
  const config = readBackendConfig();

  if (!hotel) {
    return (
      <Screen testID="screen-hotel-details">
        <Body>{COPY.errors.notFound}</Body>
      </Screen>
    );
  }

  const source =
    hotel.photoUrl && config && hotel.photoUrl.includes('/functions/v1/hotel-photo')
      ? { uri: hotel.photoUrl, headers: { apikey: config.anonKey } }
      : hotel.photoUrl
        ? { uri: hotel.photoUrl }
        : null;

  return (
    <Screen testID="screen-hotel-details">
      {source ? (
        <View style={styles.photoWrap}>
          <Image source={source} style={styles.photo} resizeMode="cover" accessibilityIgnoresInvertColors />
          {hotel.photoAttribution ? (
            <Text style={styles.credit} numberOfLines={1}>
              {hotel.photoAttribution}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.artWrap}>
          <HotelBuilding size={96} />
        </View>
      )}
      <Title>{hotel.name}</Title>
      <View style={styles.placeRow}>
        <PinIcon />
        <Body>{`${hotel.city}, ${hotel.country}`}</Body>
      </View>
      {hotel.address ? (
        <View style={styles.block}>
          <Text style={styles.blockLabel}>{upperCase(COPY.hotel.addressLabel)}</Text>
          <Body>{hotel.address}</Body>
        </View>
      ) : null}
      <Caption>{COPY.hotel.attribution}</Caption>
    </Screen>
  );
}

const styles = StyleSheet.create({
  photoWrap: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  photo: { width: '100%', height: 210, backgroundColor: color.veil },
  credit: {
    position: 'absolute',
    bottom: 4,
    right: 8,
    fontFamily: fontFamily.body,
    fontSize: 10,
    color: 'rgba(255,255,255,0.9)',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 3,
    maxWidth: '80%',
  },
  artWrap: {
    height: 160,
    borderRadius: radius.md,
    backgroundColor: 'rgba(123, 79, 168, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  block: { gap: 4, marginTop: spacing.sm },
  blockLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.label,
    letterSpacing: 1.2,
    color: color.inkMuted,
  },
});
