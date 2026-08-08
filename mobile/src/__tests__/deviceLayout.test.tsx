/**
 * Three faults that only a real phone showed (owner's device photos, 2026-08-07).
 *
 * All three were invisible in the web preview and in every existing test,
 * because all three are about *the room a screen actually has*: a status-bar
 * inset, a tab bar, a safe-area strip. A test renderer has none of those and
 * lays nothing out, so what is pinned here is the decision each fix made rather
 * than the pixel it produced —
 *
 *   - the venue picker owns the whole head while it is open, so there is one
 *     head on the screen instead of two,
 *   - the deck's controls are a column under the card rather than circles
 *     placed a fixed distance from the bottom of a box whose height depends on
 *     insets, and a card with no photograph carries no readability scrim,
 *   - the ring keeps its corner on the one head that has no venue chip beside
 *     it to hold the other end of the row.
 *
 * Each of those is a claim that can rot silently, which is why they are here
 * and not only in a screenshot.
 */
import { screen, waitFor } from '@testing-library/react-native';
import { StyleSheet, type ViewStyle } from 'react-native';

import { COPY } from '../copy';
import { FakeApi, getApi, setApi, type CandidateCard } from '../data';
import { resetDeckLabels } from '../data/venueLabels';
import { press } from '../testSupport/interact';
import { onboardWithHotel } from '../testSupport/onboarding';
import { color } from '../theme';

const FIXED = Date.parse('2026-07-25T10:00:00Z');
const OWNER = '00000000-0000-4000-8000-00000000000f';
const PHOTO = `${OWNER}/aaaa1111bbbb2222cccc3333.jpg`;

function candidate(photoPath: string | null): CandidateCard {
  return {
    userId: OWNER,
    displayName: 'Derya',
    age: 29,
    bio: null,
    photoPath,
    photoPaths: photoPath ? [photoPath] : [],
    interests: [],
    venueName: null,
    venuePlaceId: null,
    sameVenue: true,
    gender: null,
    orientations: [],
  };
}

beforeEach(() => {
  setApi(new FakeApi({ now: () => FIXED }));
  resetDeckLabels();
});

/**
 * A node in the rendered tree, taken from a query rather than imported: the
 * testing library re-exports no name for it.
 */
type Node = ReturnType<typeof screen.getByTestId>;

/** The flattened style of a rendered node, whatever shape it was written in. */
function styleOf(node: Node): ViewStyle {
  return (StyleSheet.flatten(node.props.style) ?? {}) as ViewStyle;
}

/**
 * The row a control is sitting in.
 *
 * Layout is what these bugs are about and a test renderer has none, so the row
 * has to be found by walking up from something the screen already names. The
 * first ancestor that lays its children out in a line is the row; the control
 * itself is skipped because a round button centres its own glyph the same way.
 */
function rowAround(node: Node): ViewStyle {
  for (let parent = node.parent; parent; parent = parent.parent) {
    const style = styleOf(parent);
    if (style.flexDirection === 'row') return style;
  }
  throw new Error('no row around this node');
}

async function openDeck(photoPath: string | null): Promise<void> {
  await onboardWithHotel('Deniz', '+905551116101');
  const api = getApi();
  jest.spyOn(api, 'getDiscoveryFeed').mockResolvedValue([candidate(photoPath)]);
  jest
    .spyOn(api, 'getPhotoUrls')
    .mockImplementation(async (paths) =>
      Object.fromEntries(paths.map((path) => [path, `file:///signed/${path}`])),
    );
  await press(screen.getByTestId('tab-Vacation'));
  await press(await screen.findByTestId('active-hotel-enter'));
  await press(await screen.findByTestId('open-here-now'));
  await press(await screen.findByTestId('simulate-near'));
  await screen.findByText(/You are in/);
  await press(screen.getByTestId('here-now-done'));
  await press(screen.getByRole('button', { name: 'Discovery' }));
  await screen.findByTestId(`candidate-${OWNER}`);
}

