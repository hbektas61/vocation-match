/**
 * H-105 — the photo controls in Settings.
 *
 * The picker itself is native, so it is mocked; what is under test is what the
 * screen does with each of its three answers — an image, a cancel, and a
 * refused permission — plus a failed upload, which has to leave the previous
 * photo alone and say so rather than showing a spinner that stops.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { COPY } from '../copy';
import { ApiError, FakeApi, getApi, setApi } from '../data';
import { pickProfilePhoto } from '../data/imagePicker';
import { onboardToSettings } from '../testSupport/onboarding';

jest.mock('../data/imagePicker', () => ({
  pickProfilePhoto: jest.fn(),
}));

const picker = pickProfilePhoto as jest.MockedFunction<typeof pickProfilePhoto>;
const FIXED = Date.parse('2026-07-25T10:00:00Z');

beforeEach(() => {
  picker.mockReset();
  setApi(new FakeApi({ now: () => FIXED }));
});

describe('profile photo in Settings', () => {
  it('offers to add a photo, and no way at all to type a link', async () => {
    await onboardToSettings();
    expect(await screen.findByTestId('settings-photo')).toBeTruthy();
    expect(screen.getByTestId('choose-photo')).toBeTruthy();
    expect(screen.queryByTestId('remove-photo')).toBeNull();
    // The old failure mode was a text field taking any https URL. There is no
    // field on this screen that could hold one.
    expect(screen.queryByLabelText(/photo url/i)).toBeNull();
  });

  it('uploads a chosen image and then offers to remove it', async () => {
    await onboardToSettings();
    expect(await screen.findByTestId('settings-photo')).toBeTruthy();
    picker.mockResolvedValue({
      status: 'picked',
      upload: { uri: 'file:///tmp/pick.jpg', mimeType: 'image/jpeg' },
    });

    await fireEvent.press(screen.getByTestId('choose-photo'));

    await waitFor(async () => {
      expect((await getApi().getOwnProfile())?.photoPath).not.toBeNull();
    });
    expect(await screen.findByTestId('remove-photo')).toBeTruthy();
    expect(screen.getByTestId('choose-photo')).toBeTruthy();
  });

  it('removes it again', async () => {
    await onboardToSettings();
    expect(await screen.findByTestId('settings-photo')).toBeTruthy();
    picker.mockResolvedValue({
      status: 'picked',
      upload: { uri: 'file:///tmp/pick.jpg', mimeType: 'image/jpeg' },
    });
    await fireEvent.press(screen.getByTestId('choose-photo'));
    await fireEvent.press(await screen.findByTestId('remove-photo'));

    await waitFor(async () => {
      expect((await getApi().getOwnProfile())?.photoPath).toBeNull();
    });
    expect(screen.queryByTestId('remove-photo')).toBeNull();
  });

  it('says nothing and changes nothing when the picker is cancelled', async () => {
    await onboardToSettings();
    expect(await screen.findByTestId('settings-photo')).toBeTruthy();
    picker.mockResolvedValue({ status: 'cancelled' });

    await fireEvent.press(screen.getByTestId('choose-photo'));

    await waitFor(() => expect(picker).toHaveBeenCalled());
    expect(screen.queryByTestId('photo-error')).toBeNull();
    expect((await getApi().getOwnProfile())?.photoPath).toBeNull();
  });

  it('explains a refused photo permission instead of failing silently', async () => {
    await onboardToSettings();
    expect(await screen.findByTestId('settings-photo')).toBeTruthy();
    picker.mockResolvedValue({ status: 'permission-denied' });

    await fireEvent.press(screen.getByTestId('choose-photo'));

    expect(await screen.findByTestId('photo-error')).toBeTruthy();
    expect(screen.getByText(COPY.photo.permissionDenied)).toBeTruthy();
  });

  it('reports a failed upload and keeps the photo that was already there', async () => {
    await onboardToSettings();
    expect(await screen.findByTestId('settings-photo')).toBeTruthy();
    const api = getApi() as FakeApi;
    picker.mockResolvedValue({
      status: 'picked',
      upload: { uri: 'file:///tmp/pick.jpg', mimeType: 'image/jpeg' },
    });
    await fireEvent.press(screen.getByTestId('choose-photo'));
    await screen.findByTestId('remove-photo');
    const before = (await api.getOwnProfile())?.photoPath;

    api.failNextUploadWith(new ApiError('NETWORK', 'No connection. Try again.'));
    await fireEvent.press(screen.getByTestId('choose-photo'));

    expect(await screen.findByTestId('photo-error')).toBeTruthy();
    expect((await api.getOwnProfile())?.photoPath).toBe(before);
    // And the button is usable again rather than stuck on "Uploading…".
    expect(screen.getByLabelText(COPY.photo.replaceButton)).toBeTruthy();
  });
});
