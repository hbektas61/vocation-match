import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Body, Caption, Field } from '../../components/ui';
import { nowMs } from '../../clock';
import { apiErrorMessage, COPY } from '../../copy';
import { ApiError, getApi, type HotelCard } from '../../data';
import { useAppStore } from '../../state/AppStore';
import { color, radius, spacing } from '../../theme';
import { ChoiceChip } from '../ChoiceChip';
import { OnboardingScaffold } from '../OnboardingScaffold';
import type { StepProps } from './types';

/**
 * The last thing asked, and the one that cannot be skipped: every room in the
 * product is a room *at a hotel*, so there is nothing to show without one.
 *
 * The same search endpoint and the same one-active-hotel rule as the Hotel tab
 * — this is a different way in, not a different rule. Nothing is asked about a
 * reservation, a room number, or a document, because none of those exist.
 */
export function HotelStep({ step, total, go, onBack }: StepProps) {
  const { state, dispatch } = useAppStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<HotelCard[] | null>(null);
  const [chosen, setChosen] = useState<HotelCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (text: string) => {
    try {
      setResults(await getApi().searchHotels(text));
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorMessage(err.code) : COPY.hotel.loadError);
      setResults([]);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 150);
    return () => clearTimeout(timer);
  }, [query, search]);

  const activate = async () => {
    if (!chosen || busy) return;
    setBusy(true);
    setError(null);
    try {
      const api = getApi();
      await api.setActiveHotel(chosen.id);
      const active = await api.getActiveHotel();
      dispatch({ type: 'HOTELS_LOADED', hotels: [...state.hotels, chosen] });
      dispatch({
        type: 'HOTEL_ACTIVATED',
        activeHotel: active ?? { hotelId: chosen.id, activatedAt: nowMs() },
      });
      dispatch({ type: 'ONBOARDING_TEACHING_REQUIRED' });
      go('teaching');
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorMessage(err.code) : COPY.hotel.activateError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <OnboardingScaffold
      step={step}
      total={total}
      headline={COPY.onboarding.hotel.headline}
      body={COPY.onboarding.hotel.body}
      onBack={onBack}
      actionLabel={COPY.onboarding.hotel.confirm}
      actionEnabled={chosen !== null && !busy}
      actionBusy={busy}
      onAction={activate}
      error={error}
      testID="screen-onboarding-hotel"
    >
      <Field
        label={COPY.hotel.searchLabel}
        hideLabel
        value={query}
        onChangeText={(text) => {
          setQuery(text);
          setChosen(null);
        }}
        placeholder={COPY.hotel.searchPlaceholder}
        autoCapitalize="none"
        editable={!busy}
        testID="hotel-search"
      />
      {results === null ? (
        <ActivityIndicator accessibilityLabel={COPY.common.loading} testID="hotel-loading" />
      ) : results.length === 0 ? (
        <Body>{COPY.hotel.noResults}</Body>
      ) : (
        <View style={styles.list}>
          {results.map((hotel) => (
            <View key={hotel.id} style={styles.row}>
              <ChoiceChip
                label={hotel.name}
                selected={chosen?.id === hotel.id}
                onPress={() => setChosen(hotel)}
                testID={`activate-${hotel.id}`}
              />
              <Caption>{`${hotel.city}, ${hotel.country}`}</Caption>
            </View>
          ))}
        </View>
      )}
      {/* The selected chip already names the hotel; repeating it here read as
          two answers to one question. What is left is the rule that follows
          from choosing, which the chip cannot say. */}
      {chosen ? (
        <View style={styles.chosen} testID="hotel-chosen">
          <Body>{COPY.trust.oneHotel}</Body>
        </View>
      ) : null}
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  row: { gap: spacing.xs },
  chosen: {
    backgroundColor: color.accentSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
});
