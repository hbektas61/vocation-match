/**
 * The 3×3 grid on the last onboarding step.
 *
 * The picker is native and mocked; what is under test is that the nine slots
 * are the real set rather than decoration — that only the next empty one
 * accepts a photo, that reordering actually reorders, and that removing
 * promotes whatever was behind it.
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { FakeApi, getApi, setApi } from '../data';
import { pickProfilePhoto } from '../data/imagePicker';
import { authenticateWithPhone } from '../testSupport/onboarding';

jest.mock('../data/imagePicker', () => ({
  pickProfilePhoto: jest.fn(),
}));

const picker = pickProfilePhoto as jest.MockedFunction<typeof pickProfilePhoto>;
const FIXED = Date.parse('2026-07-25T10:00:00Z');

beforeEach(() => {
  picker.mockReset();
  setApi(new FakeApi({ now: () => FIXED }));
});

const picks = () =>
  picker.mockResolvedValue({
    status: 'picked',
    upload: { uri: 'file:///tmp/a.jpg', mimeType: 'image/jpeg' },
  });

/** Walks to the photo step, which is where the grid lives. */
async function reachPhotoStep(phone: string): Promise<void> {
  await authenticateWithPhone(phone);
  await fireEvent.changeText(await screen.findByTestId('profile-name'), 'Deniz');
  await fireEvent.press(screen.getByTestId('onboarding-continue'));
  await fireEvent.changeText(await screen.findByTestId('profile-birthdate'), '01/03/1994');
  await fireEvent.press(screen.getByTestId('onboarding-continue'));
  await fireEvent.press(await screen.findByTestId('gender-woman'));
  await fireEvent.press(screen.getByTestId('onboarding-continue'));
  await fireEvent.press(await screen.findByTestId('onboarding-skip'));
  await fireEvent.press(await screen.findByTestId('show-me-everyone'));
  await fireEvent.press(screen.getByTestId('onboarding-continue'));
  await fireEvent.press(await screen.findByTestId('onboarding-skip'));
  await screen.findByTestId('photo-grid');
}

const addPhoto = async (slot: number) => {
  await fireEvent.press(screen.getByTestId(`photo-grid-add-${slot}`));
  await waitFor(() => expect(screen.getByTestId(`photo-grid-slot-${slot}`)).toBeTruthy());
};

describe('the grid', () => {
  it('shows nine slots, and only the next one accepts a photo', async () => {
    await reachPhotoStep('+905551118001');

    // Nine is the shape of the grid whether or not there are nine photos.
    expect(screen.getByTestId('photo-grid-add-9')).toBeTruthy();
    // Offering every empty slot would suggest a photo can go in slot seven
    // while six is empty, which the contiguous ordering does not allow.
    expect(screen.getByTestId('photo-grid-add-1').props.accessibilityState.disabled).toBe(false);
    expect(screen.getByTestId('photo-grid-add-2').props.accessibilityState.disabled).toBe(true);
  });

  it('adds a photo into the first slot and marks it as the one people see', async () => {
    await reachPhotoStep('+905551118002');
    picks();

    await addPhoto(1);

    expect(await getApi().getOwnPhotos()).toHaveLength(1);
    expect(screen.getByTestId('photo-grid-add-2').props.accessibilityState.disabled).toBe(false);
  });

  it('reorders through the screen-reader actions the drag cannot offer', async () => {
    // The visible reorder is a hold-and-drag, which jest cannot perform and a
    // screen reader cannot either. The accessibility actions are the assistive
    // path, and driving them exercises the same move the gesture makes.
    await reachPhotoStep('+905551118003');
    picks();
    await addPhoto(1);
    await addPhoto(2);
    const [first, second] = (await getApi().getOwnPhotos()).map((photo) => photo.path);

    // Driven through the prop, since fireEvent does not dispatch this event
    // name — which is also exactly what the platform does with it.
    await act(async () => {
      screen
        .getByTestId('photo-grid-slot-2')
        .props.onAccessibilityAction({ nativeEvent: { actionName: 'moveEarlier' } });
    });

    await waitFor(async () => {
      expect((await getApi().getOwnPhotos()).map((p) => p.path)).toEqual([second, first]);
    });
    // And the card follows, because the primary is derived from slot 1.
    expect((await getApi().getOwnProfile())?.photoPath).toBe(second);
  });

  it('offers no move where there is nowhere to go', async () => {
    await reachPhotoStep('+905551118004');
    picks();
    await addPhoto(1);

    // A single photo can move nowhere, so the tile announces no actions —
    // and invoking one anyway changes nothing.
    expect(screen.getByTestId('photo-grid-slot-1').props.accessibilityActions).toEqual([]);
    await act(async () => {
      screen
        .getByTestId('photo-grid-slot-1')
        .props.onAccessibilityAction({ nativeEvent: { actionName: 'moveLater' } });
    });
    await waitFor(async () => {
      expect(await getApi().getOwnPhotos()).toHaveLength(1);
    });
  });

  it('removes a slot and promotes what was behind it', async () => {
    await reachPhotoStep('+905551118005');
    picks();
    await addPhoto(1);
    await addPhoto(2);
    const second = (await getApi().getOwnPhotos())[1].path;

    await fireEvent.press(screen.getByTestId('photo-grid-remove-1'));

    await waitFor(async () => {
      expect(await getApi().getOwnPhotos()).toHaveLength(1);
    });
    expect((await getApi().getOwnProfile())?.photoPath).toBe(second);
  });

  it('treats a cancelled picker as nothing having happened', async () => {
    await reachPhotoStep('+905551118006');
    picker.mockResolvedValue({ status: 'cancelled' });

    await fireEvent.press(screen.getByTestId('photo-grid-add-1'));

    await waitFor(async () => {
      expect(await getApi().getOwnPhotos()).toEqual([]);
    });
    expect(screen.queryByTestId('photo-grid-error')).toBeNull();
  });

  it('says why when permission is refused, without losing the grid', async () => {
    await reachPhotoStep('+905551118007');
    picker.mockResolvedValue({ status: 'permission-denied' });

    await fireEvent.press(screen.getByTestId('photo-grid-add-1'));

    expect(await screen.findByTestId('photo-grid-error')).toBeTruthy();
    expect(screen.getByTestId('photo-grid-add-1')).toBeTruthy();
  });

  it('lets somebody finish without adding one at all', async () => {
    await reachPhotoStep('+905551118008');

    // A required photo is a barrier to exactly the people most careful about
    // being seen (D-024).
    await fireEvent.press(screen.getByTestId('onboarding-continue'));

    expect(await screen.findByTestId('screen-hotel')).toBeTruthy();
  });
});
