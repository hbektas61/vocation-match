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
import Svg, { Circle, Path } from 'react-native-svg';

import {
  BackButton,
  Button,
  Caption,
  Chip,
  ConfirmDialog,
  EmptyState,
  Loading,
  Notice,
  SectionLabel,
} from './ui';
import { COPY, getLocale, upperCase } from '../copy';
import { ApiError, getApi, type GooglePlaceHit, type VenueSearchMode } from '../data';
import {
  countryOptions,
  filterCountries,
  suggestedCountries,
  type CountryOption,
} from '../domain/countries';
import {
  ACTION_TOUCH,
  color,
  elevation,
  font,
  fontFamily,
  leading,
  MIN_TOUCH,
  radius,
  spacing,
  tracking,
} from '../theme';

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


/**
 * The search box the contract draws on both picker steps (176:2393): a tall
 * white plate with the magnifier inside it, rather than a bordered field.
 *
 * The magnifier matters more than it looks. This box is not a form field
 * somebody fills in and submits — it queries a paid provider as they type, and
 * the glyph is what says "this searches" before the first keystroke pays for
 * anything.
 */
function SearchBox({
  label,
  value,
  onChangeText,
  placeholder,
  testID,
}: {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder: string;
  testID: string;
}) {
  const active = value.trim() !== '';
  return (
    <View style={[styles.searchShell, active && styles.searchShellActive]}>
      <Svg
        width={20}
        height={20}
        viewBox="0 0 24 24"
        fill="none"
        stroke={active ? color.accentDeep : color.inkFaint}
        strokeWidth={2}
        strokeLinecap="round"
      >
        <Circle cx={11} cy={11} r={7} />
        <Path d="m16.5 16.5 4 4" />
      </Svg>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={color.inkFaint}
        autoCorrect={false}
        style={styles.searchInput}
        testID={testID}
      />
    </View>
  );
}

