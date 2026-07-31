/**
 * Choosing where the holiday is (D-054), in two steps.
 *
 * Step A asks for a *destination* — a city, an island, a resort area — and
 * accepts nothing that is a business. Step B asks for a venue inside it, and
 * its default mode carries no type restriction at all, which is the whole
 * reason a beach club Google files under `bar` is findable here.
 *
 * The cost controls the brief asks for live in this file, because this is
 * where the keystrokes are (§6):
 *
 *   - three characters before anything is asked,
 *   - a 350 ms debounce,
 *   - one request in flight per field, so a fast typist cannot stack them,
 *   - a ticket per request, so a slow answer to an old query can never land on
 *     top of a fast answer to the current one,
 *   - and the server's own deduplication, which answers a repeated query with
 *     `duplicate` and no upstream call — the list already on screen stays.
 *
 * Nothing Google returns is written anywhere. The prediction text lives in
 * this component's state for as long as the list is drawn, and the only thing
 * that survives a selection is the opaque token the backend issued.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { Caption, Chip, EmptyState, Field, Notice } from './ui';
import { COPY } from '../copy';
import { ApiError, getApi, type GooglePlaceHit, type VenueSearchMode } from '../data';
import { color, fontFamily, radius, spacing } from '../theme';

/** The server's floor, mirrored so a request is never made below it. */
export const VENUE_MIN_QUERY = 3;
/** Long enough that a word typed at speed is one request, not eight. */
export const VENUE_DEBOUNCE_MS = 350;

const MagnifierIcon = () => (
  <View style={{ marginRight: spacing.sm }}>
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color.inkMuted} strokeWidth={2.2} strokeLinecap="round">
      <Circle cx={11} cy={11} r={7} />
      <Path d="M21 21l-4.5-4.5" />
    </Svg>
  </View>
);

const PinIcon = () => (
  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={color.accentDeep} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <Circle cx={12} cy={10} r={3} />
  </Svg>
);

const CHIPS: { mode: VenueSearchMode; label: () => string }[] = [
  { mode: 'all', label: () => COPY.venue.chipAll },
  { mode: 'stay', label: () => COPY.venue.chipStay },
];

/** Enough characters to be a search rather than a letter. */
export function longEnough(text: string): boolean {
  return text.trim().replace(/\s+/g, '').length >= VENUE_MIN_QUERY;
}

