/**
 * One place the app says what just went wrong (owner, 2026-08-05).
 *
 * Every screen used to keep its own `notice` state and find somewhere on the
 * page to render it — which is how "Konum bulunamadı" ended up at the foot of
 * a list nobody scrolls to, and how the same refusal read differently on three
 * screens. A refusal to an action somebody just took is not page content: it
 * is news, it is read once, and then it should be gone.
 *
 * So the host is mounted once, over the whole app, and a screen only *says*
 * things:
 *
 *     const toast = useToast();
 *     toast.error(apiErrorMessage(err.code));
 *
 * What still belongs inline, and this is the whole distinction: a **standing
 * state** — "there are no events in this area", "this conversation is closed",
 * "the deck could not load". Those describe what the page *is* while you look
 * at it, so they stay where the eye already is and do not disappear.
 *
 * Latest wins. Two refusals in a row show the second one, because the second
 * is the one the person is waiting on.
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { Toast } from './ui';

type Tone = 'info' | 'error' | 'success';

interface ToastRequest {
  message: string;
  tone?: Tone;
  /** Lets a screen keep the id its tests already watch for. */
  testID?: string;
}

export interface ToastApi {
  show(request: ToastRequest): void;
  error(message: string, testID?: string): void;
  success(message: string, testID?: string): void;
  info(message: string, testID?: string): void;
}

/**
 * A no-op default rather than a thrown error: a screen rendered on its own in
 * a test should not crash because nothing above it is listening, and a lost
 * toast is a worse test failure to read than a missing assertion.
 */
const noop: ToastApi = {
  show: () => undefined,
  error: () => undefined,
  success: () => undefined,
  info: () => undefined,
};

const ToastContext = createContext<ToastApi>(noop);

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

export function ToastHost({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<ToastRequest | null>(null);

  const api = useMemo<ToastApi>(() => {
    const show = (request: ToastRequest) => {
      // An empty message is a screen clearing its own error state; showing an
      // empty card for it would be worse than saying nothing.
      if (!request.message) return;
      setCurrent(request);
    };
    return {
      show,
      error: (message, testID) => show({ message, tone: 'error', testID }),
      success: (message, testID) => show({ message, tone: 'success', testID }),
      info: (message, testID) => show({ message, tone: 'info', testID }),
    };
  }, []);

  const close = useCallback(() => setCurrent(null), []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Toast
        visible={current !== null}
        message={current?.message ?? ''}
        tone={current?.tone ?? 'info'}
        onClose={close}
        testID={current?.testID ?? 'app-toast'}
      />
    </ToastContext.Provider>
  );
}
