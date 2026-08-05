/**
 * The one place the app says what just went wrong (owner, 2026-08-05).
 *
 * Three properties are the whole point of moving refusals off the pages: a
 * screen only has to *say* it, the newest one is the one on screen, and it
 * leaves by itself — because a refusal nobody can dismiss is how a stale
 * sentence ends up sitting under a list for the rest of the session.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Pressable, Text } from 'react-native';

import { ToastHost, useToast } from '../ToastHost';

/** A screen that owns no error state of its own — which is the point. */
function Caller({ messages }: { messages: string[] }) {
  const toast = useToast();
  return (
    <>
      {messages.map((message, index) => (
        <Pressable key={message} onPress={() => toast.error(message)} testID={`say-${index}`}>
          {/* Deliberately not the message itself: the assertions below are
              about what the host draws, not what the caller does. */}
          <Text>{`say ${index}`}</Text>
        </Pressable>
      ))}
    </>
  );
}

const mount = (messages: string[]) =>
  render(
    <ToastHost>
      <Caller messages={messages} />
    </ToastHost>,
  );

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

it('says nothing until a screen asks it to', () => {
  mount(['Konum bulunamadı.']);

  expect(screen.queryByTestId('app-toast')).toBeNull();
});

it('shows what a screen asked for, without that screen rendering anything', () => {
  mount(['Konum bulunamadı.']);

  fireEvent.press(screen.getByTestId('say-0'));

  expect(screen.getByTestId('app-toast')).toBeTruthy();
  expect(screen.getByText('Konum bulunamadı.')).toBeTruthy();
});

it('shows the newest refusal, because that is the one being waited on', () => {
  mount(['Konum bulunamadı.', 'Şu an etkinlik alanında değilsin.']);

  fireEvent.press(screen.getByTestId('say-0'));
  fireEvent.press(screen.getByTestId('say-1'));

  expect(screen.getByText('Şu an etkinlik alanında değilsin.')).toBeTruthy();
  expect(screen.queryByText('Konum bulunamadı.')).toBeNull();
});

it('leaves by itself', () => {
  mount(['Konum bulunamadı.']);
  fireEvent.press(screen.getByTestId('say-0'));

  act(() => {
    jest.advanceTimersByTime(3000);
  });

  expect(screen.queryByTestId('app-toast')).toBeNull();
});

it('leaves sooner when it is pressed', () => {
  mount(['Konum bulunamadı.']);
  fireEvent.press(screen.getByTestId('say-0'));

  fireEvent.press(screen.getByTestId('app-toast').parent!);

  expect(screen.queryByTestId('app-toast')).toBeNull();
});

it('refuses to show an empty sentence', () => {
  // A screen clearing its own state must not flash a blank card.
  function Blank() {
    const toast = useToast();
    return <Pressable onPress={() => toast.error('')} testID="say-nothing" />;
  }
  render(
    <ToastHost>
      <Blank />
    </ToastHost>,
  );

  fireEvent.press(screen.getByTestId('say-nothing'));

  expect(screen.queryByTestId('app-toast')).toBeNull();
});
