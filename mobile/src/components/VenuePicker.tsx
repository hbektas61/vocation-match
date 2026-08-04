/**
 * Choosing where the holiday is (D-060), in three explicit steps.
 *
 * Step A is a local country list and costs nothing. Step B asks for a city,
 * island or holiday area inside that country and accepts nothing that is a
 * business. Step C starts with Google's reliable lodging refinement, while an
 * explicit broader option keeps beach clubs and named beaches findable.
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
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Caption, Chip, EmptyState, Loading, Notice } from './ui';
import { COPY, getLocale, upperCase } from '../copy';
import { ApiError, getApi, type GooglePlaceHit, type VenueSearchMode } from '../data';
import {
  countryOptions,
  filterCountries,
  suggestedCountries,
  type CountryOption,
} from '../domain/countries';
import { color, fontFamily, MIN_TOUCH, radius, spacing } from '../theme';

/** The server's floor, mirrored so a request is never made below it. */
export const VENUE_MIN_QUERY = 3;
/** Long enough that a word typed at speed is one request, not eight. */
export const VENUE_DEBOUNCE_MS = 350;

const CHIPS: { mode: VenueSearchMode; label: () => string }[] = [
  { mode: 'stay', label: () => COPY.venue.chipStay },
  { mode: 'all', label: () => COPY.venue.chipAll },
];

type PickerStep = 'country' | 'destination' | 'venue';

/**
 * Which of the three steps this is.
 *
 * This was three 110pt chips on a 44pt row. At 320px the labels truncated —
 * "Şehir" lost its tail — and the row cost a whole control's worth of height
 * on every screen of the wizard. A hairline plus the step named once says the
 * same thing in half the space and cannot truncate, because the only text is a
 * single line that wraps if it must.
 *
 * The accessible name is unchanged: a progressbar that reports 2 of 3.
 */
function WizardProgress({ step }: { step: PickerStep }) {
  const steps: { key: PickerStep; label: string }[] = [
    { key: 'country', label: COPY.venue.stepCountry },
    { key: 'destination', label: COPY.venue.stepDestination },
    { key: 'venue', label: COPY.venue.stepVenue },
  ];
  const current = steps.findIndex((candidate) => candidate.key === step);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={COPY.venue.stepProgress(current + 1, steps.length)}
      accessibilityValue={{ min: 1, max: steps.length, now: current + 1 }}
      style={styles.progress}
      testID="venue-picker-progress"
    >
      <View style={styles.progressBar}>
        {steps.map((candidate, index) => (
          <View
            key={candidate.key}
            style={[
              styles.progressSegment,
              index <= current && styles.progressSegmentDone,
            ]}
            testID={`venue-step-${candidate.key}`}
          />
        ))}
      </View>
      {/* Hidden from assistive tech: the progressbar above already says
          "step 2 of 3", and repeating it is noise before the actual content. */}
      <Text
        style={styles.progressLabel}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {COPY.venue.stepShort(current + 1, steps.length)} · {steps[current]?.label}
      </Text>
    </View>
  );
}

/**
 * The badge under a result row, in the app's own vocabulary.
 *
 * The design draws OTEL / RESORT / PLAJ KULÜBÜ; the data has one shared kind
 * set ('hotel', 'beach', …) that check-in already localises, and Google's own
 * types are never shown or stored (D-054). So the badge renders exactly what
 * the vocabulary can honestly say, and nothing when the answer is null —
 * autocomplete predictions legitimately may not carry a type.
 */
function kindBadge(kind: string | null): string | null {
  switch (kind) {
    case 'hotel':
      return COPY.checkin.kindHotel;
    case 'beach':
      return COPY.checkin.kindBeach;
    case 'cafe':
      return COPY.checkin.kindCafe;
    case 'restaurant':
      return COPY.checkin.kindRestaurant;
    case 'bar':
      return COPY.checkin.kindBar;
    case 'venue':
      return COPY.checkin.kindVenue;
    case 'area':
      return COPY.checkin.kindArea;
    default:
      return null;
  }
}

/**
 * The country chosen last, for W-01's "en son buradaydın" sub-line.
 *
 * Module-level on purpose: it survives the picker unmounting but not the app
 * restarting. Persisting it would be a new stored fact about the person, and
 * the design only ever promises "last time", not "forever".
 */
let lastCountryCode: string | null = null;

/** Enough characters to be a search rather than a letter. */
export function longEnough(text: string): boolean {
  return text.trim().replace(/\s+/g, '').length >= VENUE_MIN_QUERY;
}