/** A country, as one of the contract's suggestion chips (176:2405). */
function CountryPill({
  option,
  lastUsed,
  onPress,
}: {
  option: CountryOption;
  lastUsed: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        lastUsed ? `${option.name}, ${option.code}, ${COPY.venue.lastUsedHere}` : `${option.name}, ${option.code}`
      }
      onPress={onPress}
      style={({ pressed }) => [styles.pill, lastUsed && styles.pillLastUsed, pressed && styles.pillPressed]}
      testID={`country-option-${option.code}`}
    >
      <Text style={[styles.pillText, lastUsed && styles.pillTextLastUsed]}>{option.name}</Text>
    </Pressable>
  );
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
        {/* The contract opens this flow at the destination (176:2380); the
            country step is ours (D-059) and is drawn in the same language:
            the round back button on its own line, the question under it, then
            the search. */}
        <View style={styles.headerRow}>
          {onClose ? <BackButton onPress={onClose} testID="venue-picker-close" /> : null}
        </View>
        <Text accessibilityRole="header" style={styles.heading}>
          {COPY.venue.countryTitle}
        </Text>
        <WizardProgress step="country" />
        <Text style={styles.hint}>{COPY.venue.countryHint}</Text>
        <SearchBox
          label={COPY.venue.countryLabel}
          value={countryQuery}
          onChangeText={setCountryQuery}
          placeholder={COPY.venue.countryPlaceholder}
          testID="country-search"
        />
        <SectionLabel>
          {countryQuery.trim() ? COPY.venue.countryResults : COPY.venue.countryPopular}
        </SectionLabel>
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
            <SectionLabel>{COPY.venue.countryPopular}</SectionLabel>
            <View style={styles.suggestions}>
              {suggestedCountries(locale).map((option) => (
                <CountryPill
                  key={option.code}
                  option={option}
                  lastUsed={option.code === lastCountryCode}
                  onPress={() => chooseCountry(option)}
                />
              ))}
            </View>
          </>
        ) : (
          /* The contract's suggestion chips (176:2404): a country is two
             words, and two words do not need a row of their own. */
          <View style={styles.suggestions}>
            {countries.map((option) => (
              <CountryPill
                key={option.code}
                option={option}
                lastUsed={option.code === lastCountryCode}
                onPress={() => chooseCountry(option)}
              />
            ))}
          </View>
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
        <BackButton
          onPress={destination ? changeDestination : changeCountry}
          testID="venue-picker-back"
        />
        {/* The place the search is inside, as the coral eyebrow the contract
            draws beside the arrow (176:2423). */}
        {destination ? <Text style={styles.eyebrow}>{upperCase(destination.name)}</Text> : null}
      </View>
      <Text accessibilityRole="header" style={styles.heading}>
        {heading}
      </Text>
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

      <SearchBox
        label={destination ? COPY.venue.venueLabel : COPY.venue.destinationLabel}
        value={query}
        onChangeText={changeQuery}
        placeholder={
          destination ? COPY.venue.venuePlaceholder : COPY.venue.destinationPlaceholder
        }
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
          {results.map((hit, index) => (
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
              {/* The contract's result card (176:2429) is a 64pt photograph,
                  a name, a kind badge and a Choose pill. The photograph is
                  the one part that cannot be built: D-054 allows nothing of
                  Google's but the Place ID to be shown or stored, and a
                  venue we have never met has no picture of our own. So the
                  card is the same card without it. */}
              <View style={styles.rowBody}>
                <Text style={styles.rowName}>{hit.name}</Text>
                {hit.detail ? <Text style={styles.rowDetail}>{hit.detail}</Text> : null}
                {kindBadge(hit.kind) ? (
                  <View style={styles.kindPill}>
                    <Text style={styles.kindPillText}>{kindBadge(hit.kind) ?? ''}</Text>
                  </View>
                ) : null}
              </View>
              {/* The affordance, not a second target: the whole card is the
                  button, so this is hidden from assistive tech rather than
                  announced as something else to find. */}
              <View
                style={styles.rowAction}
                accessibilityElementsHidden
                importantForAccessibility="no"
              >
                <Text style={styles.rowActionText}>{COPY.venue.selectButton}</Text>
              </View>
            </Pressable>
          ))}
          {/* Google's policies require the attribution wherever its data is
              shown. It stands with the list, which is where the data is. */}
          <Caption testID="venue-attribution">{COPY.venue.attribution}</Caption>

          {/* The commitment pops over a dimmed screen (owner, 2026-08-05),
              like every other confirmation — not a card growing under the
              row. Same token, same single use; cancelling clears the pending
              choice and nothing else, so the results stay and no second
              Google request is made. */}
          <ConfirmDialog
            visible={pendingChoice !== null}
            title={pendingChoice?.name ?? ''}
            body={[
              [pendingChoice?.detail, kindBadge(pendingChoice?.kind ?? null)]
                .filter(Boolean)
                .join(' · '),
              COPY.venue.confirmPromiseBody,
            ]
              .filter(Boolean)
              .join('\n\n')}
            confirmLabel={COPY.venue.confirmButton}
            cancelLabel={COPY.venue.backToHotelSearch}
            confirmVariant="primary"
            busy={busy}
            onCancel={() => setPendingChoice(null)}
            onConfirm={() => {
              if (pendingChoice) {
                onChosen(pendingChoice.selectionToken, pendingChoice.mode, pendingChoice.name);
              }
            }}
            testID="venue-picker-confirmation"
            confirmTestID="confirm-venue-selection"
            cancelTestID="cancel-venue-selection"
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  /** The question (176:2388), on its own line under the arrow. */
  heading: {
    fontFamily: fontFamily.display,
    fontSize: font.title,
    lineHeight: font.title * leading.tight,
    letterSpacing: tracking.display,
    color: color.ink,
    marginBottom: spacing.sm,
  },
  /** The arrow's own row (176:2383), and the eyebrow that may stand beside it. */
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.snug,
  },
  /** Where the search is, in tracked coral capitals (176:2423). */
  eyebrow: {
    flexShrink: 1,
    fontFamily: fontFamily.displaySemi,
    fontSize: font.label,
    letterSpacing: tracking.label,
    color: color.accentDeep,
  },
  /**
   * The search plate (176:2393): tall, white, the magnifier inside it, no
   * border at rest — it floats like every other object on the page, and the
   * coral edge only appears once it is actually searching something.
   */
  searchShell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.snug,
    minHeight: ACTION_TOUCH,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    paddingHorizontal: spacing.md,
    // Whatever follows — the mode chips, a result list — stands off the box
    // rather than touching its edge (owner screenshot, 2026-08-03).
    marginBottom: spacing.md,
    ...elevation.card,
  },
  searchShellActive: { borderColor: color.accent },
  searchInput: {
    flex: 1,
    fontFamily: fontFamily.body,
    fontSize: font.body,
    // No lineHeight on purpose: iOS sinks a TextInput's text to the bottom
    // of the line box, which cut the words in half (owner, 2026-08-03).
    textAlignVertical: 'center',
    includeFontPadding: false,
    paddingVertical: 0,
    color: color.ink,
  },
  /** The suggestion chips wrap; a country is two words, not a row. */
  suggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.snug,
    marginBottom: spacing.sm,
  },
  pill: {
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: color.surface,
    paddingHorizontal: spacing.lg,
    ...elevation.card,
  },
  pillLastUsed: { backgroundColor: color.accentWash },
  pillPressed: { opacity: 0.7 },
  pillText: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.body,
    color: color.ink,
  },
  pillTextLastUsed: { fontFamily: fontFamily.bodySemi, color: color.accentDeep },
  /** W-03's note: one quiet line, not a titled card. */
  modeNote: {
    fontFamily: fontFamily.body,
    fontSize: font.caption,
    lineHeight: font.caption * leading.normal,
    color: color.inkMuted,
  },
  /** The type badge under a result, as the contract's grey pill (176:2436). */
  kindPill: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    backgroundColor: color.veil,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.tight,
    marginTop: spacing.xs,
  },
  kindPillText: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.label,
    lineHeight: font.label * leading.snug,
    color: color.inkMuted,
  },
  /** The hairline, and the words under it. */
  progressBar: { flexDirection: 'row', gap: spacing.xs },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: color.veil,
  },
  progressSegmentDone: { backgroundColor: color.accent },
  progressLabel: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.label,
    color: color.inkMuted,
  },
  /** One line: where the search currently is, and the way to move it. */
  scopeLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: color.accentWash,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    minHeight: MIN_TOUCH,
  },
  scopeText: {
    flex: 1,
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.caption,
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
    gap: spacing.sm,
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
    borderColor: color.rule,
    backgroundColor: color.accentWash,
  },
  progressText: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: font.label,
    color: color.inkMuted,
  },
  progressTextSelected: {
    fontFamily: fontFamily.bodySemi,
    color: color.ink,
  },
  /** The line under the question (176:2390): a sentence, so it reads at body. */
  hint: {
    fontFamily: fontFamily.body,
    fontSize: font.body,
    lineHeight: font.body * leading.normal,
    color: color.inkMuted,
    marginBottom: spacing.md,
  },
  /** E-01…E-04: the card under the notice, holding the words and the way out. */
  stateBlock: { gap: spacing.sm },
  stateCard: {
    backgroundColor: color.surface,
    borderRadius: radius.xl,
    ...elevation.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  stateBody: {
    fontFamily: fontFamily.body,
    fontSize: font.caption,
    lineHeight: font.caption * leading.normal,
    color: color.ink,
  },
  contextCard: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderRadius: radius.xl,
    backgroundColor: color.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    ...elevation.card,
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
    fontSize: font.label,
    lineHeight: font.label * leading.snug,
    color: color.inkMuted,
  },
  contextName: {
    fontFamily: fontFamily.displaySemi,
    fontSize: font.body,
    lineHeight: font.body * leading.snug,
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
    fontSize: font.control,
    color: color.ink,
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
    fontSize: font.caption,
    lineHeight: font.caption * leading.normal,
    color: color.ink,
  },
  scopeBody: {
    fontFamily: fontFamily.body,
    fontSize: font.caption,
    lineHeight: font.caption * leading.normal,
    color: color.inkMuted,
    marginTop: spacing.tight,
  },
  confirmCard: {
    backgroundColor: color.surface,
    borderWidth: 2,
    borderColor: color.accent,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.snug,
    marginBottom: spacing.xs,
  },
  confirmName: {
    fontFamily: fontFamily.displaySemi,
    fontSize: font.heading,
    lineHeight: font.heading * leading.snug,
    color: color.ink,
  },
  confirmDetail: {
    fontFamily: fontFamily.body,
    fontSize: font.caption,
    lineHeight: font.caption * leading.normal,
    color: color.inkMuted,
  },
  /** The promise, in the wash — AYNI MEKÂN = AYNI ODA. */
  promiseBox: {
    backgroundColor: color.accentWash,
    borderRadius: radius.md,
    padding: spacing.snug,
    gap: spacing.cozy,
  },
  promiseTitle: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.label,
    lineHeight: font.label * leading.snug,
    letterSpacing: tracking.none,
    color: color.inkMuted,
  },
  promiseBody: {
    fontFamily: fontFamily.body,
    fontSize: font.caption,
    lineHeight: font.caption * leading.normal,
    color: color.inkMuted,
  },
  confirmBody: {
    fontFamily: fontFamily.body,
    fontSize: font.caption,
    lineHeight: font.caption * leading.normal,
    color: color.inkMuted,
    marginTop: spacing.sm,
  },
  /** The result card (176:2429): the name and its kind, the choice on the right. */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.snug,
    borderRadius: radius.xl,
    backgroundColor: color.surface,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.snug,
    ...elevation.card,
  },
  rowBody: { flex: 1 },
  rowAction: {
    borderRadius: radius.pill,
    backgroundColor: color.accent,
    paddingHorizontal: spacing.wide,
    paddingVertical: spacing.sm,
  },
  rowActionText: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.control,
    color: color.onAccent,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowName: {
    fontFamily: fontFamily.displaySemi,
    fontSize: font.body,
    lineHeight: font.body * leading.snug,
    color: color.ink,
  },
  rowDetail: {
    fontFamily: fontFamily.body,
    fontSize: font.caption,
    lineHeight: font.caption * leading.normal,
    color: color.inkMuted,
    marginTop: spacing.tight,
  },
});
