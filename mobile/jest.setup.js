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
