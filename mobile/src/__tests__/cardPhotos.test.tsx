/**
 * The card's photo set — the owner's amendment to D-026.
 *
 * One photo on a card is not believable, so a card carries every photo its
 * owner uploaded: segment bars up top, tap left/right to move. The fake's
 * fixture candidates own no photos, so the feed is stubbed at the instance —
 * what is under test is the card, not the fixtures.
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { FakeApi, getApi, setApi, type CandidateCard } from '../data';
import { onboardWithHotel } from '../testSupport/onboarding';

const FIXED = Date.parse('2026-07-25T10:00:00Z');
const OWNER = '00000000-0000-4000-8000-00000000000f';
const PATHS = [
  `${OWNER}/aaaa1111bbbb2222cccc3333.jpg`,
  `${OWNER}/dddd4444eeee5555ffff6666.jpg`,
  `${OWNER}/gggg7777hhhh8888iiii9999.jpg`,
];

const CANDIDATE: CandidateCard = {
  userId: OWNER,
  displayName: 'Derya',
  age: 29,
  bio: null,
  photoPath: PATHS[0],
  photoPaths: PATHS,
  interests: [],
  venueName: null,
  venuePlaceId: null,
  sameVenue: true,
  gender: null,
  orientations: [],
};

beforeEach(() => {
  setApi(new FakeApi({ now: () => FIXED }));
});

async function openDeckWithPhotos(): Promise<void> {
  await onboardWithHotel('Deniz', '+905551116001');
  const api = getApi();
  jest.spyOn(api, 'getDiscoveryFeed').mockResolvedValue([CANDIDATE]);
  jest
    .spyOn(api, 'getPhotoUrls')
    .mockImplementation(async (paths) =>
      Object.fromEntries(paths.map((path) => [path, `file:///signed/${path}`])),
    );
  await fireEvent.press(screen.getByTestId('tab-Vacation'));
  await fireEvent.press(await screen.findByTestId('open-here-now'));
  await fireEvent.press(await screen.findByTestId('simulate-near'));
  await screen.findByText(/You are in/);
  await fireEvent.press(screen.getByTestId('here-now-done'));
  await fireEvent.press(screen.getByRole('button', { name: 'Discovery' }));
  await screen.findByTestId(`candidate-${OWNER}`);
}

describe('the card photo set', () => {
  it('shows one segment per photo, with the first active', async () => {
    await openDeckWithPhotos();

    const segments = await screen.findByTestId('card-photo-segments');
    expect(segments.children).toHaveLength(PATHS.length);
  });

  it('moves through the set by tapping, and stops at both ends', async () => {
    await openDeckWithPhotos();
    const shown = () =>
      screen.getByTestId(`candidate-photo-${OWNER}`).props.source.uri as string;

    await waitFor(() => expect(shown()).toContain(PATHS[0]));

    // Back from the first photo goes nowhere rather than wrapping — wrapping
    // makes people lose their place.
    await fireEvent.press(screen.getByTestId('card-photo-previous'));
    expect(shown()).toContain(PATHS[0]);

    await fireEvent.press(screen.getByTestId('card-photo-next'));
    expect(shown()).toContain(PATHS[1]);
    await fireEvent.press(screen.getByTestId('card-photo-next'));
    expect(shown()).toContain(PATHS[2]);
    await fireEvent.press(screen.getByTestId('card-photo-next'));
    expect(shown()).toContain(PATHS[2]);

    await fireEvent.press(screen.getByTestId('card-photo-previous'));
    expect(shown()).toContain(PATHS[1]);
  });

  it('offers no navigation when there is only one photo', async () => {
    await onboardWithHotel('Deniz', '+905551116002');
    const api = getApi();
    jest
      .spyOn(api, 'getDiscoveryFeed')
      .mockResolvedValue([{ ...CANDIDATE, photoPaths: [PATHS[0]] }]);
    jest
      .spyOn(api, 'getPhotoUrls')
      .mockImplementation(async (paths) =>
        Object.fromEntries(paths.map((path) => [path, `file:///signed/${path}`])),
      );
    await fireEvent.press(screen.getByTestId('tab-Vacation'));
    await fireEvent.press(await screen.findByTestId('open-here-now'));
    await fireEvent.press(await screen.findByTestId('simulate-near'));
    await screen.findByText(/You are in/);
    await fireEvent.press(screen.getByTestId('here-now-done'));
    await fireEvent.press(screen.getByRole('button', { name: 'Discovery' }));
    await screen.findByTestId(`candidate-${OWNER}`);

    expect(screen.queryByTestId('card-photo-segments')).toBeNull();
    expect(screen.queryByTestId('card-photo-next')).toBeNull();
  });
});

describe('the empty room (owner reference, 2026-07-26)', () => {
  it('shows the radar with a scan-again action, and scanning asks the server again', async () => {
    await onboardWithHotel('Deniz', '+905551118201');
    const api = getApi();
    // An empty room, straight from the server's mouth.
    const feedSpy = jest.spyOn(api, 'getDiscoveryFeed').mockResolvedValue([]);

    await fireEvent.press(screen.getByTestId('tab-Vacation'));
    await fireEvent.press(await screen.findByTestId('open-here-now'));
    await fireEvent.press(await screen.findByTestId('simulate-near'));
    await screen.findByText(/You are in/);
    await fireEvent.press(screen.getByTestId('here-now-done'));
    await fireEvent.press(screen.getByRole('button', { name: 'Discovery' }));

    expect(await screen.findByTestId('discovery-empty')).toBeTruthy();
    expect(screen.getByText('No one here yet')).toBeTruthy();

    const callsBefore = feedSpy.mock.calls.length;
    await act(async () => {
      fireEvent.press(screen.getByTestId('discovery-rescan'));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    // "Scan again" is a real question to the server, not a reassurance.
    expect(feedSpy.mock.calls.length).toBeGreaterThan(callsBefore);
    feedSpy.mockRestore();
  });
});
