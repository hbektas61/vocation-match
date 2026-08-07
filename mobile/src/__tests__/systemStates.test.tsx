/**
 * D-065 slice 5 — a standing failure has a way out of it.
 *
 * The file draws three system states (176:4628): nothing here, this did not
 * work, and a permission worth asking for. The second one is the one the app
 * did not have. Every list that could not load said so in an error `Notice`
 * and stopped there — no retry, no path forward except leaving the screen,
 * on a failure whose usual cause is a tunnel or a lift.
 *
 * `ErrorState` is that missing state, and the thing worth pinning is not how
 * it looks but that its button *works*: it re-runs the same load, and a second
 * attempt that succeeds leaves the screen showing the list rather than the
 * apology. A retry that renders and does nothing is worse than no retry, and
 * it is exactly the kind of wiring a redesign gets wrong.
 */
import { screen, waitFor } from '@testing-library/react-native';

import { COPY } from '../copy';
import { ApiError, FakeApi, getApi, setApi } from '../data';
import { onboardToSettings } from '../testSupport/onboarding';
import { press } from '../testSupport/interact';

const FIXED = Date.parse('2026-07-25T10:00:00Z');

beforeEach(() => {
  setApi(new FakeApi({ now: () => FIXED }));
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('a list that could not load', () => {
  it('offers a retry, and the retry actually loads it', async () => {
    const api = getApi() as FakeApi;
    // Once, the way a dropped request fails. Every later call falls through to
    // the real implementation, which is what makes the second attempt a real
    // second attempt rather than a mocked success.
    const load = jest
      .spyOn(api, 'getBlockedUsers')
      .mockRejectedValueOnce(new ApiError('NETWORK', COPY.errors.network));

    await onboardToSettings();

    // The failure is a state on the page, not a banner over an empty card.
    const failure = await screen.findByTestId('blocked-error');
    expect(failure).toBeTruthy();
    expect(screen.queryByTestId('blocked-loading')).toBeNull();

    await press(screen.getByTestId('blocked-error-retry'));

    await waitFor(() => expect(screen.queryByTestId('blocked-error')).toBeNull());
    // Nobody has been blocked in this fixture, so the recovered list is the
    // empty state — which is the point: the screen moved on from the failure.
    expect(screen.getByText(COPY.settings.blockedEmpty)).toBeTruthy();
    expect(load.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
