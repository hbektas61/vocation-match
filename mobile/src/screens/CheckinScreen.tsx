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
  type ActiveCheckin,
  type ForegroundLocationReader,
  type HotelCard,
} from '../data';
import { getHotelById } from '../fixtures/hotels';
import type { RootScreenProps, TabParamList } from '../navigation/types';
import { color, font, fontFamily, radius, spacing } from '../theme';

/**
 * Çevremde's door (D-039): pick the venue you are standing at, prove it once
 * with a foreground reading, and carry a three-hour check-in. The screen
 * mirrors HereNowScreen's grammar — the real reader by default, the
 * simulation card only when the fixture catalogue knows the venue (the
 * credential-free preview) — so a simulated check-in and a real one walk
 * the identical path.
 */
export function CheckinScreen({
  navigation,
  reader = deviceLocation,
}: RootScreenProps<'Checkin'> & { reader?: ForegroundLocationReader }) {
  const tabNavigation = useNavigation<NavigationProp<TabParamList>>();
  const [checkin, setCheckin] = useState<ActiveCheckin | null | undefined>(undefined);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<HotelCard[]>([]);
  const [venue, setVenue] = useState<HotelCard | null>(null);
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

  const runCheckin = async (target: HotelCard, source: ForegroundLocationReader) => {
    setBusy(true);
    setNotice(null);
    const reading = await source.read();
    if (reading.status === 'denied') {
      setNotice({ message: COPY.hereNow.permissionDenied, tone: 'error' });
      setBusy(false);
      return;
    }
    if (reading.status === 'unavailable') {
      setNotice({ message: COPY.hereNow.unavailable, tone: 'error' });
      setBusy(false);
      return;
    }
    try {
      const answer = await getApi().recordCheckin(target.id, reading.latitude, reading.longitude);
      if (!answer.withinRange) {
        setNotice({ message: COPY.checkin.tooFar, tone: 'error' });
      } else {
        setCheckin({
          venueId: target.id,
          venueName: target.name,
          expiresAt: answer.expiresAt ?? Date.now(),
        });
        setVenue(null);
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

  // The fixture only knows the fake's venues; on a real project the
  // simulation card simply never appears (same rule as HereNowScreen).
  const simulationSource = venue ? getHotelById(venue.id) : null;

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
      ) : (
        <>
          <Body>{COPY.checkin.explainer}</Body>
          <Gap size="sm" />
          <Field
            label={COPY.checkin.searchPlaceholder}
            value={query}
            onChangeText={(next) => {
              setQuery(next);
              setVenue(null);
            }}
            testID="checkin-search"
          />
          {results.map((hotel) => (
            <Pressable
              key={hotel.id}
              accessibilityRole="button"
              accessibilityLabel={`${hotel.name}, ${hotel.city}`}
              onPress={() => setVenue(hotel)}
              style={({ pressed }) => [
                styles.resultRow,
                venue?.id === hotel.id && styles.resultChosen,
                pressed && styles.resultPressed,
              ]}
              testID={`checkin-result-${hotel.id}`}
            >
              <Text style={styles.resultName}>{hotel.name}</Text>
              <Caption>{hotel.city}</Caption>
            </Pressable>
          ))}
          {venue ? (
            <Card>
              <Body>{COPY.checkin.verifyIntro}</Body>
              <Button
                label={COPY.checkin.verifyButton}
                onPress={() => runCheckin(venue, reader)}
                disabled={busy}
                testID="checkin-verify"
              />
              {simulationSource ? (
                <>
                  <Button
                    label={COPY.checkin.simulateAtVenue}
                    variant="secondary"
                    onPress={() =>
                      runCheckin(
                        venue,
                        fixedLocation(simulationSource.latitude, simulationSource.longitude),
                      )
                    }
                    disabled={busy}
                    testID="checkin-simulate-near"
                  />
                  <Button
                    label={COPY.checkin.simulateFar}
                    variant="secondary"
                    onPress={() =>
                      runCheckin(
                        venue,
                        fixedLocation(simulationSource.latitude + 0.05, simulationSource.longitude),
                      )
                    }
                    disabled={busy}
                    testID="checkin-simulate-far"
                  />
                  <Button
                    label={COPY.hereNow.simulateDeny}
                    variant="secondary"
                    onPress={() => runCheckin(venue, deniedLocation())}
                    disabled={busy}
                    testID="checkin-simulate-deny"
                  />
                </>
              ) : null}
            </Card>
          ) : null}
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
  resultRow: {
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm + 4,
    borderRadius: radius.md,
    gap: 2,
  },
  resultChosen: { backgroundColor: 'rgba(123, 79, 168, 0.10)' },
  resultPressed: { opacity: 0.7 },
  resultName: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.body,
    color: color.ink,
  },
});
