/**
 * H-106 — the client half of the photo rules.
 *
 * The cross-user read policy is not testable here: the fake has one session at
 * a time. That half lives in `supabase/tests/011_profile_photos.sql`. What this
 * file is for is the shape of a path, and the two failure paths a user actually
 * meets — an upload that does not complete, and a photo that will not resolve.
 */
import { ApiError, FAKE_PHONE_OTP, FakeApi } from '..';
import { buildPhotoPath, isProfilePhotoPath, photoExtensionFor } from '../photos';

const ADULT_BIRTHDATE = '1994-03-01';
const JPEG = { uri: 'file:///tmp/pick.jpg', mimeType: 'image/jpeg' };

async function signedInWithProfile(): Promise<FakeApi> {
  const api = new FakeApi();
  await api.requestPhoneOtp('+905551110001');
  await api.verifyPhoneOtp('+905551110001', FAKE_PHONE_OTP);
  await api.saveOwnProfile({ displayName: 'Ada', birthdate: ADULT_BIRTHDATE });
  return api;
}

describe('photo paths', () => {
  const USER = '00000000-0000-4000-8000-000000000001';

  it('builds a path under the owner and nowhere else', () => {
    const path = buildPhotoPath(USER, 'image/jpeg');
    expect(path.startsWith(`${USER}/`)).toBe(true);
    expect(isProfilePhotoPath(path)).toBe(true);
  });

  it('does not repeat itself, so a path cannot be guessed from a user id', () => {
    const paths = new Set(
      Array.from({ length: 20 }, () => buildPhotoPath(USER, 'image/jpeg')),
    );
    expect(paths.size).toBe(20);
  });

  it.each([
    ['a URL', 'https://tracker.example/beacon.jpg'],
    ['a guessable name', `${USER}/avatar.jpg`],
    ['someone else’s prefix with no owner', 'photos/abcdefghijklmnopqrstuvwx.jpg'],
    ['a path traversal', `${USER}/../${USER}xx/abcdefghijklmnopqrstuvwx.jpg`],
    ['an executable', `${USER}/abcdefghijklmnopqrstuvwx.svg`],
  ])('rejects %s', (_label, candidate) => {
    expect(isProfilePhotoPath(candidate)).toBe(false);
  });

  it('refuses a media type the bucket does not allow', () => {
    expect(() => photoExtensionFor('image/gif')).toThrow(ApiError);
    expect(() => photoExtensionFor('application/pdf')).toThrow(ApiError);
  });
});

describe('profile photos through the API', () => {
  it('starts with no photo — it is optional', async () => {
    const api = await signedInWithProfile();
    expect((await api.getOwnProfile())?.photoPath).toBeNull();
  });

  it('stores an upload and resolves it to a URL for its owner', async () => {
    const api = await signedInWithProfile();
    const saved = await api.uploadProfilePhoto(JPEG);

    expect(saved.photoPath).not.toBeNull();
    expect(isProfilePhotoPath(saved.photoPath!)).toBe(true);
    expect(saved.photoPath!.startsWith(`${saved.id}/`)).toBe(true);

    const urls = await api.getPhotoUrls([saved.photoPath!]);
    expect(urls[saved.photoPath!]).toBeDefined();
  });

  it('replaces the old object rather than accumulating them', async () => {
    const api = await signedInWithProfile();
    const first = await api.uploadProfilePhoto(JPEG);
    const second = await api.uploadProfilePhoto(JPEG);

    expect(second.photoPath).not.toBe(first.photoPath);
    const urls = await api.getPhotoUrls([first.photoPath!, second.photoPath!]);
    expect(urls[first.photoPath!]).toBeUndefined();
    expect(urls[second.photoPath!]).toBeDefined();
  });

  it('removes the photo and the object together', async () => {
    const api = await signedInWithProfile();
    const uploaded = await api.uploadProfilePhoto(JPEG);
    const cleared = await api.removeProfilePhoto();

    expect(cleared.photoPath).toBeNull();
    expect(await api.getPhotoUrls([uploaded.photoPath!])).toEqual({});
  });

  it('leaves the current photo in place when an upload fails', async () => {
    const api = await signedInWithProfile();
    const first = await api.uploadProfilePhoto(JPEG);

    api.failNextUploadWith(new ApiError('NETWORK', 'No connection. Try again.'));
    await expect(api.uploadProfilePhoto(JPEG)).rejects.toMatchObject({ code: 'NETWORK' });

    // The honest outcome of a failed replace: the old photo, not a blank one
    // and not a profile pointing at an object that was never written.
    const after = await api.getOwnProfile();
    expect(after?.photoPath).toBe(first.photoPath);
    expect((await api.getPhotoUrls([first.photoPath!]))[first.photoPath!]).toBeDefined();
  });

  it('refuses a file type the bucket does not accept', async () => {
    const api = await signedInWithProfile();
    await expect(
      api.uploadProfilePhoto({ uri: 'file:///tmp/a.gif', mimeType: 'image/gif' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect((await api.getOwnProfile())?.photoPath).toBeNull();
  });

  it('keeps the photo when the rest of the profile is edited', async () => {
    const api = await signedInWithProfile();
    const uploaded = await api.uploadProfilePhoto(JPEG);
    const edited = await api.saveOwnProfile({
      displayName: 'Ada L',
      birthdate: ADULT_BIRTHDATE,
      bio: 'New bio',
    });
    expect(edited.photoPath).toBe(uploaded.photoPath);
  });

  it('has no way to write a URL — the field does not exist', async () => {
    const api = await signedInWithProfile();
    await api.saveOwnProfile({
      displayName: 'Ada',
      birthdate: ADULT_BIRTHDATE,
      // A client from before this change, still sending the old field.
      ...({ photoUrl: 'https://tracker.example/beacon.jpg' } as object),
    });
    const profile = await api.getOwnProfile();
    expect(profile?.photoPath).toBeNull();
    expect(Object.keys(profile!).sort()).toEqual([
      'age',
      'bio',
      'birthdate',
      'displayName',
      'gender',
      'id',
      'interests',
      'onboardingCompletedAt',
      'orientations',
      'photoPath',
      'showGender',
      'showMe',
      'showOrientation',
    ]);
  });

  it('resolves nothing for a path that is not yours or not a path at all', async () => {
    const api = await signedInWithProfile();
    await api.uploadProfilePhoto(JPEG);
    const urls = await api.getPhotoUrls([
      '00000000-0000-4000-8000-0000000000ff/abcdefghijklmnopqrstuvwx.jpg',
      'https://tracker.example/beacon.jpg',
    ]);
    expect(urls).toEqual({});
  });

  it('needs a session', async () => {
    const api = await signedInWithProfile();
    await api.signOut();
    await expect(api.uploadProfilePhoto(JPEG)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    await expect(api.removeProfilePhoto()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});
