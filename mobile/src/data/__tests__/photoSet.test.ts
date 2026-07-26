/**
 * The ordered photo set, at the API boundary.
 *
 * The invariant worth guarding is the one that keeps a card honest: a
 * discovery card reads `photoPath`, and `photoPath` is *derived* from slot 1.
 * If those two ever drift, somebody's grid and the card strangers see stop
 * being the same thing, and nothing in the UI would say so.
 */
import { FakeApi, MAX_PHOTOS, setApi, type VocationApi } from '../index';

const FIXED = Date.parse('2026-07-25T10:00:00Z');
const JPEG = { uri: 'file:///tmp/a.jpg', mimeType: 'image/jpeg' } as const;

async function signedInWithProfile(): Promise<VocationApi> {
  const api = new FakeApi({ now: () => FIXED });
  setApi(api);
  await api.requestPhoneOtp('+905551110001');
  await api.verifyPhoneOtp('+905551110001', '123456');
  await api.saveOwnProfile({ displayName: 'Ada', birthdate: '1994-03-01' });
  return api;
}

describe('building a set', () => {
  it('starts empty and appends in order', async () => {
    const api = await signedInWithProfile();
    expect(await api.getOwnPhotos()).toEqual([]);

    await api.addProfilePhoto(JPEG);
    await api.addProfilePhoto(JPEG);

    const photos = await api.getOwnPhotos();
    expect(photos.map((photo) => photo.slot)).toEqual([1, 2]);
    expect(new Set(photos.map((photo) => photo.path)).size).toBe(2);
  });

  it('derives the card photo from the first slot', async () => {
    const api = await signedInWithProfile();
    const [first] = await api.addProfilePhoto(JPEG);

    expect((await api.getOwnProfile())?.photoPath).toBe(first.path);
  });

  it('stops at nine', async () => {
    const api = await signedInWithProfile();
    for (let i = 0; i < MAX_PHOTOS; i += 1) await api.addProfilePhoto(JPEG);

    await expect(api.addProfilePhoto(JPEG)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(await api.getOwnPhotos()).toHaveLength(MAX_PHOTOS);
  });
});

describe('changing the order', () => {
  it('moves a photo to the front and takes the card with it', async () => {
    const api = await signedInWithProfile();
    await api.addProfilePhoto(JPEG);
    const photos = await api.addProfilePhoto(JPEG);
    const [one, two] = photos.map((photo) => photo.path);

    const reordered = await api.reorderProfilePhotos([two, one]);

    expect(reordered.map((photo) => photo.path)).toEqual([two, one]);
    // The whole point of the invariant.
    expect((await api.getOwnProfile())?.photoPath).toBe(two);
  });

  it('refuses a partial list, so reordering cannot delete', async () => {
    const api = await signedInWithProfile();
    await api.addProfilePhoto(JPEG);
    const photos = await api.addProfilePhoto(JPEG);

    await expect(api.reorderProfilePhotos([photos[0].path])).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(await api.getOwnPhotos()).toHaveLength(2);
  });

  it('refuses a path that is not in the set', async () => {
    const api = await signedInWithProfile();
    await api.addProfilePhoto(JPEG);

    await expect(
      api.reorderProfilePhotos(['00000000-0000-4000-8000-000000000001/aaaa.jpg']),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('removing', () => {
  it('closes the gap so slots stay contiguous', async () => {
    const api = await signedInWithProfile();
    await api.addProfilePhoto(JPEG);
    await api.addProfilePhoto(JPEG);
    const photos = await api.addProfilePhoto(JPEG);
    const third = photos[2].path;

    const left = await api.removeProfilePhotoAt(1);

    expect(left.map((photo) => photo.slot)).toEqual([1, 2]);
    expect(left[1].path).toBe(third);
  });

  it('promotes the next photo onto the card', async () => {
    const api = await signedInWithProfile();
    await api.addProfilePhoto(JPEG);
    const photos = await api.addProfilePhoto(JPEG);
    const second = photos[1].path;

    await api.removeProfilePhotoAt(1);

    expect((await api.getOwnProfile())?.photoPath).toBe(second);
  });

  it('leaves the card with nothing when the last one goes', async () => {
    const api = await signedInWithProfile();
    await api.addProfilePhoto(JPEG);

    await api.removeProfilePhotoAt(1);

    expect(await api.getOwnPhotos()).toEqual([]);
    expect((await api.getOwnProfile())?.photoPath).toBeNull();
  });

  it('is safe to retry on a slot that is already empty', async () => {
    const api = await signedInWithProfile();
    await api.addProfilePhoto(JPEG);

    await api.removeProfilePhotoAt(1);
    // A retry after a dropped response must not read as a failure.
    await expect(api.removeProfilePhotoAt(1)).resolves.toEqual([]);
  });
});

describe('whose set it is', () => {
  it('is empty for a different account, so the count is not collectable', async () => {
    const api = await signedInWithProfile();
    await api.addProfilePhoto(JPEG);

    await api.signOut();
    await api.requestPhoneOtp('+905551110002');
    await api.verifyPhoneOtp('+905551110002', '123456');
    await api.saveOwnProfile({ displayName: 'Bo', birthdate: '1994-03-01' });

    expect(await api.getOwnPhotos()).toEqual([]);
  });
});
