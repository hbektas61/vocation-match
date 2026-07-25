/**
 * Picking a profile photo, and the two things that have to happen to it before
 * it is allowed anywhere near the network.
 *
 * 1. Re-encode. A photo taken at the hotel carries an EXIF block, and that
 *    block routinely contains the exact GPS position and the timestamp of the
 *    shot. Uploading it unchanged would put the one thing this product promises
 *    never to expose (D-005) inside a file other guests can open. Rendering the
 *    pixels through the manipulator and saving a fresh JPEG drops every EXIF
 *    tag, because the new file simply never has one.
 * 2. Bound the size. 1080px on the long edge is more than a card needs and
 *    keeps a phone camera's 12 MB original from meeting the bucket's 5 MB
 *    limit as a failed upload.
 *
 * The permission dialog is the system's, and this is a one-shot foreground
 * read: nothing here runs in the background.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { ApiError, type PhotoUpload } from './contracts';

const MAX_EDGE_PX = 1080;
const JPEG_QUALITY = 0.8;

export type PickPhotoResult =
  | { status: 'picked'; upload: PhotoUpload }
  | { status: 'cancelled' }
  | { status: 'permission-denied' };

export async function pickProfilePhoto(): Promise<PickPhotoResult> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return { status: 'permission-denied' };
  }

  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    allowsMultipleSelection: false,
    // Never ask for it. What is not requested cannot be forwarded by mistake.
    exif: false,
    quality: 1,
  });

  if (picked.canceled || !picked.assets?.length) {
    return { status: 'cancelled' };
  }

  const asset = picked.assets[0];
  const context = ImageManipulator.manipulate(asset.uri);
  // Shrink only, and only along the longer edge — resizing unconditionally
  // would blow a small avatar up to 1080px and make the file bigger than the
  // one it replaced.
  if (asset.width > asset.height && asset.width > MAX_EDGE_PX) {
    context.resize({ width: MAX_EDGE_PX });
  } else if (asset.height >= asset.width && asset.height > MAX_EDGE_PX) {
    context.resize({ height: MAX_EDGE_PX });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: JPEG_QUALITY,
  });

  if (!saved.uri) {
    throw new ApiError('INVALID_INPUT', 'Could not read that image.');
  }
  return { status: 'picked', upload: { uri: saved.uri, mimeType: 'image/jpeg' } };
}
