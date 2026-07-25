/**
 * The client half of the profile-photo rules.
 *
 * Every rule in here also exists in `supabase/migrations/20260725001400_profile_photos.sql`
 * as a constraint or a policy. This copy is for a useful error message before a
 * round trip; the database is the enforcement point, and a client that skipped
 * all of this would still be refused.
 */
import * as Crypto from 'expo-crypto';

import { ApiError } from './contracts';

export type { PhotoUpload } from './contracts';

export const PHOTO_BUCKET = 'profile-photos';

/** Matches `profiles_photo_path_shape` exactly. */
export const PHOTO_PATH_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[a-z0-9]{24,64}\.(jpg|jpeg|png|webp)$/;

/** Matches the bucket's `allowed_mime_types`. */
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Matches the bucket's `file_size_limit`. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * How long a signed photo URL stays valid, and when to replace it.
 *
 * A signed URL is a bearer credential with an expiry, not a permanent address.
 * Whatever holds one has to re-sign before it lapses, or the image simply stops
 * loading and nothing says why — which is what a screen left open for six
 * minutes would otherwise show.
 */
export const PHOTO_URL_TTL_SECONDS = 300;
export const PHOTO_URL_REFRESH_MS = (PHOTO_URL_TTL_SECONDS - 45) * 1000;

export function isProfilePhotoPath(path: string): boolean {
  return PHOTO_PATH_PATTERN.test(path);
}

export function photoExtensionFor(mimeType: string): string {
  const extension = EXTENSION_BY_MIME[mimeType.toLowerCase()];
  if (!extension) {
    throw new ApiError('INVALID_INPUT', 'Use a JPEG, PNG, or WebP image.');
  }
  return extension;
}

/**
 * `<owner uuid>/<random token>.<ext>`.
 *
 * The token comes from a CSPRNG rather than `Math.random`, because a user id is
 * public to everyone in the room: if the second segment were predictable, the
 * path would be too, and the only thing standing between a stranger and the
 * object would be the read policy alone rather than the read policy plus an
 * unguessable name.
 */
export function buildPhotoPath(userId: string, mimeType: string): string {
  const extension = photoExtensionFor(mimeType);
  const bytes = Crypto.getRandomBytes(16);
  const token = Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  const path = `${userId}/${token}.${extension}`;
  if (!isProfilePhotoPath(path)) {
    // Only reachable if the session carried something that is not a user id.
    throw new ApiError('INVALID_INPUT', 'Could not prepare that photo.');
  }
  return path;
}
