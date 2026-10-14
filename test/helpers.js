const fs = require('fs');
const path = require('path');
const { act } = require('@testing-library/react');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

// Lets every queued chrome callback (and anything it queues) run
async function flush(maxRounds = 500) {
  let idle = 0;
  for (let i = 0; i < maxRounds && idle < 3; i++) {
    await new Promise((r) => setTimeout(r, 0));
    idle = chrome._pending() === 0 ? idle + 1 : 0;
  }
}

// Same as flush(), but inside React's act() so state updates are applied
async function settle() {
  await act(async () => {
    await flush();
  });
}

// Intervals started by loaded scripts, so a test can "close the page" afterwards
const scriptIntervals = [];
const trackedSetInterval = (...args) => {
  const id = setInterval(...args);
  scriptIntervals.push(id);
  return id;
};
// The background's timeouts run on the test clock: they fire when passTime() reaches them
let clockTimeouts = [];
const clockSetTimeout = (fn, ms = 0) => {
  clockTimeouts.push({ at: Date.now() + ms, fn });
};
function runDueTimeouts() {
  const due = clockTimeouts.filter((t) => t.at <= Date.now());
  clockTimeouts = clockTimeouts.filter((t) => t.at > Date.now());
  due.forEach((t) => chrome._runIn('background', t.fn));
}

function unloadScripts() {
  scriptIntervals.splice(0).forEach(clearInterval);
  clockTimeouts = [];
}

// Runs a plain (non-bundled) extension script, the way Chrome would, in its own context
function runScript(file, context, timeout = setTimeout) {
  const source = read(file);
  chrome._runIn(context, () =>
    new Function('chrome', 'setInterval', 'setTimeout', source)(chrome, trackedSetInterval, timeout)
  );
}

const loadBackground = () => runScript('background.js', 'background', clockSetTimeout);
const loadFloatingTimer = () => runScript('src/content/floatingTimer.js', 'content');

// Moves the (frozen) clock forward and fires any alarm that is now due
async function passTime(seconds, { inAct = false } = {}) {
  jest.setSystemTime(Date.now() + seconds * 1000);
  if (inAct) {
    await act(async () => {
      runDueTimeouts();
      chrome._runDueAlarms();
    });
    await settle();
  } else {
    runDueTimeouts();
    chrome._runDueAlarms();
    await flush();
  }
}

// Waits for the popup / floating timer to redraw (they refresh every 250ms)
async function redraw() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 300));
  });
  // React runs effects when act() ends; let anything they send (e.g. CHECK_TIMER) finish
  await settle();
}

// Chrome events the extension listens to
async function fireInstalled(reason = 'update') {
  chrome._runIn('chrome', () => chrome.runtime.onInstalled._dispatch({ reason }));
  await flush();
}
async function fireStartup() {
  chrome._runIn('chrome', () => chrome.runtime.onStartup._dispatch());
  await flush();
}

// Freezes only Date (timeouts stay real so chrome callbacks still run)
function setNow(date) {
  jest.useFakeTimers({
    doNotFake: [
      'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame',
      'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate',
      'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
    ],
  });
  jest.setSystemTime(date);
}

const MB = 1024 * 1024;
const makeFile = (size, name = 'bell.mp3', type = 'audio/mpeg') =>
  new File([new Uint8Array(size)], name, { type });

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

module.exports = {
  flush, settle, loadBackground, loadFloatingTimer, unloadScripts, passTime, redraw, fireInstalled, fireStartup,
  setNow, makeFile, MB, today, read,
};
