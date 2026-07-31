/**
 * The empty inbox (R-009).
 *
 * D-058 deleted the old hero because it was a night-theme raster on a cream
 * ground — a hole, not a picture — and a colour-token sweep is blind to a
 * bitmap, which is exactly how it survived the repaint. The replacement is
 * drawn in code from the theme's own tokens, so it cannot drift the same way.
 *
 * Two things are worth pinning rather than eyeballing: it is decoration, so a
 * screen reader must walk straight past it to the sentence and the two ways
 * forward; and it must not push either of those out of reach.
 */
import { screen } from '@testing-library/react-native';

import { COPY } from '../copy';
import { FakeApi, setApi } from '../data';
import { press } from '../testSupport/interact';
import { onboardWithHotel } from '../testSupport/onboarding';

beforeEach(() => {
  setApi(new FakeApi());
});

async function openEmptyInbox(): Promise<void> {
  await onboardWithHotel('Deniz');
  await press(await screen.findByTestId('tab-Inbox'));
  expect(await screen.findByTestId('inbox-empty')).toBeTruthy();
}

describe('an inbox with nothing in it', () => {
  it('draws the empty state instead of leaving the screen blank', async () => {
    await openEmptyInbox();
    // `includeHiddenElements` because it is decoration and therefore genuinely
    // absent from the accessibility tree — see the next test, which is the
    // reason this query needs the flag at all.
    expect(screen.getByTestId('inbox-empty-art', { includeHiddenElements: true })).toBeTruthy();
  });

  it('hides the drawing from assistive technology', async () => {
    await openEmptyInbox();

    // It repeats the sentence beneath it and adds nothing. Announcing it would
    // only put noise between the heading and the two ways forward — so the
    // default query, which is the accessibility tree, must not see it at all.
    expect(screen.queryByTestId('inbox-empty-art')).toBeNull();

    const art = screen.getByTestId('inbox-empty-art', { includeHiddenElements: true });
    expect(art.props.accessibilityElementsHidden).toBe(true);
    expect(art.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('still leads somewhere — the picture did not take the CTAs' + "' place", async () => {
    await openEmptyInbox();

    expect(screen.getByText(COPY.inbox.emptyTitle)).toBeTruthy();
    expect(screen.getByText(COPY.inbox.emptyBody)).toBeTruthy();
    const start = screen.getByTestId('inbox-start-discovering');
    const rooms = screen.getByTestId('inbox-view-rooms');
    expect(start.props.accessibilityLabel).toBe(COPY.inbox.startDiscovering);
    expect(rooms.props.accessibilityLabel).toBe(COPY.inbox.viewRooms);

    await press(start);
    expect(await screen.findByTestId('screen-discovery')).toBeTruthy();
  });
});
