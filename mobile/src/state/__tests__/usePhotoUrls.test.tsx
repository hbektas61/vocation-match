/**
 * A signed URL expires. This is the regression test for the failure that fact
 * causes: a screen nobody closed — an inbox, a card left on top of the deck —
 * still holding links the server stopped honouring, so every photo on it goes
 * blank with nothing to say why.
 */
import { render, screen, act } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { FakeApi, getApi, setApi } from '../../data';
import { PHOTO_URL_REFRESH_MS } from '../../data/photos';
import { usePhotoUrls } from '../usePhotoUrls';

const PATHS = ['00000000-0000-4000-8000-000000000001/abcdefghijklmnopqrstuvwx.jpg'];

function Probe({ paths }: { paths: string[] }) {
  const urls = usePhotoUrls(paths);
  return <Text testID="urls">{JSON.stringify(urls)}</Text>;
}

beforeEach(() => {
  jest.useFakeTimers();
  setApi(new FakeApi());
});

afterEach(() => {
  jest.useRealTimers();
});

describe('usePhotoUrls', () => {
  it('re-signs before the URLs it is holding expire', async () => {
    const spy = jest.spyOn(getApi(), 'getPhotoUrls');

    render(<Probe paths={PATHS} />);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });
    expect(spy).toHaveBeenCalledTimes(1);

    // Nothing about the screen changed — the same people, the same paths — so
    // without a timer nothing would refetch and the URLs would simply lapse.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(PHOTO_URL_REFRESH_MS + 1);
    });
    expect(spy).toHaveBeenCalledTimes(2);

    // Three, not four: each refresh replaces the previous timer rather than
    // adding to it, so a screen left open for an hour does not end up
    // re-signing every photo dozens of times a minute.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(PHOTO_URL_REFRESH_MS + 1);
    });
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('asks for nothing and schedules nothing when there are no photos', async () => {
    const spy = jest.spyOn(getApi(), 'getPhotoUrls');

    render(<Probe paths={[]} />);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(PHOTO_URL_REFRESH_MS * 3);
    });

    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByTestId('urls').props.children).toBe('{}');
  });

});
