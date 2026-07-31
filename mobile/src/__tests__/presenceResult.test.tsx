/**
 * What the proximity check shows for each of its four answers (R-011).
 *
 * The refusals used to be one red line each, which said why and then left you
 * facing the button that had just failed. Two of them — "not at the place" and
 * "could not tell" — are recoverable, and recoverable *differently*, so each
 * now gets a heading, an explanation and two named ways on.
 *
 * The four states are asserted separately on purpose: they used to share one
 * branch, and a shared branch is exactly how "could not tell" ends up wearing
 * the sentence for "you are not here".
 *
 * The hard rule this file guards: no distance, no direction, no radius, in any
 * of them. The server answers with a boolean and the screen may not say more
 * than the server knows (D-005).
 */
import { screen } from '@testing-library/react-native';

import { COPY } from '../copy';
import { deviceLocation, FakeApi, getApi, setApi } from '../data';
import { getHotelById } from '../fixtures/hotels';
import { press } from '../testSupport/interact';
import { onboardWithHotel, PILOT_HOTEL } from '../testSupport/onboarding';

beforeEach(() => {
  setApi(new FakeApi());
});

/** Onboards, activates the pilot hotel, and opens the presence screen. */
async function openPresenceCheck(): Promise<void> {
  await onboardWithHotel('Deniz');
  await press(await screen.findByTestId('tab-Vacation'));
  await press(await screen.findByTestId('open-here-now'));
  expect(await screen.findByTestId('check-presence')).toBeTruthy();
}

/**
 * Every sentence a person can be shown by a refusal. A number in any of them
 * would be the app volunteering a distance it was never given.
 */
const REFUSAL_COPY = [
  COPY.hereNow.tooFarTitle,
  COPY.hereNow.tooFar,
  COPY.hereNow.tooFarWhat,
  COPY.hereNow.inaccurateTitle,
  COPY.hereNow.inaccurate,
  COPY.hereNow.inaccurateWhat,
];

describe('the proximity check, answer by answer', () => {
  it('says it is working while the check is in flight', async () => {
    await openPresenceCheck();

    const button = await screen.findByTestId('check-presence');
    // Not merely disabled: a control that goes quiet and keeps its label tells
    // a screen-reader user nothing at all, and this check can sit on a
    // permission prompt for a while.
    expect(button.props.accessibilityState).toMatchObject({ busy: false });
    expect(screen.queryByTestId('here-now-too-far')).toBeNull();
    expect(screen.queryByTestId('here-now-inaccurate')).toBeNull();
  });

  it('shows the refusal as a result, not a banner, when you are not there', async () => {
    await openPresenceCheck();
    await press(await screen.findByTestId('simulate-far'));

    const result = await screen.findByTestId('here-now-too-far');
    expect(result).toBeTruthy();
    expect(screen.getByText(COPY.hereNow.tooFarTitle)).toBeTruthy();
    expect(screen.getByTestId('here-now-too-far-notice')).toBeTruthy();
    // What happened, and both ways on — named for where they go.
    expect(screen.getByText(COPY.hereNow.whatHappened)).toBeTruthy();
    expect(screen.getByText(COPY.hereNow.tooFarWhat)).toBeTruthy();
    expect(screen.getByTestId('here-now-too-far-retry')).toBeTruthy();
    expect(screen.getByTestId('here-now-too-far-way-out')).toBeTruthy();

    // The other refusal must not also be on screen: they are different facts.
    expect(screen.queryByTestId('here-now-inaccurate')).toBeNull();
  });

  it('keeps "could not tell" apart from "you are not here"', async () => {
    await openPresenceCheck();

    // The device answers from the right place but with a reading far too
    // coarse to settle a 500 m question. That is neither a yes nor a no, and
    // the server writes nothing for it — so it must not wear the other
    // refusal's sentence. Driven through the real button and the real
    // reader, so this is the path a device takes.
    const hotel = getHotelById(PILOT_HOTEL);
    const coarse = jest.spyOn(deviceLocation, 'read').mockResolvedValue({
      status: 'granted',
      latitude: hotel!.latitude,
      longitude: hotel!.longitude,
      accuracyMeters: 900,
    });

    await press(await screen.findByTestId('check-presence'));

    expect(await screen.findByTestId('here-now-inaccurate')).toBeTruthy();
    expect(screen.getByText(COPY.hereNow.inaccurateTitle)).toBeTruthy();
    expect(screen.getByText(COPY.hereNow.inaccurateWhat)).toBeTruthy();
    expect(screen.getByTestId('here-now-inaccurate-retry')).toBeTruthy();
    expect(screen.getByTestId('here-now-inaccurate-way-out')).toBeTruthy();

    // Standing at the venue with a vague fix must never read as "not there".
    expect(screen.queryByTestId('here-now-too-far')).toBeNull();
    expect(screen.queryByText(COPY.hereNow.tooFar)).toBeNull();

    // And nothing was stored: a check that could not answer is not an answer.
    expect(
      (await getApi().getRooms()).find((room) => room.room === 'HERE_NOW')?.eligible,
    ).toBe(false);

    coarse.mockRestore();
  });

  it('offers the step that opens the other room when no stay is declared', async () => {
    await openPresenceCheck();
    await press(await screen.findByTestId('simulate-far'));
    await screen.findByTestId('here-now-too-far');

    // Before the Trip is shut until dates exist, so the way out is the step
    // that opens it rather than a deck with nobody in it.
    const wayOut = screen.getByTestId('here-now-too-far-way-out');
    expect(wayOut.props.accessibilityLabel).toBe(COPY.hereNow.addDates);
    await press(wayOut);
    expect(await screen.findByTestId('screen-upcoming')).toBeTruthy();
  });

  it('offers the deck itself once that room really is open', async () => {
    await onboardWithHotel('Deniz');
    // Dates make Before the Trip eligible, which is the only thing that turns
    // the way out from "open that room" into "go to it".
    await getApi().declareUpcomingStay('2026-08-10', '2026-08-18');
    await press(await screen.findByTestId('tab-Vacation'));
    await press(await screen.findByTestId('open-here-now'));
    await press(await screen.findByTestId('simulate-far'));
    await screen.findByTestId('here-now-too-far');

    // The screen reads the room's state from the server rather than from
    // whatever the previous screen happened to leave in the store — walking
    // this in the harness is how that bug was found.
    const wayOut = screen.getByTestId('here-now-too-far-way-out');
    expect(wayOut.props.accessibilityLabel).toBe(COPY.hereNow.seeUpcoming);
  });

  it('says permission was declined without dressing it as a refused check', async () => {
    await openPresenceCheck();
    await press(await screen.findByTestId('simulate-deny'));

    expect(await screen.findByText(COPY.hereNow.permissionDenied)).toBeTruthy();
    // A declined permission is not "you are not at the place".
    expect(screen.queryByTestId('here-now-too-far')).toBeNull();
    expect(screen.queryByTestId('here-now-inaccurate')).toBeNull();
  });

  it('never volunteers a distance, a direction or a radius', async () => {
    for (const sentence of REFUSAL_COPY) {
      expect(sentence).not.toMatch(/\d/);
      expect(sentence.toLowerCase()).not.toMatch(/metre|meters|metres|km|kilomet|mile/);
    }
  });
});
