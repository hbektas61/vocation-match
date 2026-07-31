/**
 * H-105 — the photo controls in Settings.
 *
 * Settings used to have a photo component of its own, and that was the defect
 * rather than a detail: two components meant two photo models, and the
 * single-photo one deleted every object under the owner's prefix except the
 * one it knew about. Once a profile could hold nine, changing your photo from
 * Settings silently destroyed the other eight. It is now the same grid the
 * onboarding step uses, so what is left to check here is that Settings really
 * reaches the whole set — and that there is still nowhere to type a link.
 *
 * The grid's own behaviour is covered in `photoGridUi.test.tsx`.
 */
import { screen, waitFor } from '@testing-library/react-native';

import { FakeApi, getApi, setApi } from '../data';
import { pickProfilePhoto } from '../data/imagePicker';
import { onboardToSettings } from '../testSupport/onboarding';
import { press } from '../testSupport/interact';

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

/**
 * Q-002. `waitFor`'s default is 1000 ms, which is a render-tick budget. These
 * waits are not waiting for a render: they wait for a photo to be picked,
 * manipulated and stored, and on a machine running the whole gate in parallel
 * that took longer than a second — the assertion saw three photos where four
 * were expected, then passed 6/6 when re-run alone. The state being awaited was
 * already the right one, so the fix is to say out loud how long an upload may
 * take rather than to keep re-running until it fits.
 */
const UPLOAD = { timeout: 5000 };

describe('profile photos in Settings', () => {
  it('offers the grid, and no way at all to type a link', async () => {
    await onboardToSettings();

    expect(await screen.findByTestId('settings-photo-grid')).toBeTruthy();
    // D-014: there is no URL field anywhere, because there is no URL to write.
    expect(screen.queryByPlaceholderText(/https?:/i)).toBeNull();
  });

  it('adds a photo from Settings', async () => {
    await onboardToSettings();
    picks();

    await press(await screen.findByTestId('settings-photo-grid-add-1'));

    await waitFor(async () => {
      expect(await getApi().getOwnPhotos()).toHaveLength(1);
    }, UPLOAD);
  });

  it('keeps the rest of the set when one photo is changed', async () => {
    // The regression the shared component existed to cause: three photos, then
    // a fourth added from Settings, and the first three still there.
    await onboardToSettings();
    picks();
    for (const slot of [1, 2, 3]) {
      await press(await screen.findByTestId(`settings-photo-grid-add-${slot}`));
      await waitFor(async () => {
        expect(await getApi().getOwnPhotos()).toHaveLength(slot);
      }, UPLOAD);
    }
    const before = (await getApi().getOwnPhotos()).map((photo) => photo.path);

    await press(await screen.findByTestId('settings-photo-grid-add-4'));

    await waitFor(async () => {
      expect(await getApi().getOwnPhotos()).toHaveLength(4);
    }, UPLOAD);
    expect((await getApi().getOwnPhotos()).slice(0, 3).map((p) => p.path)).toEqual(before);
  });

  it('removes one again, and the card follows the set', async () => {
    await onboardToSettings();
    picks();
    await press(await screen.findByTestId('settings-photo-grid-add-1'));
    await waitFor(async () => {
      expect(await getApi().getOwnPhotos()).toHaveLength(1);
    }, UPLOAD);

    await press(screen.getByTestId('settings-photo-grid-remove-1'));

    await waitFor(async () => {
      expect(await getApi().getOwnPhotos()).toEqual([]);
    }, UPLOAD);
    expect((await getApi().getOwnProfile())?.photoPath).toBeNull();
  });

  it('says nothing and changes nothing when the picker is cancelled', async () => {
    await onboardToSettings();
    picker.mockResolvedValue({ status: 'cancelled' });

    await press(await screen.findByTestId('settings-photo-grid-add-1'));

    await waitFor(async () => {
      expect(await getApi().getOwnPhotos()).toEqual([]);
    }, UPLOAD);
    expect(screen.queryByTestId('settings-photo-grid-error')).toBeNull();
  });

  it('explains a refused photo permission instead of failing silently', async () => {
    await onboardToSettings();
    picker.mockResolvedValue({ status: 'permission-denied' });

    await press(await screen.findByTestId('settings-photo-grid-add-1'));

    expect(await screen.findByTestId('settings-photo-grid-error')).toBeTruthy();
  });
});
