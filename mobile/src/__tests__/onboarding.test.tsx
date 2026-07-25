/**
 * The way in, as one wizard.
 *
 * Four things here are worth a test rather than a screenshot: what is typed
 * survives going back, a finished onboarding does not come back on the next
 * launch, "Skip" appears only where skipping is genuinely allowed, and the
 * limit on interests is enforced rather than merely printed.
 */
import {
  act,
  cleanup,
  fireEvent,
  renderAsync,
  screen,
} from '@testing-library/react-native';
import React from 'react';
import { BackHandler } from 'react-native';

import App from '../../App';
import { COPY } from '../copy';
import { FakeApi, getApi, MAX_INTERESTS, setApi } from '../data';
import { INTEREST_CHOICES } from '../fixtures/interests';
import { onboard, onboardToTeaching, signUpAndSignIn } from '../testSupport/onboarding';

const FIXED = Date.parse('2026-07-25T10:00:00Z');

beforeEach(() => {
  setApi(new FakeApi({ now: () => FIXED }));
});

const chipFor = (choice: string) => screen.getByLabelText(choice);

/**
 * A cold start against the same backend. Pending work is flushed first —
 * tearing down mid-request aborts a `waitFor` and fails the test for a reason
 * that has nothing to do with what it is checking — and the teardown goes
 * through `cleanup` so the library stops tracking the old tree. Unmounting it
 * by hand leaves it in the queue, and the stale mount then bleeds into the
 * next test.
 */
async function relaunch(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    cleanup();
  });
  await renderAsync(<App />);
}

describe('moving through the wizard', () => {
  it('keeps what was typed when you go back and come forward again', async () => {
    await signUpAndSignIn('drafts@example.test');

    await fireEvent.changeText(await screen.findByTestId('profile-name'), 'Deniz');
    await fireEvent.press(screen.getByTestId('onboarding-continue'));

    // Back to the name, which should still be there rather than blank.
    await fireEvent.press(await screen.findByTestId('onboarding-back'));
    expect((await screen.findByTestId('profile-name')).props.value).toBe('Deniz');

    await fireEvent.press(screen.getByTestId('onboarding-continue'));
    expect(await screen.findByTestId('screen-onboarding-birthdate')).toBeTruthy();
  });

  it('offers no way past a step whose answer is required', async () => {
    await signUpAndSignIn('required@example.test');

    // The action stays on screen and stays disabled, rather than disappearing
    // and leaving somebody looking for the way on.
    const action = await screen.findByTestId('onboarding-continue');
    expect(action.props.accessibilityState.disabled).toBe(true);
    expect(screen.queryByTestId('onboarding-skip')).toBeNull();

    await fireEvent.changeText(screen.getByTestId('profile-name'), 'Deniz');
    expect(screen.getByTestId('onboarding-continue').props.accessibilityState.disabled).toBe(false);
  });

  it('offers a skip only on the steps that are genuinely optional', async () => {
    await signUpAndSignIn('optional@example.test');

    await fireEvent.changeText(await screen.findByTestId('profile-name'), 'Deniz');
    await fireEvent.press(screen.getByTestId('onboarding-continue'));
    await fireEvent.changeText(await screen.findByTestId('profile-birthdate'), '1994-03-01');
    // The birthdate is not optional: it is what the 18+ rule is checked against.
    expect(screen.queryByTestId('onboarding-skip')).toBeNull();
    await fireEvent.press(screen.getByTestId('onboarding-continue'));

    // Bio, interests and photo can all be left for later.
    expect(await screen.findByTestId('onboarding-skip')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('onboarding-skip'));
    expect(await screen.findByTestId('onboarding-skip')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('onboarding-skip'));
    expect(await screen.findByTestId('onboarding-skip')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('onboarding-skip'));

    // The hotel is not: every room in the product is a room at a hotel.
    expect(await screen.findByTestId('screen-onboarding-hotel')).toBeTruthy();
    expect(screen.queryByTestId('onboarding-skip')).toBeNull();
  });
});

/**
 * The wizard is one navigator screen with twelve steps inside it, so React
 * Navigation has nothing to pop: without a handler of its own, Android's back
 * button leaves the app from step four and takes everything typed with it.
 *
 * The platform build under test is iOS, where `BackHandler` is a stub that
 * never fires — so the registration itself is what is checked, by standing in
 * for Android and calling what the app registered. What this cannot show is a
 * real gesture on a real device; that is in `.studio/device-readiness.md`.
 */
