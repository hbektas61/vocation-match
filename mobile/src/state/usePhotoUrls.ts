/**
 * Turns object paths into signed URLs a screen can render.
 *
 * A path is not a URL and cannot be rendered: the bucket is private, so the
 * server has to agree the caller may see that person before anything is
 * fetchable. A path that is refused simply has no entry here, which reads the
 * same as "no photo" — the point being that a viewer cannot tell the two apart
 * and so learns nothing about who is in a room with whom.
 */
import { useEffect, useMemo, useState } from 'react';

import { getApi } from '../data';
import { PHOTO_URL_REFRESH_MS } from '../data/photos';

export function usePhotoUrls(paths: (string | null | undefined)[]): Record<string, string> {
  // The dependency is the set of paths, not the array identity — a screen that
  // rebuilds its list on every render must not refetch on every render.
  const key = useMemo(
    () => [...new Set(paths.filter((p): p is string => Boolean(p)))].sort().join('|'),
    [paths],
  );
  // Held with the key it was fetched for. A stale answer is then discarded on
  // read rather than cleared by a synchronous setState in the effect, which
  // would render once with the wrong photos before correcting itself.
  const [resolved, setResolved] = useState<{ key: string; urls: Record<string, string> }>({
    key: '',
    urls: EMPTY_URLS,
  });

  // A signed URL expires. Without this, a screen left open past the lifetime —
  // an inbox nobody closed, a card nobody swiped — keeps rendering links the
  // server has stopped honouring, and every photo on it silently goes blank.
  const [refreshes, setRefreshes] = useState(0);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      try {
        const urls = await getApi().getPhotoUrls(key.split('|'));
        if (!cancelled) setResolved({ key, urls });
      } catch {
        // Photos are the least important thing on any of these screens. A
        // failure here leaves the initials fallback in place rather than
        // putting an error in front of someone trying to swipe.
        if (!cancelled) setResolved({ key, urls: EMPTY_URLS });
      }
      if (!cancelled) {
        timer = setTimeout(() => setRefreshes((n) => n + 1), PHOTO_URL_REFRESH_MS);
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [key, refreshes]);

  return resolved.key === key ? resolved.urls : EMPTY_URLS;
}

const EMPTY_URLS: Record<string, string> = {};
