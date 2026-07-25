/**
 * The picker is where D-005 is either kept or lost.
 *
 * A photo taken at the hotel carries an EXIF block with the exact GPS position
 * and the moment it was taken. Forwarding the picked file unchanged would put
 * that inside an object other guests can open — the one thing this product
 * promises never to expose. Two things prevent it: EXIF is never requested,
 * and the bytes that get uploaded come from a re-render, not from the original
 * file.
 *
 * What this cannot prove is that the native encoder really drops every tag;
 * that needs a GPS-tagged photo on a real device and an inspection of the
 * stored bytes, and it is listed in `.studio/device-readiness.md` as exactly
 * that. What it does prove is that the client never asks for the metadata and
 * never uploads the original path.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { pickProfilePhoto } from '../imagePicker';

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: jest.fn() },
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
}));

const requestPermission = ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock;
const launchLibrary = ImagePicker.launchImageLibraryAsync as jest.Mock;
const manipulate = ImageManipulator.manipulate as unknown as jest.Mock;

const ORIGINAL = 'file:///camera/IMG_0001.HEIC';
const REENCODED = 'file:///cache/reencoded.jpg';

let resize: jest.Mock;
let saveAsync: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  resize = jest.fn();
  saveAsync = jest.fn().mockResolvedValue({ uri: REENCODED, width: 1080, height: 1080 });
  const context = {
    resize,
    renderAsync: jest.fn().mockResolvedValue({ saveAsync }),
  };
  resize.mockReturnValue(context);
  manipulate.mockReturnValue(context);
  requestPermission.mockResolvedValue({ granted: true });
});

function pickedAsset(width: number, height: number) {
  return { canceled: false, assets: [{ uri: ORIGINAL, width, height }] };
}

describe('picking a profile photo', () => {
  it('never asks the picker for EXIF', async () => {
    launchLibrary.mockResolvedValue(pickedAsset(4032, 3024));
    await pickProfilePhoto();
    expect(launchLibrary).toHaveBeenCalledWith(expect.objectContaining({ exif: false }));
  });

  it('uploads the re-encoded file, not the one the picker returned', async () => {
    launchLibrary.mockResolvedValue(pickedAsset(4032, 3024));
    const result = await pickProfilePhoto();

    expect(result).toEqual({
      status: 'picked',
      upload: { uri: REENCODED, mimeType: 'image/jpeg' },
    });
    // The original path must not survive into the upload — that is what would
    // carry the metadata.
    expect(result.status === 'picked' && result.upload.uri).not.toBe(ORIGINAL);
    expect(manipulate).toHaveBeenCalledWith(ORIGINAL);
    expect(saveAsync).toHaveBeenCalledWith(
      expect.objectContaining({ format: SaveFormat.JPEG }),
    );
  });

  it('shrinks along the longer edge only', async () => {
    launchLibrary.mockResolvedValue(pickedAsset(4032, 3024));
    await pickProfilePhoto();
    expect(resize).toHaveBeenCalledWith({ width: 1080 });

    jest.clearAllMocks();
    launchLibrary.mockResolvedValue(pickedAsset(3024, 4032));
    await pickProfilePhoto();
    expect(resize).toHaveBeenCalledWith({ height: 1080 });
  });

  it('does not enlarge a small image', async () => {
    launchLibrary.mockResolvedValue(pickedAsset(400, 300));
    await pickProfilePhoto();
    expect(resize).not.toHaveBeenCalled();
    // Still re-encoded, because the metadata has to go regardless of size.
    expect(saveAsync).toHaveBeenCalled();
  });

  it('reports a refused permission without opening the library', async () => {
    requestPermission.mockResolvedValue({ granted: false });
    expect(await pickProfilePhoto()).toEqual({ status: 'permission-denied' });
    expect(launchLibrary).not.toHaveBeenCalled();
  });

  it('reports a cancel without touching the image', async () => {
    launchLibrary.mockResolvedValue({ canceled: true, assets: null });
    expect(await pickProfilePhoto()).toEqual({ status: 'cancelled' });
    expect(manipulate).not.toHaveBeenCalled();
  });
});
