// SafeAreaProvider renders no children in tests without native insets;
// the library ships an official mock for this.
jest.mock('react-native-safe-area-context', () => {
  const mock = require('react-native-safe-area-context/jest/mock');
  return mock.default ?? mock;
});
