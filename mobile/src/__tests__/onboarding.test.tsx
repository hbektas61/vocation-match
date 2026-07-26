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
import { COPY, setLocale } from '../copy';
import { FakeApi, getApi, MAX_INTERESTS, setApi } from '../data';
import { tr } from '../i18n/tr';
import { INTEREST_CHOICES } from '../fixtures/interests';
import { onboard, onboardWithHotel, authenticateWithPhone } from '../testSupport/onboarding';

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

describe('the language', () => {
  // Module state: a suite that leaves the app speaking Turkish would fail
  // every English assertion that runs after it.
  afterEach(() => setLocale('en'));

  it('switches the whole conversation from the first screen', async () => {
    await renderAsync(<App />);
    await fireEvent.press(await screen.findByTestId('welcome-language-tr'));

    // The screen itself re-renders in Turkish…
    expect(await screen.findByText(tr.onboarding.welcome.headline)).toBeTruthy();

    // …and the choice travels with the flow rather than living on one screen.
    await fireEvent.press(screen.getByTestId('welcome-phone'));
    expect(await screen.findByText(tr.onboarding.promise.headline)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('onboarding-continue'));
    expect(await screen.findByText(tr.onboarding.phone.headline)).toBeTruthy();
  });

  it('speaks English by default, so nothing changed for existing tests', async () => {
    await renderAsync(<App />);
    expect(await screen.findByText(COPY.onboarding.welcome.headline)).toBeTruthy();
  });
});

describe('moving through the wizard', () => {
  it('keeps what was typed when you go back and come forward again', async () => {
    await authenticateWithPhone('+905551110011');

    await fireEvent.changeText(await screen.findByTestId('profile-name'), 'Deniz');
    await fireEvent.press(screen.getByTestId('onboarding-continue'));

    // Back to the name, which should still be there rather than blank.
    await fireEvent.press(await screen.findByTestId('onboarding-back'));
    expect((await screen.findByTestId('profile-name')).props.value).toBe('Deniz');

    await fireEvent.press(screen.getByTestId('onboarding-continue'));
    expect(await screen.findByTestId('screen-onboarding-birthdate')).toBeTruthy();
  });

  it('offers no way past a step whose answer is required', async () => {
    await authenticateWithPhone('+905551110012');

    // The action stays on screen and stays disabled, rather than disappearing
    // and leaving somebody looking for the way on.
    const action = await screen.findByTestId('onboarding-continue');
    expect(action.props.accessibilityState.disabled).toBe(true);
    expect(screen.queryByTestId('onboarding-skip')).toBeNull();

    await fireEvent.changeText(screen.getByTestId('profile-name'), 'Deniz');
    expect(screen.getByTestId('onboarding-continue').props.accessibilityState.disabled).toBe(false);
  });

  it('offers a skip only on the steps that are genuinely optional', async () => {
    await authenticateWithPhone('+905551110003');

    await fireEvent.changeText(await screen.findByTestId('profile-name'), 'Deniz');
    await fireEvent.press(screen.getByTestId('onboarding-continue'));
    await fireEvent.changeText(await screen.findByTestId('profile-birthdate'), '01/03/1994');
    // The birthdate is not optional: it is what the 18+ rule is checked against.
    expect(screen.queryByTestId('onboarding-skip')).toBeNull();
    await fireEvent.press(screen.getByTestId('onboarding-continue'));

    // Gender is required — the server refuses to finish without it.
    expect(await screen.findByTestId('screen-onboarding-gender')).toBeTruthy();
    expect(screen.queryByTestId('onboarding-skip')).toBeNull();
    await fireEvent.press(screen.getByTestId('gender-woman'));
    await fireEvent.press(screen.getByTestId('onboarding-continue'));

    // Orientation is not, and skipping it writes nothing.
    expect(await screen.findByTestId('onboarding-skip')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('onboarding-skip'));

    // Show me is required too: it decides what this person's own feed holds.
    expect(await screen.findByTestId('screen-onboarding-show-me')).toBeTruthy();
    expect(screen.queryByTestId('onboarding-skip')).toBeNull();
    await fireEvent.press(screen.getByTestId('show-me-everyone'));
    await fireEvent.press(screen.getByTestId('onboarding-continue'));

    // Passions and the photo can both be left for later.
    expect(await screen.findByTestId('onboarding-skip')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('onboarding-skip'));
    expect(await screen.findByTestId('screen-onboarding-photo')).toBeTruthy();
  });
});

