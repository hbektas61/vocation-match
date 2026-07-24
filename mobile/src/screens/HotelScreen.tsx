import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import {
  Body,
  Button,
  Caption,
  Card,
  EmptyState,
  Field,
  Gap,
  Heading,
  Notice,
  Screen,
  Title,
} from '../components/ui';
import { nowMs } from '../clock';
import { COPY } from '../copy';
import type { Hotel } from '../domain/types';
import { getHotelById, searchHotels } from '../fixtures/hotels';
import { useAppStore } from '../state/AppStore';

export function HotelScreen() {
  const { state, dispatch } = useAppStore();
  const [query, setQuery] = useState('');
  // `null` results mean a search is in flight (loading state).
  const [results, setResults] = useState<Hotel[] | null>(() => searchHotels(''));
  const [pendingSwitch, setPendingSwitch] = useState<Hotel | null>(null);

  const activeHotel = getHotelById(state.activeHotel.activeHotelId);

  const changeQuery = (text: string) => {
    setQuery(text);
    setResults(null);
  };

  // Simulated fixture search latency so the loading state is real UI.
  useEffect(() => {
    const timer = setTimeout(() => {
      setResults(searchHotels(query));
    }, 150);
    return () => clearTimeout(timer);
  }, [query]);

  const activate = (hotel: Hotel) => {
    setPendingSwitch(null);
    dispatch({ type: 'ACTIVATE_HOTEL', hotelId: hotel.id, now: nowMs() });
  };

  const requestActivation = (hotel: Hotel) => {
    if (activeHotel && activeHotel.id !== hotel.id) {
      setPendingSwitch(hotel);
      return;
    }
    activate(hotel);
  };

  return (
    <Screen testID="screen-hotel">
      <Title>Your hotel</Title>
      {activeHotel ? (
        <Card>
          <Heading>{activeHotel.name}</Heading>
          <Caption>
            {activeHotel.city}, {activeHotel.country}
          </Caption>
          <Body>Active hotel. {COPY.trust.oneHotel}</Body>
        </Card>
      ) : (
        <Notice message={`No active hotel yet. ${COPY.trust.oneHotel}`} />
      )}

      {pendingSwitch ? (
        <Card>
          <Heading>Switch to {pendingSwitch.name}?</Heading>
          <Body>{COPY.trust.switchWarning}</Body>
          <Button
            label={`Switch to ${pendingSwitch.name}`}
            onPress={() => activate(pendingSwitch)}
            testID="confirm-switch"
          />
          <Button
            label="Keep current hotel"
            variant="secondary"
            onPress={() => setPendingSwitch(null)}
            testID="cancel-switch"
          />
        </Card>
      ) : null}

      <Gap size="sm" />
      <Field
        label="Search hotels"
        value={query}
        onChangeText={changeQuery}
        placeholder="Hotel name or city"
        testID="hotel-search"
      />
      {results === null ? (
        <View accessibilityLabel="Loading hotels">
          <ActivityIndicator />
        </View>
      ) : results.length === 0 ? (
        <EmptyState message="No hotels match that search in the preview catalog." />
      ) : (
        results.map((hotel) => (
          <Card key={hotel.id}>
            <Heading>{hotel.name}</Heading>
            <Caption>
              {hotel.city}, {hotel.country}
            </Caption>
            {activeHotel?.id === hotel.id ? (
              <Caption>This is your active hotel.</Caption>
            ) : (
              <Button
                label={`Activate ${hotel.name}`}
                onPress={() => requestActivation(hotel)}
                testID={`activate-${hotel.id}`}
              />
            )}
          </Card>
        ))
      )}
    </Screen>
  );
}