export function VenuePicker({
  onChosen,
  onClose,
  busy = false,
  confirmSelection = true,
}: {
  /**
   * The way out of the wizard's first step. The chevron on the later steps
   * walks back within the wizard; the country step has no earlier step, so
   * without this the picker was a room with no door — opening it on the trip
   * tab left no way to leave without choosing.
   */
  onClose?: () => void;
  /** A single-use token, and the chip it was found under. */
  onChosen: (selectionToken: string, mode: VenueSearchMode, name: string) => void;
  busy?: boolean;
  /**
   * First-time selection gets the calm “is this your hotel?” review. Replacing
   * an active venue already has the stronger destructive confirmation owned by
   * HotelScreen, so it must not be followed by a second confirmation.
   */
  confirmSelection?: boolean;
}) {
  const [country, setCountry] = useState<CountryOption | null>(null);
  const [countryQuery, setCountryQuery] = useState('');
  const [destination, setDestination] = useState<{ name: string; sessionId: string } | null>(null);
  const [mode, setMode] = useState<VenueSearchMode>('stay');
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
  /**
   * Which kind of refusal the search hit, not a pre-rendered sentence.
   *
   * The two kinds want different screens (E-02, E-03): a provider outage is
   * retryable in place, a lapsed billing session is not — retrying it would
   * be a fresh chargeable request wearing an old session id. Storing the kind
   * keeps that decision at render time instead of baked into a string.
   */
  const [problem, setProblem] = useState<'provider' | 'session' | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [committing, setCommitting] = useState(false);
  const [pendingChoice, setPendingChoice] = useState<{
    selectionToken: string;
    mode: VenueSearchMode;
    name: string;
    /** Carried so the opened row keeps saying what the closed row said. */
    detail: string | null;
    kind: string | null;
  } | null>(null);

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

  const resetSearch = useCallback(() => {
    ticketRef.current += 1;
    inFlight.current = false;
    queued.current = null;
    setQuery('');
    setResults(null);
    setLoading(false);
    setProblem(null);
    setPendingChoice(null);
  }, []);

  const changeDestination = useCallback(() => {
    resetSearch();
    destinationSession.current = undefined;
    setDestination(null);
    setMode('stay');
  }, [resetSearch]);

  const changeCountry = useCallback(() => {
    changeDestination();
    setCountry(null);
    setCountryQuery('');
  }, [changeDestination]);

  const search = useCallback(
    async (text: string, ticket: number, currentMode: VenueSearchMode) => {
      if (!destination && !country) return;
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
          : await api.searchDestinations(
              text,
              country!.code,
              destinationSession.current,
            );
        // Stale: a newer query is already the question on screen.
        if (ticket !== ticketRef.current) return;
        if (!answer) {
          // Null is "do not offer this" — unconfigured, a ceiling, a limit, an
          // unwell provider. Never "there is no such place".
          setProblem('provider');
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
          // The venue session lapsed (E-03). This used to bounce straight back
          // to the destination step, which read as the app losing your place.
          // The screen now says what happened — a session is the provider's
          // billing unit, and searching on a dead one would be a fresh
          // chargeable request — and offers the two ways on by name.
          setProblem('session');
          setResults(null);
          return;
        }
        setProblem('provider');
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
    [country, destination],
  );

  useEffect(() => {
    if (!country || !longEnough(query)) return;
    const ticket = (ticketRef.current += 1);
    const timer = setTimeout(() => {
      search(query.trim(), ticket, mode);
    }, VENUE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [country, query, mode, search, retryTick]);

  /** E-02's way out: the query is still in state, so retrying is one tap. */
  const retrySearch = () => {
    setProblem(null);
    setResults(null);
    setRetryTick((tick) => tick + 1);
  };

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
        setProblem('provider');
        return;
      }
      resetSearch();
      destinationSession.current = undefined;
      setDestination({ name: hit.name, sessionId: choice.sessionId });
    } finally {
      setCommitting(false);
    }
  };

  const chooseCountry = (next: CountryOption) => {
    lastCountryCode = next.code;
    resetSearch();
    destinationSession.current = undefined;
    setCountry(next);
    setCountryQuery('');
    setDestination(null);
    setMode('stay');
  };

  const step: 'country' | 'destination' | 'venue' = !country
    ? 'country'
    : destination
      ? 'venue'
      : 'destination';
  const locale = getLocale();
  const allCountries = countryOptions(locale);
  const countries = countryQuery.trim()
    ? filterCountries(allCountries, countryQuery)
    : suggestedCountries(locale);

  if (!country) {
    return (
      <View testID="venue-picker-country">
        <View style={styles.headerRow}>
          {onClose ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={COPY.common.back}
              onPress={onClose}
              style={styles.headerBack}
              testID="venue-picker-close"
            >
              <Text style={styles.headerChevron}>‹</Text>
            </Pressable>
          ) : null}
          <Text accessibilityRole="header" style={[styles.heading, styles.headingInRow]}>
            {COPY.venue.countryTitle}
          </Text>
        </View>
        <WizardProgress step="country" />
        <Text style={styles.hint}>{COPY.venue.countryHint}</Text>
        <TextInput
          accessibilityLabel={COPY.venue.countryLabel}
          value={countryQuery}
          onChangeText={setCountryQuery}
          placeholder={COPY.venue.countryPlaceholder}
          placeholderTextColor={color.inkMuted}
          autoCorrect={false}
          style={[styles.searchBox, countryQuery.trim() !== '' && styles.searchBoxActive]}
          testID="country-search"
        />
        <Text style={styles.sectionLabel}>
          {upperCase(countryQuery.trim() ? COPY.venue.countryResults : COPY.venue.countryPopular)}
        </Text>
        {countries.length === 0 ? (
          /* E-05. Free and local, and it says so — then the frequent list
             stays underneath, because "no match" must never mean "no way
             forward". */
          <>
            <Notice
              message={COPY.venue.countryNoResults}
              tone="info"
              testID="country-no-results"
            />
            <Text style={styles.hint}>{COPY.venue.countryLocalNote}</Text>
            <Text style={styles.sectionLabel}>{upperCase(COPY.venue.countryPopular)}</Text>
            {suggestedCountries(locale).map((option) => (
              <Pressable
                key={option.code}
                accessibilityRole="button"
                accessibilityLabel={`${option.name}, ${option.code}`}
                onPress={() => chooseCountry(option)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                testID={`country-option-${option.code}`}
              >
                <Text style={styles.rowName}>{option.name}</Text>
                <Text style={styles.countryCode}>
                  {option.code === lastCountryCode
                    ? `${option.code} · ${COPY.venue.lastUsedHere}`
                    : option.code}
                </Text>
              </Pressable>
            ))}
          </>
        ) : (
          countries.map((option) => (
            <Pressable
              key={option.code}
              accessibilityRole="button"
              accessibilityLabel={`${option.name}, ${option.code}`}
              onPress={() => chooseCountry(option)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              testID={`country-option-${option.code}`}
            >
              <Text style={styles.rowName}>{option.name}</Text>
              <Text style={styles.countryCode}>{option.code}</Text>
            </Pressable>
          ))
        )}
      </View>
    );
  }

  const heading = destination
    ? COPY.venue.venueTitle(destination.name)
    : COPY.venue.destinationTitle;
  /**
   * The line under the empty field. On the destination step it used to repeat
   * `destinationHint` — which is already printed above the field — so the same
   * sentence appeared twice on one screen and the one thing somebody actually
   * needs to know, that nothing is searched under three characters, was said
   * nowhere. The venue step's own prompt is not a repeat, so it stays.
   */
  const prompt = destination ? COPY.venue.venuePrompt : COPY.venue.minQuery;

  /**
   * Confirming happens where the choosing happened.
   *
   * This used to replace the whole screen: the results vanished, a headline
   * asked "Is this your hotel?", and backing out re-rendered the search from
   * nothing. The list is still in state the whole time, so throwing it away
   * was only ever a visual decision — and it made cancelling feel like losing
   * your place. The chosen row expands instead; everything around it stays put.
   */
  return (
    <View testID={`venue-picker-${step}`}>
      {/* The drawn header: a 44pt chevron that walks one step back, beside the
          title. The country step has no chevron (W-01) — there is no earlier
          step to walk to; leaving the picker stays the host screen's job. */}
      <View style={styles.headerRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={COPY.common.back}
          onPress={destination ? changeDestination : changeCountry}
          style={styles.headerBack}
          testID="venue-picker-back"
        >
          <Text style={styles.headerChevron}>‹</Text>
        </Pressable>
        <Text accessibilityRole="header" style={[styles.heading, styles.headingInRow]}>
          {heading}
        </Text>
      </View>
      <WizardProgress step={step} />
      {/*
        Where you are, in one line.
        This was one 105pt card per chosen thing — two of them stacked by the
        third step, 210pt of screen spent restating two words. The line says
        the same and leaves the room to the results.
      */}
      <View style={styles.scopeLine} testID="venue-search-context">
        <Text style={styles.scopeText} numberOfLines={1}>
          {destination ? `${country.name} · ${destination.name}` : country.name}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            destination ? COPY.venue.changeDestination : COPY.venue.changeCountry
          }
          onPress={destination ? changeDestination : changeCountry}
          style={styles.scopeAction}
          testID={destination ? 'venue-change-destination' : 'venue-change-country'}
        >
          <Text style={styles.changeText}>{COPY.venue.change}</Text>
        </Pressable>
      </View>
      {destination ? null : (
        <Text style={styles.hint}>{COPY.venue.destinationHint(country.name)}</Text>
      )}

      <TextInput
        accessibilityLabel={destination ? COPY.venue.venueLabel : COPY.venue.destinationLabel}
        value={query}
        onChangeText={changeQuery}
        placeholder={
          destination ? COPY.venue.venuePlaceholder : COPY.venue.destinationPlaceholder
        }
        placeholderTextColor={color.inkMuted}
        autoCorrect={false}
        style={[styles.searchBox, query.trim() !== '' && styles.searchBoxActive]}
        testID={destination ? 'venue-search' : 'destination-search'}
      />

      {destination ? (
        <View>
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
          <Text style={styles.modeNote} testID="venue-search-scope-note">
            {COPY.venue.broaderSearchBody}
          </Text>
        </View>
      ) : null}

      {problem === 'session' ? (
        /* E-03. The one state that must not quietly re-bill: the session is
           the provider's billing unit, so the way on is a fresh one. */
        <View style={styles.stateBlock} testID="venue-session-lapsed">
          <Notice message={COPY.venue.sessionLapsed} tone="info" />
          <View style={styles.stateCard}>
            <Text style={styles.stateBody}>{COPY.venue.sessionLapsedBody}</Text>
            <Button
              label={COPY.venue.reselectDestination}
              onPress={changeDestination}
              testID="venue-reselect-destination"
            />
            <Button
              label={COPY.venue.changeCountry}
              variant="secondary"
              onPress={changeCountry}
              testID="venue-session-change-country"
            />
          </View>
        </View>
      ) : problem === 'provider' ? (
        /* E-02. What was typed is still here, so retrying costs one tap —
           and nothing of Google's is on screen, so no attribution renders. */
        <View style={styles.stateBlock} testID="venue-problem">
          <Notice message={COPY.venue.unavailable} tone="error" />
          <View style={styles.stateCard}>
            <Text style={styles.stateBody}>{COPY.venue.providerRetryBody}</Text>
            <Button label={COPY.common.retry} onPress={retrySearch} testID="venue-retry" />
          </View>
        </View>
      ) : !longEnough(query) ? (
        <Caption testID="venue-prompt">{prompt}</Caption>
      ) : results === null ? (
        loading ? (
          <Loading testID="venue-loading" />
        ) : null
      ) : results.length === 0 ? (
        destination && mode === 'stay' ? (
          /* E-01. Not an error but a doorway: beach clubs and named beaches
             live in the unrestricted search, and this is where somebody finds
             that out. */
          <View style={styles.stateBlock} testID="venue-no-results">
            <Notice message={COPY.venue.stayNoResults} tone="info" />
            <View style={styles.stateCard}>
              <Text style={styles.stateBody}>{COPY.venue.stayNoResultsBody}</Text>
              <Button
                label={COPY.venue.broadenButton}
                onPress={() => setMode('all')}
                testID="venue-broaden-search"
              />
            </View>
          </View>
        ) : destination ? (
          <EmptyState message={COPY.venue.venueNoResults} testID="venue-no-results" />
        ) : (
          /* E-04. The thing worth questioning here is the country, and the
             list that answers it runs on the device — no request, no spend. */
          <View style={styles.stateBlock} testID="venue-no-results">
            <Notice message={COPY.venue.destinationNoResultsIn(country.name)} tone="info" />
            <View style={styles.stateCard}>
              <Text style={styles.stateBody}>{COPY.venue.destinationNoResultsBody}</Text>
              <Button
                label={COPY.venue.changeCountry}
                variant="secondary"
                onPress={changeCountry}
                testID="venue-empty-change-country"
              />
            </View>
          </View>
        )
      ) : (
        <>
          {results.map((hit, index) =>
            pendingChoice && pendingChoice.selectionToken === hit.selectionToken ? (
              /* The same row, opened. Same token, same single use — this is a
                 presentation change, not a change to what gets committed. */
              <View
                key={hit.selectionToken}
                style={styles.confirmCard}
                testID="venue-picker-confirmation"
              >
                <Text style={styles.confirmName}>{pendingChoice.name}</Text>
                {pendingChoice.detail || kindBadge(pendingChoice.kind) ? (
                  <Text style={styles.confirmDetail}>
                    {[pendingChoice.detail, kindBadge(pendingChoice.kind)]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                ) : null}
                <View style={styles.promiseBox}>
                  <Text style={styles.promiseTitle}>
                    {upperCase(COPY.venue.confirmPromiseTitle)}
                  </Text>
                  <Text style={styles.promiseBody}>{COPY.venue.confirmPromiseBody}</Text>
                </View>
                <Button
                  label={COPY.venue.confirmButton}
                  onPress={() =>
                    onChosen(
                      pendingChoice.selectionToken,
                      pendingChoice.mode,
                      pendingChoice.name,
                    )
                  }
                  disabled={busy}
                  testID="confirm-venue-selection"
                />
                <Button
                  label={COPY.venue.backToHotelSearch}
                  variant="secondary"
                  /* Clears the pending choice and nothing else: the results are
                     still in state, so no second Google request is made. */
                  onPress={() => setPendingChoice(null)}
                  disabled={busy}
                  testID="cancel-venue-selection"
                />
              </View>
            ) : (
            <Pressable
              key={hit.selectionToken}
              accessibilityRole="button"
              accessibilityLabel={hit.detail ? `${hit.name}. ${hit.detail}` : hit.name}
              accessibilityState={{ disabled: busy || committing }}
              disabled={busy || committing}
              onPress={() => {
                if (!destination) {
                  void chooseDestination(hit);
                  return;
                }
                const choice = {
                  selectionToken: hit.selectionToken,
                  mode,
                  name: hit.name,
                  detail: hit.detail,
                  kind: hit.kind,
                };
                if (confirmSelection) setPendingChoice(choice);
                else onChosen(choice.selectionToken, choice.mode, choice.name);
              }}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              testID={`${step}-option-${index}`}
            >
              <Text style={styles.rowName}>{hit.name}</Text>
              {hit.detail ? <Text style={styles.rowDetail}>{hit.detail}</Text> : null}
              {kindBadge(hit.kind) ? (
                <Text style={styles.rowKind}>{upperCase(kindBadge(hit.kind) ?? '')}</Text>
              ) : null}
            </Pressable>
            ),
          )}
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
    fontSize: 24,
    lineHeight: 30,
    color: color.ink,
    marginBottom: spacing.sm,
  },
  /** W-02…W-04: the 44pt chevron beside the title, one row. */
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerBack: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerChevron: {
    fontFamily: fontFamily.body,
    fontSize: 24,
    lineHeight: 34,
    color: color.ink,
  },
  /** Inside the row the heading's own bottom margin would misalign the pair. */
  headingInRow: { flex: 1, marginBottom: 0 },
  /**
   * The drawn search box: no label, no icon, a plain 14-radius field whose
   * edge turns coral once something is typed — the border carries "this is
   * the live search", the way the design draws it.
   */
  searchBox: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    // Whatever follows — the mode chips, a result list — stands off the box
    // rather than touching its edge (owner screenshot, 2026-08-03).
    marginBottom: spacing.sm,
    fontFamily: fontFamily.body,
    fontSize: 15,
    // No lineHeight on purpose: iOS sinks a TextInput's text to the bottom
    // of the line box, which cut the words in half (owner, 2026-08-03).
    textAlignVertical: 'center',
    color: color.ink,
  },
  searchBoxActive: { borderWidth: 2, borderColor: color.accent },
  /** W-03's note: one quiet line, not a titled card. */
  modeNote: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    lineHeight: 18,
    color: color.inkMuted,
  },
  /** The type badge under a result: 10pt tracked capitals in the brand ink. */
  rowKind: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 10,
    lineHeight: 15,
    letterSpacing: 0.8,
    color: color.accentDeep,
    marginTop: 3,
  },
  /** The hairline, and the words under it. */
  progressBar: { flexDirection: 'row', gap: 4 },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.accentSoft,
  },
  progressSegmentDone: { backgroundColor: color.accent },
  progressLabel: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 11,
    color: color.inkMuted,
  },
  /** One line: where the search currently is, and the way to move it. */
  scopeLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: color.accentWash,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    minHeight: MIN_TOUCH,
  },
  scopeText: {
    flex: 1,
    fontFamily: fontFamily.bodyMedium,
    fontSize: 13,
    color: color.ink,
  },
  scopeAction: { minHeight: MIN_TOUCH, justifyContent: 'center' },
  /**
   * A column: the hairline row above, the caption below. This still carried
   * the old chip row's flexDirection: 'row', which put the bar beside the
   * caption — and a row gives its flex:1 segments no width to share on
   * native, so on a phone the bars rendered zero-wide and invisible while
   * web quietly padded them. Found from a device screenshot.
   */
  progress: {
    gap: 8,
    marginBottom: spacing.md,
  },
  progressStep: {
    flex: 1,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.rule,
    backgroundColor: color.surface,
    paddingHorizontal: spacing.xs,
  },
  progressStepActive: {
    borderColor: color.accent,
    backgroundColor: color.accentSoft,
  },
  progressStepComplete: {
    borderColor: color.accentSoft,
    backgroundColor: color.accentWash,
  },
  progressText: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 11,
    color: color.inkMuted,
  },
  progressTextSelected: {
    fontFamily: fontFamily.bodySemi,
    color: color.accentDeep,
  },
  hint: {
    fontFamily: fontFamily.body,
    fontSize: 14,
    lineHeight: 20,
    color: color.inkMuted,
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 11,
    letterSpacing: 1,
    color: color.inkMuted,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  /** E-01…E-04: the card under the notice, holding the words and the way out. */
  stateBlock: { gap: spacing.sm },
  stateCard: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  stateBody: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    lineHeight: 19,
    color: color.ink,
  },
  countryCode: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    lineHeight: 17,
    color: color.inkMuted,
    marginTop: 2,
  },
  contextCard: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.rule,
    backgroundColor: color.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  contextRow: {
    width: '100%',
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  contextRowSeparated: {
    borderTopWidth: 1,
    borderTopColor: color.rule,
  },
  contextCardStack: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 0,
  },
  contextCopy: {
    flex: 1,
    justifyContent: 'center',
  },
  contextLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 11,
    lineHeight: 15,
    color: color.inkMuted,
  },
  contextName: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 15,
    lineHeight: 20,
    color: color.ink,
  },
  contextAction: {
    minHeight: MIN_TOUCH,
    minWidth: MIN_TOUCH,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  /**
   * "Change destination" is a real control — it throws away the destination you
   * picked and starts the search again — but it was a bare text row, measured
   * 350×16 on the running app. Everything else operable in this product is at
   * least 44 tall; a link that undoes a step should not be the exception.
   */
  changeText: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 13,
    color: color.accentDeep,
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.sm,
    flexWrap: 'wrap',
  },
  scopeNote: {
    borderRadius: radius.md,
    backgroundColor: color.accentWash,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  scopeTitle: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 12,
    lineHeight: 17,
    color: color.ink,
  },
  scopeBody: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    lineHeight: 17,
    color: color.inkMuted,
    marginTop: 2,
  },
  confirmCard: {
    backgroundColor: color.surface,
    borderWidth: 2,
    borderColor: color.accent,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 10,
    marginBottom: spacing.xs,
  },
  confirmName: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 17,
    lineHeight: 22,
    color: color.ink,
  },
  confirmDetail: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    lineHeight: 17,
    color: color.inkMuted,
  },
  /** The promise, in the wash — AYNI MEKÂN = AYNI ODA. */
  promiseBox: {
    backgroundColor: color.accentWash,
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  promiseTitle: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.8,
    color: color.accentDeep,
  },
  promiseBody: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    lineHeight: 17,
    color: color.inkMuted,
  },
  confirmBody: {
    fontFamily: fontFamily.body,
    fontSize: 14,
    lineHeight: 20,
    color: color.inkMuted,
    marginTop: spacing.sm,
  },
  row: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: color.rule,
    backgroundColor: color.surface,
    paddingVertical: 13,
    paddingHorizontal: 16,
    marginBottom: spacing.xs,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowName: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 15,
    lineHeight: 20,
    color: color.ink,
  },
  rowDetail: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    lineHeight: 17,
    color: color.inkMuted,
    marginTop: 2,
  },
});
