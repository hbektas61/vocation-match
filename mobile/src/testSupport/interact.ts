/**
 * Firing an event and letting the work it starts finish.
 *
 * `fireEvent` is synchronous and returns a boolean, so `await fireEvent.press(x)`
 * is not a wait — it is one microtask of yielding at the exact moment nothing
 * is act-wrapped. RTL wraps the dispatch itself in a synchronous `act`, which
 * closes the instant the handler hits its first `await`; the rest of the
 * handler — the save, the navigation, the `finally { setBusy(false) }` — then
 * lands in that gap. That is where this suite's ~627 "not wrapped in act"
 * warnings came from: the `await` looked like a wait and was in fact the thing
 * creating the hole.
 *
 * These put the dispatch inside an *async* act, so the handler's whole
 * continuation is queued and flushed while act is still open. Nothing here
 * sleeps, polls or inflates a timeout — the wait is React's own, and it is
 * exactly as long as the work takes.
 *
 * A test that needs to observe a *later* state still waits for that state
 * (`findBy*`/`waitFor`); this only closes the gap around the press itself.
 */
import { act, fireEvent } from '@testing-library/react-native';

/**
 * Whatever `fireEvent` itself accepts. Taken from the function rather than
 * imported from `react-test-renderer`, which ships no types of its own.
 */
type Element = Parameters<typeof fireEvent.press>[0];

/** Press a control and let its handler run to completion inside `act`. */
export async function press(target: Element): Promise<void> {
  await act(async () => {
    fireEvent.press(target);
  });
}

/** Type into a field and let anything the change triggers settle inside `act`. */
export async function typeText(target: Element, value: string): Promise<void> {
  await act(async () => {
    fireEvent.changeText(target, value);
  });
}

/** Any other event, by name — scroll, focus, blur, and the long tail. */
export async function fire(
  target: Element,
  event: string,
  ...args: unknown[]
): Promise<void> {
  await act(async () => {
    fireEvent(target, event, ...args);
  });
}
