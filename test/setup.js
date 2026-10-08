require('@testing-library/jest-dom');
const { createChrome } = require('./chromeMock');
const { unloadScripts } = require('./helpers');

beforeEach(() => {
  global.chrome = createChrome();
  window.alert = jest.fn();
  // The app logs a lot; keep test output readable (errors still show)
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  unloadScripts(); // like closing the page: stop timers started by loaded scripts
  jest.useRealTimers();
  jest.restoreAllMocks();
});