/**
 * The wizard is one navigator screen with eleven steps inside it, so React
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
    await authenticateWithPhone('+905551110014');

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
    await authenticateWithPhone('+905551110015');

    // The name step shows no back arrow: the account is made, and walking
    // backwards cannot un-make it. Back has to mean what the arrow means, and
    // here the arrow is absent, so nothing may claim the press.
    expect(await screen.findByTestId('screen-onboarding-name')).toBeTruthy();
    expect(screen.queryByTestId('onboarding-back')).toBeNull();
    expect(pressBack()).toBe(false);
  });
});

describe('the birthdate', () => {
  it('is typed and shown as DD/MM/YYYY, and stored as ISO', async () => {
    await authenticateWithPhone('+905551119901');
    await fireEvent.changeText(await screen.findByTestId('profile-name'), 'Deniz');
    await fireEvent.press(screen.getByTestId('onboarding-continue'));

    const field = await screen.findByTestId('profile-birthdate');
    // Typed without separators; the field supplies them.
    await fireEvent.changeText(field, '01031994');
    expect(screen.getByTestId('profile-birthdate').props.value).toBe('01/03/1994');

    await fireEvent.press(screen.getByTestId('onboarding-continue'));
    await screen.findByTestId('screen-onboarding-gender');

    // The boundary: the day/month order is a display decision and the stored
    // form is the one that sorts and compares.
    expect((await getApi().getOwnProfile())?.birthdate).toBe('1994-03-01');
  });

  it('will not continue on a date the calendar does not have', async () => {
    await authenticateWithPhone('+905551119902');
    await fireEvent.changeText(await screen.findByTestId('profile-name'), 'Deniz');
    await fireEvent.press(screen.getByTestId('onboarding-continue'));

    await fireEvent.changeText(await screen.findByTestId('profile-birthdate'), '31/02/1994');

    // Nothing to say yet beyond the format the field already shows, so the
    // action simply stays inactive rather than arguing.
    expect(screen.getByTestId('onboarding-continue').props.accessibilityState.disabled).toBe(true);
  });
});

describe('interests', () => {
  async function reachInterests() {
    await authenticateWithPhone('+905551110016');
    await fireEvent.changeText(await screen.findByTestId('profile-name'), 'Deniz');
    await fireEvent.press(screen.getByTestId('onboarding-continue'));
    await fireEvent.changeText(await screen.findByTestId('profile-birthdate'), '01/03/1994');
    await fireEvent.press(screen.getByTestId('onboarding-continue'));
    await fireEvent.press(await screen.findByTestId('gender-woman'));
    await fireEvent.press(screen.getByTestId('onboarding-continue'));
    await fireEvent.press(await screen.findByTestId('onboarding-skip')); // orientation
    await fireEvent.press(await screen.findByTestId('show-me-everyone'));
    await fireEvent.press(screen.getByTestId('onboarding-continue'));
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

describe('gender, orientation and who you are shown', () => {
  async function reachGender(phone: string) {
    await authenticateWithPhone(phone);
    await fireEvent.changeText(await screen.findByTestId('profile-name'), 'Deniz');
    await fireEvent.press(screen.getByTestId('onboarding-continue'));
    await fireEvent.changeText(await screen.findByTestId('profile-birthdate'), '01/03/1994');
    await fireEvent.press(screen.getByTestId('onboarding-continue'));
    return screen.findByTestId('screen-onboarding-gender');
  }

  it('collects the answer but does not publish it unless asked', async () => {
    await reachGender('+905551119910');

    await fireEvent.press(screen.getByTestId('gender-woman'));
    await fireEvent.press(screen.getByTestId('onboarding-continue'));

    const saved = await getApi().getOwnProfile();
    // Answering is required; broadcasting it is a separate decision, and its
    // default is no.
    expect(saved?.gender).toBe('WOMAN');
    expect(saved?.showGender).toBe(false);
  });

  it('publishes it when the toggle is on', async () => {
    await reachGender('+905551119911');

    await fireEvent.press(screen.getByTestId('gender-woman'));
    await fireEvent.press(screen.getByTestId('show-gender'));
    await fireEvent.press(screen.getByTestId('onboarding-continue'));

    expect((await getApi().getOwnProfile())?.showGender).toBe(true);
  });

  it('opens the rest of the list in place rather than going somewhere', async () => {
    await reachGender('+905551119912');

    expect(screen.queryByTestId('gender-non-binary')).toBeNull();
    await fireEvent.press(screen.getByTestId('gender-more'));

    await fireEvent.press(await screen.findByTestId('gender-non-binary'));
    await fireEvent.press(screen.getByTestId('onboarding-continue'));

    expect((await getApi().getOwnProfile())?.gender).toBe('Non-binary');
  });

  it('writes nothing at all when orientation is skipped', async () => {
    await reachGender('+905551119913');
    await fireEvent.press(screen.getByTestId('gender-woman'));
    await fireEvent.press(screen.getByTestId('onboarding-continue'));

    await fireEvent.press(await screen.findByTestId('onboarding-skip'));

    // Skipping is an answer of "none", not a default to be filled in later.
    const saved = await getApi().getOwnProfile();
    expect(saved?.orientations).toEqual([]);
    expect(saved?.showOrientation).toBe(false);
  });

  it('stops at three orientations rather than only saying so', async () => {
    await reachGender('+905551119914');
    await fireEvent.press(screen.getByTestId('gender-woman'));
    await fireEvent.press(screen.getByTestId('onboarding-continue'));
    await screen.findByTestId('orientation-choices');

    for (const value of ['straight', 'gay', 'lesbian']) {
      await fireEvent.press(screen.getByTestId(`orientation-${value}`));
    }
    const overflow = screen.getByTestId('orientation-bisexual');
    expect(overflow.props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(overflow);
    await fireEvent.press(screen.getByTestId('onboarding-continue'));

    expect((await getApi().getOwnProfile())?.orientations).toHaveLength(3);
  });

  it('does not finish while a required answer is missing', async () => {
    await reachGender('+905551119915');
    await fireEvent.press(screen.getByTestId('gender-woman'));
    await fireEvent.press(screen.getByTestId('onboarding-continue'));
    await fireEvent.press(await screen.findByTestId('onboarding-skip'));

    // Show me is the second thing the server insists on, so the profile is
    // still a draft here however much else has been answered.
    expect(await screen.findByTestId('screen-onboarding-show-me')).toBeTruthy();
    expect((await getApi().getOwnProfile())?.onboardingCompletedAt).toBeNull();
  });
});

describe('a finished onboarding', () => {
  it('does not come back on the next launch', async () => {
    await onboard('Deniz', '+905551110017');
    expect(await screen.findByTestId('screen-rooms')).toBeTruthy();

    // A cold start against the same backend: same session, same profile, same
    // hotel. Nothing about where somebody got to is written down, so this is
    // the only thing that proves the derived step lands in the right place.
    await relaunch();

    expect(await screen.findByTestId('screen-rooms')).toBeTruthy();
    expect(screen.queryByTestId('screen-welcome')).toBeNull();
    expect(screen.queryByTestId('screen-onboarding-photo')).toBeNull();
  });

  it('does not ask a returning user for a hotel they already have', async () => {
    await onboardWithHotel('Deniz', '+905551110019');
    expect(await screen.findByTestId('screen-rooms')).toBeTruthy();

    // A relaunch never visits the Hotel tab, and nothing on the bootstrap path
    // fills the cached hotel cards — so a screen that decided "do you have a
    // hotel" from that cache told every returning user they had none. Whether
    // there is one is the server's answer; the cache only ever holds its name.
    await relaunch();

    expect(await screen.findByTestId('screen-rooms')).toBeTruthy();
    expect(screen.queryByTestId('rooms-choose-hotel')).toBeNull();
  });

  it('lands in the app with no hotel, and asks for one only when it is needed', async () => {
    await onboard('Deniz', '+905551110018');

    // Choosing a hotel is no longer part of finishing, so a complete profile
    // gets in without one.
    expect(await screen.findByTestId('screen-rooms')).toBeTruthy();
    expect(screen.queryByTestId('screen-onboarding-photo')).toBeNull();
  });
});
