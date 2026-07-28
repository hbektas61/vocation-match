import { useNavigation, type NavigationProp } from '@react-navigation/native';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { Body, Button, Caption, Card, Field, Gap, Notice, Screen, Title } from '../components/ui';
import { apiErrorMessage, COPY, COPY_FOR } from '../copy';
import {
  ApiError,
  deniedLocation,
  deviceLocation,
  fixedLocation,
  getApi,
  isFakeApiEnabled,
  type ActiveCheckin,
  type ForegroundLocationReader,
  type HotelCard,
} from '../data';
import { getHotelById } from '../fixtures/hotels';
import type { RootScreenProps, TabParamList } from '../navigation/types';
import { color, font, fontFamily, radius, spacing } from '../theme';

/**
 * Çevremde's door (D-039): a person about to check in is standing somewhere,
 * so the screen reads the location once and offers the venues around it —
 * tap one and you are in. No typing on the happy path; a search field stays
 * underneath as the fallback for a venue the map does not know yet, and it
 * checks in against the same reading, so the server's 500 m rule holds
 * either way. Simulation buttons appear only in the credential-free preview
 * (same rule as HereNowScreen) and walk the identical path.
 */
export function CheckinScreen({
  navigation: _navigation,
  reader = deviceLocation,
}: RootScreenProps<'Checkin'> & { reader?: ForegroundLocationReader }) {
  const tabNavigation = useNavigation<NavigationProp<TabParamList>>();
  const [checkin, setCheckin] = useState<ActiveCheckin | null | undefined>(undefined);
  const [reading, setReading] = useState<{ latitude: number; longitude: number } | null>(null);
  const [nearby, setNearby] = useState<HotelCard[] | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<HotelCard[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ message: string; tone: 'error' | 'info' } | null>(null);
  const searchSeq = useRef(0);

  useEffect(() => {
    let cancelled = false;
    getApi()
      .getCheckin()
      .then((current) => {
        if (!cancelled) setCheckin(current);
      })
      .catch(() => {
        if (!cancelled) setCheckin(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    const seq = ++searchSeq.current;
    const timer = setTimeout(async () => {
      try {
        const found = await getApi().searchHotels(trimmed);
        if (searchSeq.current === seq) setResults(found);
      } catch {
        if (searchSeq.current === seq) setResults([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  /** One reading serves both the list and every check-in made from it. */
  const lookAround = async (source: ForegroundLocationReader) => {
    setBusy(true);
    setNotice(null);
    const read = await source.read();
    if (read.status === 'denied') {
      setNotice({ message: COPY.hereNow.permissionDenied, tone: 'error' });
      setBusy(false);
      return;
    }
    if (read.status === 'unavailable') {
      setNotice({ message: COPY.hereNow.unavailable, tone: 'error' });
      setBusy(false);
      return;
    }
    try {
      const found = await getApi().nearbyVenues(read.latitude, read.longitude);
      setReading({ latitude: read.latitude, longitude: read.longitude });
      setNearby(found);
    } catch (err) {
      setNotice({
        message: err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown,
        tone: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const checkInAt = async (venue: HotelCard) => {
    if (!reading || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const answer = await getApi().recordCheckin(venue.id, reading.latitude, reading.longitude);
      if (!answer.withinRange) {
        setNotice({ message: COPY.checkin.tooFar, tone: 'error' });
      } else {
        setCheckin({
          venueId: venue.id,
          venueName: venue.name,
          expiresAt: answer.expiresAt ?? Date.now(),
        });
        setNearby(null);
        setReading(null);
        setQuery('');
        setResults([]);
      }
    } catch (err) {
      setNotice({
        message: err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown,
        tone: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const endCheckin = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await getApi().clearCheckin();
      setCheckin(null);
      setNotice({ message: COPY.checkin.checkedOut, tone: 'info' });
    } catch (err) {
      setNotice({
        message: err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown,
        tone: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  if (checkin === undefined) {
    return (
      <Screen testID="screen-checkin">
        <Title>{COPY.checkin.roomTitle}</Title>
        <ActivityIndicator accessibilityLabel={COPY.common.loading} testID="checkin-loading" />
      </Screen>
    );
  }

  // The preview's stand-in for standing somewhere: the fixture shore. Only
  // in the credential-free run — a real build reads the real device.
  const previewShore = isFakeApiEnabled() ? getHotelById('hotel-lara-shore') : null;

  const venueRow = (venue: HotelCard, keyPrefix: string) => (
    <Pressable
      key={`${keyPrefix}-${venue.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${venue.name}, ${venue.city}`}
      onPress={() => checkInAt(venue)}
      disabled={busy}
      style={({ pressed }) => [styles.resultRow, pressed && styles.resultPressed]}
      testID={`checkin-venue-${venue.id}`}
    >
      <Text style={styles.resultName}>{venue.name}</Text>
      <Caption>{venue.city}</Caption>
    </Pressable>
  );

  return (
    <Screen testID="screen-checkin">
      <Title>{COPY.checkin.roomTitle}</Title>

      {checkin ? (
        <>
          <Card testID="checkin-active">
            <Text style={styles.activeVenue}>{checkin.venueName}</Text>
            <Body>
              {COPY_FOR.checkinUntil(
                checkin.venueName,
                new Date(checkin.expiresAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              )}
            </Body>
            <Button
              label={COPY.checkin.seeNearby}
              onPress={() => tabNavigation.navigate('Discovery')}
              testID="checkin-see-nearby"
            />
            <Button
              label={COPY.checkin.checkOut}
              variant="secondary"
              onPress={endCheckin}
              disabled={busy}
              testID="checkin-clear"
            />
          </Card>
          <Caption>{COPY.checkin.cardBody}</Caption>
        </>
      ) : nearby === null ? (
        <>
          <Body>{COPY.checkin.explainer}</Body>
          <Gap size="sm" />
          <Button
            label={COPY.checkin.findVenues}
            onPress={() => lookAround(reader)}
            disabled={busy}
            testID="checkin-look-around"
          />
          {busy ? (
            <ActivityIndicator accessibilityLabel={COPY.common.loading} testID="checkin-looking" />
          ) : null}
          {previewShore ? (
            <Card>
              <Caption>{COPY.checkin.previewIntro}</Caption>
              <Button
                label={COPY.checkin.simulateShore}
                variant="secondary"
                onPress={() => lookAround(fixedLocation(previewShore.latitude, previewShore.longitude))}
                disabled={busy}
                testID="checkin-simulate-shore"
              />
              <Button
                label={COPY.hereNow.simulateDeny}
                variant="secondary"
                onPress={() => lookAround(deniedLocation())}
                disabled={busy}
                testID="checkin-simulate-deny"
              />
            </Card>
          ) : null}
        </>
      ) : (
        <>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            {COPY.checkin.aroundYou}
          </Text>
          {nearby.length === 0 ? (
            <Text style={styles.emptyBody} testID="checkin-no-venues">
              {COPY.checkin.noVenues}
            </Text>
          ) : (
            nearby.map((venue) => venueRow(venue, 'near'))
          )}

          {/* The fallback for a place the map does not know: search by name,
              check in against the same reading — the 500 m rule decides. */}
          <Gap size="sm" />
          <Caption>{COPY.checkin.searchFallback}</Caption>
          <Field
            label={COPY.checkin.searchPlaceholder}
            value={query}
            onChangeText={setQuery}
            testID="checkin-search"
          />
          {results.map((venue) => venueRow(venue, 'found'))}
        </>
      )}

      {notice ? (
        <Notice
          message={notice.message}
          tone={notice.tone === 'error' ? 'error' : undefined}
          testID="checkin-notice"
        />
      ) : null}
      <Caption>{COPY.trust.noExactLocation}</Caption>
    </Screen>
  );
}

const styles = StyleSheet.create({
  activeVenue: {
    fontFamily: fontFamily.display,
    fontSize: font.heading,
    color: color.ink,
  },
  sectionTitle: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.body,
    color: color.ink,
  },
  resultRow: {
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm + 4,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    gap: 2,
  },
  resultPressed: { opacity: 0.7 },
  emptyBody: {
    fontFamily: fontFamily.body,
    fontSize: font.body,
    lineHeight: font.body * 1.5,
    color: color.inkMuted,
  },
  resultName: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.body,
    color: color.ink,
  },
});
