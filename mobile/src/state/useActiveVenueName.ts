/**
 * What this account's vacation venue is called, for any screen that says it.
 *
 * Six screens were each answering this question by hand, and all six answered
 * it the same wrong way: read the cached `HotelCard`'s name. For a Google venue
 * that name is the `(google)` marker (D-054) — a string that looks like an
 * answer, so it won the moment it existed and the real name was never asked
 * for. The chip printed "(GOOGLE)" on two tabs and the stay screen printed
 * "(google)" over its date panel.
 *
 * So the question is asked in one place, through the same session cache the
 * deck labels use (`venueLabels`): one `getActiveVenue`, one
 * `resolveGooglePlace`, however many screens draw the answer and however often
 * they remount. A screen that resolved it for the ribbon has already resolved
 * it for the banner underneath.
 */
import { useEffect, useState } from 'react';

import { catalogueVenueName } from '../data/contracts';
import { resolveOwnVenue, resolveOwnVenueLabel } from '../data/venueLabels';
import { useAppStore } from './AppStore';

export interface ActiveVenueName {
  /** The name to print, or null while nothing honest can be printed yet. */
  name: string | null;
  /**
   * The provider was asked and could not name it. Separate from `name: null`
   * because "still loading" and "there is no name to be had" are different
   * sentences, and a screen that says the second one too early is lying.
   */
  unavailable: boolean;
}

export function useActiveVenueName(): ActiveVenueName {
  const { state } = useAppStore();
  // The id the server remembers is the only thing allowed to answer "is a
  // venue chosen" — the cached card may simply not have arrived yet.
  const activeId = state.activeHotel?.hotelId ?? null;
  const cachedName = catalogueVenueName(state.hotels.find((h) => h.id === activeId));
  /**
   * What the provider answered, and *which venue it answered about*.
   *
   * The id travels with the name because switching venues is the one moment
   * this can lie: the new venue has no cached name either, so a bare name in
   * state would keep printing the venue you just left until the new answer
   * landed. Carrying the id means an answer only counts for the venue it was
   * asked about, and anything else reads as "not known yet".
   */
  const [answer, setAnswer] = useState<{ hotelId: string; name: string | null } | null>(null);

  useEffect(() => {
    if (!activeId || cachedName) return;
    let cancelled = false;
    void (async () => {
      const venue = await resolveOwnVenue(activeId);
      if (cancelled) return;
      if (venue?.provider !== 'google' || !venue.googlePlaceId) {
        setAnswer({ hotelId: activeId, name: null });
        return;
      }
      // D-054: resolved live, held in memory, never written down.
      const name = await resolveOwnVenueLabel(venue.googlePlaceId);
      if (!cancelled) setAnswer({ hotelId: activeId, name: name ?? null });
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId, cachedName]);

  const settled = answer && answer.hotelId === activeId ? answer : null;
  return {
    name: cachedName ?? settled?.name ?? null,
    unavailable: cachedName === null && settled !== null && settled.name === null,
  };
}