describe('the Android back button', () => {
  let handlers: (() => boolean)[];

  /**
   * Android calls the most recently registered handler first and stops at the
   * first one that claims the press; if none does, the app closes. The
   * navigator registers one of its own and declines — with a single screen
   * there is nothing to pop — so the order matters and a single-slot stand-in
   * would prove nothing.
   */
  const pressBack = (): boolean => {
    for (let i = handlers.length - 1; i >= 0; i -= 1) {
      if (handlers[i]()) return true;
    }
    return false;
  };

  beforeEach(() => {
    handlers = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      const registered = handler as () => boolean;
      handlers.push(registered);
      return {
        remove: () => {
          handlers = handlers.filter((each) => each !== registered);
        },
      };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('goes back a step, and keeps the answer, instead of leaving the app', async () => {
    await signUpAndSignIn('androidback@example.test');

    await fireEvent.changeText(await screen.findByTestId('profile-name'), 'Deniz');
    await fireEvent.press(screen.getByTestId('onboarding-continue'));
    expect(await screen.findByTestId('screen-onboarding-birthdate')).toBeTruthy();

    // Claimed, so the app stays open — and lands on the previous question with
    // what was typed still in it.
    await act(async () => {
      expect(pressBack()).toBe(true);
    });
    expect(await screen.findByTestId('screen-onboarding-name')).toBeTruthy();
    expect(screen.getByTestId('profile-name').props.value).toBe('Deniz');
  });

  it('leaves the press alone on a step that has nowhere to go back to', async () => {
    await signUpAndSignIn('nowhereback@example.test');

    // The name step shows no back arrow: the account is made, and walking
    // backwards cannot un-make it. Back has to mean what the arrow means, and
    // here the arrow is absent, so nothing may claim the press.
    expect(await screen.findByTestId('screen-onboarding-name')).toBeTruthy();
    expect(screen.queryByTestId('onboarding-back')).toBeNull();
    expect(pressBack()).toBe(false);
  });
});

describe('interests', () => {
  async function reachInterests() {
    await signUpAndSignIn('interests@example.test');
    await fireEvent.changeText(await screen.findByTestId('profile-name'), 'Deniz');
    await fireEvent.press(screen.getByTestId('onboarding-continue'));
    await fireEvent.changeText(await screen.findByTestId('profile-birthdate'), '1994-03-01');
    await fireEvent.press(screen.getByTestId('onboarding-continue'));
    await fireEvent.press(await screen.findByTestId('onboarding-skip')); // bio
    expect(await screen.findByTestId('interest-choices')).toBeTruthy();
  }

  it('saves what was chosen, so the step is not asking for nothing', async () => {
    await reachInterests();

    await fireEvent.press(chipFor(INTEREST_CHOICES[0]));
    await fireEvent.press(chipFor(INTEREST_CHOICES[3]));
    await fireEvent.press(screen.getByTestId('onboarding-continue'));

    await screen.findByTestId('screen-onboarding-photo');
    expect((await getApi().getOwnProfile())?.interests).toEqual([
      INTEREST_CHOICES[0],
      INTEREST_CHOICES[3],
    ]);
  });

  it('stops at the limit instead of only printing it', async () => {
    await reachInterests();

    for (const choice of INTEREST_CHOICES.slice(0, MAX_INTERESTS)) {
      await fireEvent.press(chipFor(choice));
    }
    const overflow = chipFor(INTEREST_CHOICES[MAX_INTERESTS]);
    expect(overflow.props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(overflow);
    await fireEvent.press(screen.getByTestId('onboarding-continue'));
    await screen.findByTestId('screen-onboarding-photo');
    expect((await getApi().getOwnProfile())?.interests).toHaveLength(MAX_INTERESTS);
  });

  it('survives an unrelated profile edit rather than being quietly emptied', async () => {
    // Editing a bio through a form that does not ask about interests must not
    // be able to delete them — the same trap the photo field already had.
    await onboard('Deniz');
    await getApi().saveOwnProfile({
      displayName: 'Deniz',
      birthdate: '1994-03-01',
      bio: 'Same as before',
      interests: ['Coffee'],
    });

    await getApi().saveOwnProfile({
      displayName: 'Deniz',
      birthdate: '1994-03-01',
      bio: 'A new bio',
    });

    expect((await getApi().getOwnProfile())?.interests).toEqual(['Coffee']);
  });
});

describe('a finished onboarding', () => {
  it('does not come back on the next launch', async () => {
    await onboard('Deniz', 'returning@example.test');
    expect(await screen.findByTestId('screen-rooms')).toBeTruthy();

    // A cold start against the same backend: same session, same profile, same
    // hotel. Nothing about where somebody got to is written down, so this is
    // the only thing that proves the derived step lands in the right place.
    await relaunch();

    expect(await screen.findByTestId('screen-rooms')).toBeTruthy();
    expect(screen.queryByTestId('screen-welcome')).toBeNull();
    expect(screen.queryByTestId('screen-onboarding-hotel')).toBeNull();
  });

  it('shows the three teaching cards once, and only after finishing', async () => {
    await onboardToTeaching('Deniz', 'teaching@example.test');

    expect(await screen.findByText(COPY.onboarding.teaching.upcoming.title)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('teaching-next'));
    await fireEvent.press(screen.getByTestId('teaching-next'));
    await fireEvent.press(screen.getByTestId('teaching-start'));

    expect(await screen.findByTestId('screen-rooms')).toBeTruthy();

    // And not again on the next launch.
    await relaunch();
    expect(await screen.findByTestId('screen-rooms')).toBeTruthy();
    expect(screen.queryByText(COPY.onboarding.teaching.upcoming.title)).toBeNull();
  });
});
