/**
 * The room behind "Otel detaylarını gör" (designer, 2026-07-27).
 *
 * Deliberately only what the catalogue truly knows: the photograph with its
 * credit, the name, the place, the address when OSM recorded one, and where
 * the data comes from. No stars, no price, no amenities — inventing those
 * would be lying about a business.
 */
import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { Body, Button, Caption, Card, PhotoScrim, Screen, SuccessBadge, Title } from '../components/ui';
import { HotelBuilding } from '../components/HotelIllustrations';
import { COPY, upperCase } from '../copy';
import { getApi, readBackendConfig } from '../data';
import type { RootScreenProps } from '../navigation/types';
import { useAppStore } from '../state/AppStore';
import { color, font, fontFamily, radius, spacing } from '../theme';

const PinIcon = () => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color.accentDeep} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <Circle cx={12} cy={10} r={3} />
  </Svg>
);

export function HotelDetailsScreen({ route, navigation }: RootScreenProps<'HotelDetails'>) {
  const { state } = useAppStore();
  const hotel = state.hotels.find((h) => h.id === route.params.hotelId) ?? null;
  /**
   * Today this screen is only ever opened from the active venue's own card,
   * but the route takes an id and a route that takes an id can be pointed at
   * anything. The status card and the two actions all speak about the *active*
   * venue, so they appear only when this really is it.
   */
  const isActive = state.activeHotel?.hotelId === route.params.hotelId;
  const config = readBackendConfig();
  const isGoogle = hotel?.provider === 'google';
  /**
   * D-054: a Google venue's name is not stored, so it is resolved once for
   * this screen and kept in memory. `false` is "Google could not answer",
   * which the screen says outright rather than inventing a name.
   */
  const [googleName, setGoogleName] = useState<string | null | false>(null);

  useEffect(() => {
    if (!isGoogle) return;
    let cancelled = false;
    (async () => {
      const api = getApi();
      const venue = await api.getActiveVenue().catch(() => null);
      const placeId = venue?.hotelId === route.params.hotelId ? venue.googlePlaceId : null;
      if (!placeId) {
        if (!cancelled) setGoogleName(false);
        return;
      }
      const name = await api.resolveGooglePlace(placeId).catch(() => null);
      if (!cancelled) setGoogleName(name ?? false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isGoogle, route.params.hotelId]);

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
            <>
              {/* The credit prints on the photo, so it needs the same scrim
                  every piece of text on an image needs. */}
              <PhotoScrim />
              <Text style={styles.credit} numberOfLines={1}>
                {hotel.photoAttribution}
              </Text>
            </>
          ) : null}
        </View>
      ) : (
        <View style={styles.artWrap}>
          <HotelBuilding size={96} />
        </View>
      )}
      <Title>
        {isGoogle
          ? googleName === false
            ? COPY.venue.nameUnavailable
            : (googleName ?? COPY.common.loading)
          : hotel.name}
      </Title>
      {/* A Google venue's address and city are Google's content, so there is
          nothing of ours to print — the attribution stands in their place. */}
      {isGoogle ? null : (
        <View style={styles.placeRow}>
          <PinIcon />
          <Body>{`${hotel.city}, ${hotel.country}`}</Body>
        </View>
      )}
      {!isGoogle && hotel.address ? (
        <View style={styles.block}>
          <Text style={styles.blockLabel}>{upperCase(COPY.hotel.addressLabel)}</Text>
          <Body>{hotel.address}</Body>
        </View>
      ) : null}
      <Caption>{isGoogle ? COPY.venue.attribution : COPY.hotel.attribution}</Caption>

      {/*
        R-016. For a Google venue this screen is the name and the attribution
        and nothing else — which is correct, because D-054 forbids storing any
        of the rest — but correct is not the same as finished: it was a room
        with a door in and no door out, and ~500pt of blank under it.

        What it was missing is not more of Google's data. It is the one thing
        the *account* knows and the screen never said: that this is the venue
        the whole trip tab is currently built on. That fact, and the two
        things anybody would want to do with it.
      */}
      {isActive ? (
        <>
          <Card testID="hotel-details-status">
            <View style={styles.statusHead}>
              <SuccessBadge label={COPY.hotel.activePlate} testID="hotel-details-active" />
            </View>
            <Body>{COPY.hotel.activatedNote}</Body>
            <Caption>{COPY.trust.oneHotel}</Caption>
          </Card>
          <Button
            label={COPY.hotel.backToPlan}
            onPress={() => navigation.goBack()}
            testID="hotel-details-back-to-plan"
          />
          {/*
            `replace`, not `navigate`: choosing a new venue there hands you
            back with `goBack`, and if this screen were still on the stack you
            would land on the details of the venue you just left.
          */}
          <Button
            label={COPY.hotel.switchButton}
            variant="secondary"
            onPress={() => navigation.replace('ChooseHotel')}
            testID="hotel-details-change-venue"
          />
        </>
      ) : null}
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
    color: color.onPhoto,
    maxWidth: '80%',
  },
  // No photograph on file: the inert well a thumbnail ground uses, with the
  // building mark centred on it — the same job color.veil does everywhere
  // else an image would otherwise sit.
  artWrap: {
    height: 160,
    borderRadius: radius.md,
    backgroundColor: color.veil,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  /** The badge sits on its own row so it keeps its size beside nothing. */
  statusHead: { flexDirection: 'row' },
  block: { gap: 4, marginTop: spacing.sm },
  blockLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.label,
    letterSpacing: 1.2,
    color: color.inkMuted,
  },
});