export function VenuePicker({
  onChosen,
  busy = false,
}: {
  /** A single-use token, and the chip it was found under. */
  onChosen: (selectionToken: string, mode: VenueSearchMode, name: string) => void;
  busy?: boolean;
}) {
  const [destination, setDestination] = useState<{ name: string; sessionId: string } | null>(null);
  const [mode, setMode] = useState<VenueSearchMode>('all');
  const [query, setQuery] = useState('');
  /**
   * The last answer. `null` is "nothing has been asked yet"; `[]` is a real
   * answer with nothing in it. Loading is its own flag rather than a `null`
   * here, because a de-duplicated answer's whole point is that the list
   * already on screen is still the right one — clearing it to show a spinner
   * would throw away the thing the deduplication exists to reuse.
   */
  const [results, setResults] = useState<GooglePlaceHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);

  /** The destination step's own session, so Google bills one per search. */
  const destinationSession = useRef<string | undefined>(undefined);
  /**
   * The ticket a response must still hold to be allowed on screen. Bumped by
   * every keystroke, every chip, and every step change — which is also what
   * makes "a new destination clears the old predictions" true here as well as
   * on the server.
   */
  const ticketRef = useRef(0);
  /**
   * One request per field, and the newest query always wins.
   *
   * The first cut simply refused to start a second request while one was in
   * flight — which quietly dropped the query the user had just typed, because
   * the debounce had already fired and would not fire again. So a request that
   * arrives during another is remembered instead, and runs the moment the
   * first settles. Never two at once, and never a lost keystroke.
   */
  const inFlight = useRef(false);
  const queued = useRef<{ text: string; ticket: number; mode: VenueSearchMode } | null>(null);

  const reset = useCallback((keepDestination: boolean) => {
    ticketRef.current += 1;
    inFlight.current = false;
    queued.current = null;
    setQuery('');
    setResults(null);
    setLoading(false);
    setProblem(null);
    if (!keepDestination) {
      destinationSession.current = undefined;
      setDestination(null);
      setMode('all');
    }
  }, []);

  const search = useCallback(
    async (text: string, ticket: number, currentMode: VenueSearchMode) => {
      if (inFlight.current) {
        // Remembered, not dropped: it runs as soon as the current one lands.
        queued.current = { text, ticket, mode: currentMode };
        return;
      }
      inFlight.current = true;
      setLoading(true);
      try {
        const api = getApi();
        const answer = destination
          ? await api.searchVacationVenues(text, destination.sessionId, currentMode)
          : await api.searchDestinations(text, destinationSession.current);
        // Stale: a newer query is already the question on screen.
        if (ticket !== ticketRef.current) return;
        if (!answer) {
          // Null is "do not offer this" — unconfigured, a ceiling, a limit, an
          // unwell provider. Never "there is no such place".
          setProblem(COPY.venue.unavailable);
          setResults([]);
          return;
        }
        if (!destination) destinationSession.current = answer.sessionId;
        setProblem(null);
        // A duplicate answered nothing upstream: the predictions already on
        // screen are still the right ones, so they stay.
        if (answer.duplicate) {
          setResults((current) => current ?? []);
          return;
        }
        setResults(answer.places);
      } catch (error) {
        if (ticket !== ticketRef.current) return;
        if (error instanceof ApiError && error.code === 'DESTINATION_REQUIRED') {
          // The venue session lapsed. Nothing typed here will work until a
          // destination is chosen again, so the step goes back rather than
          // offering a retry that cannot succeed.
          reset(false);
          setProblem(COPY.errors.destinationRequired);
          return;
        }
        setProblem(COPY.venue.unavailable);
        setResults([]);
      } finally {
        inFlight.current = false;
        const next = queued.current;
        queued.current = null;
        if (next && next.ticket === ticketRef.current) {
          void search(next.text, next.ticket, next.mode);
        } else {
          setLoading(false);
        }
      }
    },
    [destination, reset],
  );

  useEffect(() => {
    if (!longEnough(query)) return;
    const ticket = (ticketRef.current += 1);
    const timer = setTimeout(() => {
      search(query.trim(), ticket, mode);
    }, VENUE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, mode, search]);

  const changeQuery = (text: string) => {
    setQuery(text);
    // Back to the prompt rather than showing the last query's hits under a
    // new one, which is how a stale list gets selected by mistake.
    if (!longEnough(text)) {
      ticketRef.current += 1;
      queued.current = null;
      setResults(null);
      setLoading(false);
      setProblem(null);
    }
  };

  const chooseDestination = async (hit: GooglePlaceHit) => {
    setCommitting(true);
    setProblem(null);
    try {
      const choice = await getApi().chooseDestination(hit.selectionToken);
      if (!choice) {
        setProblem(COPY.venue.unavailable);
        return;
      }
      reset(true);
      destinationSession.current = undefined;
      setDestination({ name: hit.name, sessionId: choice.sessionId });
    } finally {
      setCommitting(false);
    }
  };

  const step: 'destination' | 'venue' = destination ? 'venue' : 'destination';
  const heading = destination
    ? COPY.venue.destinationChosen(destination.name)
    : COPY.venue.destinationTitle;
  const noResults = destination ? COPY.venue.venueNoResults : COPY.venue.destinationNoResults;
  /**
   * The line under the empty field. On the destination step it used to repeat
   * `destinationHint` — which is already printed above the field — so the same
   * sentence appeared twice on one screen and the one thing somebody actually
   * needs to know, that nothing is searched under three characters, was said
   * nowhere. The venue step's own prompt is not a repeat, so it stays.
   */
  const prompt = destination ? COPY.venue.venuePrompt : COPY.venue.minQuery;

  return (
    <View testID={`venue-picker-${step}`}>
      <Text accessibilityRole="header" style={styles.heading}>
        {heading}
      </Text>
      {destination ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => reset(false)}
          style={styles.changeRow}
          testID="venue-change-destination"
        >
          <PinIcon />
          <Text style={styles.changeText}>{COPY.venue.changeDestination}</Text>
        </Pressable>
      ) : (
        <Text style={styles.hint}>{COPY.venue.destinationHint}</Text>
      )}

      <Field
        label={destination ? COPY.venue.venueLabel : COPY.venue.destinationLabel}
        hideLabel
        pill
        value={query}
        onChangeText={changeQuery}
        placeholder={
          destination ? COPY.venue.venuePlaceholder : COPY.venue.destinationPlaceholder
        }
        prefix={<MagnifierIcon />}
        testID={destination ? 'venue-search' : 'destination-search'}
      />

      {destination ? (
        /* Optional refinements (§3). `Tümü` is the default and is the mode
           that sends Google no type restriction at all. */
        <View style={styles.chipRow}>
          {CHIPS.map((chip) => (
            <Chip
              key={chip.mode}
              label={chip.label()}
              selected={chip.mode === mode}
              onPress={() => setMode(chip.mode)}
              testID={`venue-chip-${chip.mode}`}
            />
          ))}
        </View>
      ) : null}

      {problem ? <Notice message={problem} tone="error" testID="venue-problem" /> : null}

      {!longEnough(query) ? (
        <Caption testID="venue-prompt">{prompt}</Caption>
      ) : results === null ? (
        loading ? (
          <ActivityIndicator accessibilityLabel={COPY.common.loading} testID="venue-loading" />
        ) : null
      ) : results.length === 0 ? (
        problem ? null : <EmptyState message={noResults} testID="venue-no-results" />
      ) : (
        <>
          {results.map((hit, index) => (
            <Pressable
              key={hit.selectionToken}
              accessibilityRole="button"
              accessibilityLabel={hit.detail ? `${hit.name}. ${hit.detail}` : hit.name}
              accessibilityState={{ disabled: busy || committing }}
              disabled={busy || committing}
              onPress={() =>
                destination ? onChosen(hit.selectionToken, mode, hit.name) : chooseDestination(hit)
              }
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              testID={`${step}-option-${index}`}
            >
              <Text style={styles.rowName}>{hit.name}</Text>
              {hit.detail ? <Text style={styles.rowDetail}>{hit.detail}</Text> : null}
            </Pressable>
          ))}
          {/* Google's policies require the attribution wherever its data is
              shown. It stands with the list, which is where the data is. */}
          <Caption testID="venue-attribution">{COPY.venue.attribution}</Caption>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontFamily: fontFamily.display,
    fontSize: 22,
    lineHeight: 28,
    color: color.ink,
    marginBottom: spacing.xs,
  },
  hint: {
    fontFamily: fontFamily.body,
    fontSize: 14,
    lineHeight: 20,
    color: color.inkMuted,
    marginBottom: spacing.sm,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  changeText: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    color: color.accentDeep,
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  row: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.rule,
    backgroundColor: color.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowName: {
    fontFamily: fontFamily.body,
    fontSize: 16,
    color: color.ink,
  },
  rowDetail: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    color: color.inkMuted,
    marginTop: 2,
  },
});
