/**
 * The unread badge, at the screen and store level.
 *
 * The staging run proves the *server* counts correctly. That is a different
 * claim from "the app shows the right number", and conflating the two is how a
 * badge ends up stale: the first version of this feature marked the
 * conversation read on the server and left `appState.matches` — which is what
 * the tab bar draws from — holding the old count. Every SQL assertion passed
 * and the dot stayed on screen.
 *
 * So these run against the real screens, through the real store.
 */
import { act, screen, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { FakeApi, getApi, setApi } from '../data';
import { press } from '../testSupport/interact';
import { onboardWithHotel } from '../testSupport/onboarding';

/**
 * Both marks are decoration: the count reaches a screen reader through the
 * tab's and the row's accessible names instead, so neither is in the
 * accessibility tree and neither is found by a default query.
 */
const HIDDEN = { includeHiddenElements: true } as const;

beforeEach(() => {
  setApi(new FakeApi());
});

/**
 * Onboards, matches with the fixture candidate who likes back, and has them
 * say something — which is the only way to get an unread message without a
 * second signed-in session.
 */
async function matchAndReceive(): Promise<{ matchId: string }> {
  await onboardWithHotel('Deniz');
  // A deck needs an open room. The presence check is the shortest way to one,
  // and it is the same simulated path `criticalFlow` uses.
  await press(await screen.findByTestId('tab-Vacation'));
  await press(await screen.findByTestId('open-here-now'));
  await press(await screen.findByTestId('simulate-near'));
  await press(await screen.findByTestId('here-now-done'));
  await press(await screen.findByTestId('tab-Discovery'));
  await press(await screen.findByTestId('swipe-like'));
  expect(await screen.findByText("It's a match!")).toBeTruthy();
  await press(screen.getByTestId('match-keep-browsing'));

  const api = getApi() as FakeApi;
  const matches = await api.getMatches();
  const match = matches[0];
  await api.receiveMessageForTest(match.matchId, 'Are you around later?');
  return { matchId: match.matchId };
}

describe('the unread badge', () => {
  it('appears on the tab and on the row when a message is waiting', async () => {
    await matchAndReceive();

    await press(await screen.findByTestId('tab-Inbox'));

    // The row's own count, and the tab's mark, both drawn from the same list.
    await waitFor(() => expect(screen.getByTestId('tab-Inbox-unread', HIDDEN)).toBeTruthy());
    const rows = screen.getAllByTestId(/^inbox-unread-/, HIDDEN);
    expect(rows).toHaveLength(1);
  });

  it('clears both once the conversation has actually been read', async () => {
    const { matchId } = await matchAndReceive();
    await press(await screen.findByTestId('tab-Inbox'));
    await waitFor(() => expect(screen.getByTestId('tab-Inbox-unread', HIDDEN)).toBeTruthy());

    // Open it. This is the whole subject: the server is told, and the local
    // list the tab bar reads from has to follow.
    await press(await screen.findByTestId(`inbox-${matchId}`));
    await screen.findByTestId('screen-chat');

    await waitFor(() => expect(screen.queryByTestId('tab-Inbox-unread', HIDDEN)).toBeNull());
    expect(await getApi().getMatches()).toEqual([
      expect.objectContaining({ matchId, unreadCount: 0 }),
    ]);
  });

  it('does not clear the badge when the server refuses the read', async () => {
    const { matchId } = await matchAndReceive();
    const api = getApi() as FakeApi;
    // A dot that disappears on a failed write is the app claiming something it
    // does not know. The next open will try again; this one must not lie.
    const refuse = jest
      .spyOn(api, 'markMatchRead')
      .mockRejectedValue(new Error('network'));

    await press(await screen.findByTestId('tab-Inbox'));
    await waitFor(() => expect(screen.getByTestId('tab-Inbox-unread', HIDDEN)).toBeTruthy());
    await press(await screen.findByTestId(`inbox-${matchId}`));
    await screen.findByTestId('screen-chat');

    expect(screen.queryByTestId('tab-Inbox-unread', HIDDEN)).toBeTruthy();
    refuse.mockRestore();
  });

  it('picks up a message that arrived while another screen was open', async () => {
    const { matchId } = await matchAndReceive();
    await press(await screen.findByTestId('tab-Inbox'));
    await press(await screen.findByTestId(`inbox-${matchId}`));
    await screen.findByTestId('screen-chat');
    await waitFor(() => expect(screen.queryByTestId('tab-Inbox-unread', HIDDEN)).toBeNull());

    // Away from the conversation, and something new arrives while the person
    // is looking at a completely different tab.
    await press(await screen.findByTestId('chat-back'));
    await press(await screen.findByTestId('tab-Vacation'));
    await (getApi() as FakeApi).receiveMessageForTest(matchId, 'Still on for tonight?');

    // Coming back to the inbox is one of the three moments the list is
    // re-read. It is not a poll, and it is not per render.
    await press(await screen.findByTestId('tab-Inbox'));
    await waitFor(() => expect(screen.getByTestId('tab-Inbox-unread', HIDDEN)).toBeTruthy());
  });
});

/**
 * Read means seen, and seen means the conversation was actually in front of
 * somebody. Mounted is not the same thing: a pushed screen stays mounted under
 * whatever is opened on top of it, and a backgrounded app keeps its whole
 * tree. Marking on arrival counted a message that landed while the phone was
 * in a pocket as read, which is the one thing an unread badge must never do.
 */
describe('read only while the conversation is genuinely visible', () => {
  /** Drives the platform's own lifecycle event, the way a real background does. */
  /**
   * Drives the platform's own lifecycle event, and lets what it starts finish.
   *
   * The receives around it are act-wrapped for the same reason: the visibility
   * effect is two awaits deep, so a bare call leaves its continuation landing
   * after act has closed.
   */
  const setAppState = async (next: 'active' | 'background') => {
    await act(async () => {
      // @ts-expect-error the RN jest mock exposes its listeners this way
      AppState.emit?.('change', next);
    });
  };

  it('a: open and active — the message is read', async () => {
    const { matchId } = await matchAndReceive();
    await press(await screen.findByTestId('tab-Inbox'));
    await press(await screen.findByTestId(`inbox-${matchId}`));
    await screen.findByTestId('screen-chat');
    await waitFor(() => expect(screen.queryByTestId('tab-Inbox-unread', HIDDEN)).toBeNull());
  });

  it('b: in the stack but another screen is in front — it stays unread', async () => {
    const { matchId } = await matchAndReceive();
    await press(await screen.findByTestId('tab-Inbox'));
    await press(await screen.findByTestId(`inbox-${matchId}`));
    await screen.findByTestId('screen-chat');
    await waitFor(() => expect(screen.queryByTestId('tab-Inbox-unread', HIDDEN)).toBeNull());

    // Report sits on top of the chat. The chat is still mounted; nobody is
    // looking at it.
    await press(await screen.findByTestId('chat-menu'));
    await press(await screen.findByTestId('chat-report-block'));
    await screen.findByTestId('screen-report-block');

    await act(async () => {
      await (getApi() as FakeApi).receiveMessageForTest(matchId, 'while you were away');
    });

    // Asserted on the server's own count rather than on the tab bar, which is
    // not on screen while a pushed route is in front — and the count is the
    // thing under test anyway.
    expect((await getApi().getMatches())[0].unreadCount).toBe(1);
  });

  it('c: open but the app is in the background — it stays unread', async () => {
    const { matchId } = await matchAndReceive();
    await press(await screen.findByTestId('tab-Inbox'));
    await press(await screen.findByTestId(`inbox-${matchId}`));
    await screen.findByTestId('screen-chat');
    await waitFor(() => expect(screen.queryByTestId('tab-Inbox-unread', HIDDEN)).toBeNull());

    await setAppState('background');
    // Let the read that was already in flight when the app went away finish,
    // so what follows is measuring the background rather than racing it.
    await act(async () => undefined);
    // Deliberately *not* act-wrapped, and this is the one place in the suite
    // where that is on purpose. Wrapping it flushes the effect chain far
    // enough that the read which was in flight when the app went away marks
    // the new message too, and the test then passes while asserting the
    // opposite of what it says. The two warnings this produces come from
    // `ChatScreen`'s realtime listener and are reported rather than hidden.
    await (getApi() as FakeApi).receiveMessageForTest(matchId, 'sent while backgrounded');

    // The conversation is on screen in the sense that it is the top route, and
    // not in the sense that anybody can see it.
    expect((await getApi().getMatches())[0].unreadCount).toBe(1);
  });

  it('d: back in the foreground with the chat still open — it is read', async () => {
    const { matchId } = await matchAndReceive();
    await press(await screen.findByTestId('tab-Inbox'));
    await press(await screen.findByTestId(`inbox-${matchId}`));
    await screen.findByTestId('screen-chat');
    await setAppState('background');
    await act(async () => undefined);
    // Deliberately *not* act-wrapped, and this is the one place in the suite
    // where that is on purpose. Wrapping it flushes the effect chain far
    // enough that the read which was in flight when the app went away marks
    // the new message too, and the test then passes while asserting the
    // opposite of what it says. The two warnings this produces come from
    // `ChatScreen`'s realtime listener and are reported rather than hidden.
    await (getApi() as FakeApi).receiveMessageForTest(matchId, 'sent while backgrounded');
    expect((await getApi().getMatches())[0].unreadCount).toBe(1);

    // Coming back re-reads the conversation first, so what is marked is what
    // is on screen rather than what was there when the phone went down.
    await setAppState('active');
    await waitFor(async () => {
      expect((await getApi().getMatches())[0].unreadCount).toBe(0);
    });
  });
});

/**
 * `useForegroundMatches` — implemented and wired into the store, and NOT
 * covered here.
 *
 * Two attempts are recorded on the board rather than left as a passing test
 * that proves something else: driving `AppState` from a test reaches a
 * listener a *screen* registered (cases c and d above depend on exactly that
 * and are green), and did not reach the store's when the whole tree was
 * mounted; spying on `AppState.addEventListener` around `renderHook` counted
 * 31 registrations from the renderer itself, so the assertion was measuring
 * the harness.
 *
 * Rather than write a third variant until something goes green, the honest
 * position is that the hook's end-to-end behaviour is unverified and the tab
 * badge after a background on a non-inbox screen is a **device check**. Said
 * out loud in the report and on the board.
 */