describe('the venue picker owns the head it stands under', () => {
  it('takes the tab head down while it is open, and gives it back after', async () => {
    // The device photo: "Tatilim" at 32pt clipped under the status bar, with
    // the picker's own back arrow, eyebrow and step bar drawn under it — two
    // titles and two ways back on one screen. `venue_picker` draws no tab head.
    await onboardWithHotel('Deniz', '+905551116102');
    await press(screen.getByTestId('tab-Vacation'));
    expect(await screen.findByRole('header', { name: COPY.tabs.vacation })).toBeTruthy();

    await press(await screen.findByTestId('hotel-header-switch-venue'));
    await screen.findByTestId('venue-picker-country');

    expect(screen.queryByRole('header', { name: COPY.tabs.vacation })).toBeNull();
    expect(screen.queryByTestId('venue-ribbon')).toBeNull();
    expect(screen.queryByTestId('hotel-header-switch-venue')).toBeNull();
    // The picker's own head is the one that remains — the flow keeps its way
    // back, which is the half of "one head" that must not be lost.
    expect(screen.getByTestId('venue-picker-close')).toBeTruthy();

    // And the screen still takes the status-bar inset itself: with the tab
    // head gone the picker's back button is the topmost thing drawn, so
    // whatever holds it off the clock has to still be asking for it.
    // `SafeAreaView` normalises its `edges` list into a per-edge mode, so this
    // reads the mode rather than the array the screen wrote.
    expect(screen.getByTestId('screen-hotel').props.edges.top).toBe('additive');

    await press(screen.getByTestId('venue-picker-close'));
    expect(await screen.findByRole('header', { name: COPY.tabs.vacation })).toBeTruthy();
  });
});

describe('the deck stands in a column', () => {
  it('gives the card what is left rather than placing the dock by hand', async () => {
    // The device photo: the flag button half-buried in the strip under the
    // card. The dock was placed a fixed distance from the bottom of a box
    // whose height is the screen minus the safe-area inset minus the tab bar
    // — arithmetic the web preview got right and a notched phone did not.
    await openDeck(PHOTO);

    expect(styleOf(screen.getByTestId('deck-stage')).flex).toBe(1);
    const dock = styleOf(screen.getByTestId('deck-actions'));
    expect(dock.position).toBeUndefined();
    expect(dock.bottom).toBeUndefined();
  });

  it('scrims a photograph and leaves a card without one alone', async () => {
    // The scrim exists so white type survives any brightness of photo. Over
    // the cream well of a photoless card it is a grey smear across a flat
    // colour, which the owner read as a rendering fault.
    await openDeck(PHOTO);
    await waitFor(() => expect(screen.getByTestId('card-photo-scrim')).toBeTruthy());
  });

  it('and takes its words off white when the scrim is gone', async () => {
    await openDeck(null);

    expect(screen.queryByTestId('card-photo-scrim')).toBeNull();
    // White on the cream well is unreadable; the name falls back to the ink
    // the rest of the app reads in. Asserting the colour rather than the
    // style name, because the two must not drift apart quietly.
    const name = screen.getByText(/^Derya/);
    expect(StyleSheet.flatten(name.props.style).color).toBe(color.ink);
  });
});

describe('the head with no venue chip', () => {
  it('keeps the ring in its corner on Mesajlar', async () => {
    // `space-between` distributes one child to the start, so taking the chip
    // off (176:3771 draws no chip on this tab) slid the ring to the left.
    await onboardWithHotel('Deniz', '+905551116103');
    await press(screen.getByTestId('tab-Inbox'));

    const row = rowAround(await screen.findByTestId('inbox-profile-ring'));
    expect(row.justifyContent).toBe('flex-end');
  });

  it('and leaves the heads that do have one distributing as before', async () => {
    await onboardWithHotel('Deniz', '+905551116104');
    await press(screen.getByTestId('tab-Vacation'));

    const row = rowAround(await screen.findByTestId('hotel-profile-ring'));
    expect(row.justifyContent).toBe('space-between');
  });
});
