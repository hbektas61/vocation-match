// SafeAreaProvider renders no children in tests without native insets;
// the library ships an official mock for this.
jest.mock('react-native-safe-area-context', () => {
  const mock = require('react-native-safe-area-context/jest/mock');
  return mock.default ?? mock;
});

// The suite installs the in-memory fake explicitly (`setApi(new FakeApi())`),
// so the build flag has to agree with it. Screens gate fake-only affordances
// on `isFakeApiEnabled()`; with the flag unset a test would run the fake while
// the app believed it was talking to a real backend, which is the one
// combination that never ships.
process.env.EXPO_PUBLIC_USE_FAKE_API = '1';

// `react-native-webview` reaches for a native module at import time, so a suite
// that renders any screen leading to the phone step fails to load without this.
// The library ships its own mock for exactly that; the CAPTCHA tests drive the
// component through its message boundary rather than through a real browser,
// which is the only part a device can test anyway.
jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  const WebView = React.forwardRef((props, ref) =>
    React.createElement(View, { ...props, ref }),
  );
  WebView.displayName = 'WebView';
  return { WebView, default: WebView };
});
