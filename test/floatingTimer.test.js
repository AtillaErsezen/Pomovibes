// The floating timer content script that runs on web pages. It follows the saved timer
// and the toggle through storage changes, and counts down from the end time itself.
const { flush, loadFloatingTimer, setNow } = require('./helpers');

const NOW = new Date(2026, 4, 20, 10, 0, 0).getTime();

const timerEl = () => document.getElementById('pomodoro-floating-timer');
const timerText = () => document.getElementById('pomodoro-timer-text')?.textContent;
const sync = () => chrome.storage.sync._dump();

const running = (secondsLeft) => ({
  state: 'running', timeLeft: 1500, phase: 'study1', duration: 1500, endsAt: Date.now() + secondsLeft * 1000,
});
const stopped = (timeLeft) => ({ state: 'stopped', timeLeft, phase: 'study1', duration: 1500 });

// What the background script / popup do: save to storage
const saveTimer = async (timer) => {
  chrome._runIn('background', () => chrome.storage.local.set({ timer }));
  await flush();
};
const setToggle = async (on) => {
  chrome._runIn('popup', () => chrome.storage.sync.set({ floatingTimerEnabled: on }));
  await flush();
};

// Lets time pass and the timer redraw (it refreshes every 250ms)
const wait = async (seconds) => {
  jest.setSystemTime(Date.now() + seconds * 1000);
  await new Promise((r) => setTimeout(r, 300));
  await flush();
};
const waitForFadeOut = () => new Promise((r) => setTimeout(r, 750));

const openPage = async ({ toggle = true, timer } = {}) => {
  chrome.storage.sync._seed({ floatingTimerEnabled: toggle });
  if (timer) chrome.storage.local._seed({ timer });
  loadFloatingTimer();
  await flush();
};

beforeEach(() => {
  document.body.innerHTML = '';
  setNow(NOW);
});

describe('showing and hiding', () => {
  test('a page opened while the timer runs shows the time left', async () => {
    await openPage({ timer: running(65) });
    expect(timerText()).toBe('1:05');
  });

  test('it counts down on its own', async () => {
    await openPage({ timer: running(65) });
    await wait(5);
    expect(timerText()).toBe('1:00');
    await wait(60);
    expect(timerText()).toBe('0:00');
  });

  test('nothing shows while the timer is stopped', async () => {
    await openPage({ timer: stopped(100) });
    expect(timerEl()).toBeNull();
  });

  test('nothing shows when the toggle is off', async () => {
    await openPage({ toggle: false, timer: running(100) });
    expect(timerEl()).toBeNull();
  });

  test('pressing Start in the popup makes it appear on an open page', async () => {
    await openPage({ timer: stopped(1500) });
    await saveTimer(running(1500));
    expect(timerText()).toBe('25:00');
  });

  test('pressing Stop makes it disappear', async () => {
    await openPage({ timer: running(100) });
    await saveTimer(stopped(100));
    await waitForFadeOut();
    expect(timerEl()).toBeNull();
  });

  test('pressing Reset makes it disappear', async () => {
    await openPage({ timer: running(100) });
    await saveTimer({ state: 'stopped', timeLeft: 1500, phase: 'study1' });
    await waitForFadeOut();
    expect(timerEl()).toBeNull();
  });

  test('the next phase replaces the time without flicker', async () => {
    await openPage({ timer: running(1) });
    await saveTimer({ state: 'running', timeLeft: 300, phase: 'shortBreak1', duration: 300, endsAt: Date.now() + 300000 });
    expect(timerText()).toBe('5:00');
    expect(document.querySelectorAll('#pomodoro-floating-timer')).toHaveLength(1);
  });

  test('only one floating timer is ever created', async () => {
    await openPage({ timer: running(100) });
    for (let i = 0; i < 5; i++) await saveTimer(running(100 - i));
    await wait(3);
    expect(document.querySelectorAll('#pomodoro-floating-timer')).toHaveLength(1);
  });
});

describe('the close button and the toggle', () => {
  test('the close button turns the toggle off in storage and removes it', async () => {
    await openPage({ timer: running(100) });
    timerEl().querySelector('button').click();
    await flush();
    expect(sync().floatingTimerEnabled).toBe(false);
    await waitForFadeOut();
    expect(timerEl()).toBeNull();
  });

  test('after closing, it stays closed while the timer keeps running', async () => {
    await openPage({ timer: running(100) });
    timerEl().querySelector('button').click();
    await flush();
    await wait(10);
    await saveTimer(running(50)); // e.g. next phase
    await waitForFadeOut();
    expect(timerEl()).toBeNull();
  });

  test('turning the toggle off in the popup hides it', async () => {
    await openPage({ timer: running(100) });
    await setToggle(false);
    await waitForFadeOut();
    expect(timerEl()).toBeNull();
  });

  test('turning the toggle back on shows it again straight away', async () => {
    await openPage({ toggle: false, timer: running(90) });
    await setToggle(true);
    expect(timerText()).toBe('1:30');
  });
});

describe('at 0:00', () => {
  test('asks the background to finish the phase, once', async () => {
    await openPage({ timer: running(2) });
    await wait(2);
    await wait(1);
    await wait(1);
    expect(chrome._sentOfType('CHECK_TIMER')).toHaveLength(1);
  });

  test('does not ask before the end', async () => {
    await openPage({ timer: running(100) });
    await wait(50);
    expect(chrome._sentOfType('CHECK_TIMER')).toHaveLength(0);
  });
});

test('a change that arrives while the page is still loading wins over the page-load read', async () => {
  chrome.storage.sync._seed({ floatingTimerEnabled: true });
  chrome.storage.local._seed({ timer: stopped(1500) });
  loadFloatingTimer(); // page-load read starts...
  chrome._runIn('background', () => chrome.storage.local.set({ timer: running(1200) })); // ...Start is pressed
  await flush();
  expect(timerText()).toBe('20:00');
});
