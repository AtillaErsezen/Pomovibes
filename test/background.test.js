// The timer engine in background.js. A running timer stores when its phase ends (endsAt)
// and one alarm fires at that moment: bell, calendar record, next phase. Also covers
// stop/reset racing with the alarm, Chrome's 30-second alarm minimum for published
// extensions, browser restarts, and the one-time data migrations.
const { flush, loadBackground, passTime, setNow, today, fireInstalled, fireStartup } = require('./helpers');

const sync = () => chrome.storage.sync._dump();
const local = () => chrome.storage.local._dump();
const timer = () => local().timer;
const bells = () => chrome._sentOfType('PLAY_BELL');
const alarm = () => chrome._alarms.pomodoro;
const sessions = () => local().sessions || {};

const send = async (message) => {
  chrome.runtime.sendMessage(message);
  await flush();
};
// What the popup's buttons send
const start = () => send({ type: 'START_TIMER' });
const stop = () => send({ type: 'STOP_TIMER' });
const reset = () => send({ type: 'RESET_TIMER' });
const checkTimer = () => send({ type: 'CHECK_TIMER' });

const setSettings = (settings) =>
  chrome.storage.sync._seed({ settings: { study: 25, shortBreak: 5, longBreak: 15, cycles: 4, ...settings } });

// Runs the current phase to its end
const finishPhase = async () => passTime(timer().endsAt / 1000 - Date.now() / 1000);

const START = new Date(2026, 4, 20, 10, 0, 0).getTime();

beforeEach(() => {
  setNow(START);
  setSettings({});
  loadBackground();
});

describe('start / stop / reset', () => {
  test('start saves when the phase ends and sets one alarm for that moment (no per-second alarm)', async () => {
    await start();
    expect(timer()).toEqual({ state: 'running', timeLeft: 1500, phase: 'study1', duration: 1500, endsAt: START + 1500000 });
    expect(alarm()).toEqual({ name: 'pomodoro', scheduledTime: START + 1500000 });
  });

  test('nothing is written while the timer runs', async () => {
    await start();
    const writes = chrome.storage.local._writeCount();
    await passTime(600);
    expect(chrome.storage.local._writeCount()).toBe(writes);
  });

  test('stop freezes the remaining time and removes the alarm', async () => {
    await start();
    await passTime(10);
    await stop();
    expect(timer()).toEqual({ state: 'stopped', timeLeft: 1490, phase: 'study1', duration: 1500 });
    expect(alarm()).toBeUndefined();
  });

  test('a part second counts as a whole second left', async () => {
    await start();
    await passTime(10.4);
    await stop();
    expect(timer().timeLeft).toBe(1490);
  });

  test('resume continues from the frozen time and keeps the original length', async () => {
    await start();
    await passTime(10);
    await stop();
    await passTime(300); // paused for 5 minutes
    setSettings({ study: 50 });
    await start();
    expect(timer()).toMatchObject({ state: 'running', timeLeft: 1490, duration: 1500, endsAt: Date.now() + 1490000 });
  });

  test('pressing start again while running changes nothing', async () => {
    await start();
    const before = timer();
    await passTime(30);
    await start();
    expect(timer()).toEqual(before);
  });

  test('reset goes back to study 1 with the current study length', async () => {
    await start();
    await passTime(100);
    setSettings({ study: 40 });
    await reset();
    expect(timer()).toEqual({ state: 'stopped', timeLeft: 2400, phase: 'study1' });
    expect(alarm()).toBeUndefined();
  });

  test('an invalid saved study length falls back to 25 minutes', async () => {
    setSettings({ study: null });
    await reset();
    expect(timer().timeLeft).toBe(1500);
  });

  test('stop and reset when nothing is running are harmless', async () => {
    await stop();
    await reset();
    await stop();
    expect(timer()).toEqual({ state: 'stopped', timeLeft: 1500, phase: 'study1' });
    expect(bells()).toHaveLength(0);
  });
});

describe('end of a phase', () => {
  test('a study phase ending rings once, records it, and starts the short break', async () => {
    await start();
    await passTime(1500);
    expect(bells()).toHaveLength(1);
    expect(bells()[0].message.audioSource).toBe(chrome.runtime.getURL('assets/bell_sound.mp3'));
    expect(sessions()[today()]).toBe(25);
    expect(timer()).toEqual({ state: 'running', timeLeft: 300, phase: 'shortBreak1', duration: 300, endsAt: Date.now() + 300000 });
    expect(alarm().scheduledTime).toBe(Date.now() + 300000);
  });

  test('one second before the end nothing happens yet', async () => {
    await start();
    await passTime(1499);
    expect(bells()).toHaveLength(0);
    expect(timer().phase).toBe('study1');
  });

  test('an alarm that fires early does nothing and is set again for the real end', async () => {
    await start();
    await passTime(100);
    chrome._fireAlarm('pomodoro');
    await flush();
    expect(bells()).toHaveLength(0);
    expect(alarm().scheduledTime).toBe(START + 1500000);
  });

  test('the bell uses the uploaded custom sound when there is one', async () => {
    chrome.storage.local._seed({ customBellSound: 'data:audio/mpeg;base64,AAAA' });
    await start();
    await finishPhase();
    expect(bells()[0].message.audioSource).toBe('data:audio/mpeg;base64,AAAA');
  });

  test('phases follow study → short break ×3 → long break → study', async () => {
    setSettings({ study: 30, shortBreak: 7, longBreak: 20 });
    await reset();
    await start();
    const seen = [];
    for (let i = 0; i < 8; i++) {
      await finishPhase();
      seen.push([timer().phase, timer().timeLeft]);
    }
    expect(seen).toEqual([
      ['shortBreak1', 420], ['study2', 1800], ['shortBreak2', 420], ['study3', 1800],
      ['shortBreak3', 420], ['study4', 1800], ['longBreak', 1200], ['study1', 1800],
    ]);
    expect(bells()).toHaveLength(8);
    expect(sessions().completedSessions[today()]).toBe(4);
  });

  test('a break ending rings the bell but records no study session', async () => {
    chrome.storage.local._seed({ timer: { state: 'stopped', timeLeft: 300, phase: 'shortBreak1', duration: 300 } });
    await start();
    await finishPhase();
    expect(bells()).toHaveLength(1);
    expect(local().sessions).toBeUndefined();
  });

  test('the popup asking at 0:00 finishes the phase', async () => {
    await start();
    jest.setSystemTime(START + 1500000); // time is up but the alarm hasn't fired yet
    await checkTimer();
    expect(bells()).toHaveLength(1);
    expect(timer().phase).toBe('shortBreak1');
  });

  test('popup check and alarm arriving together: one bell, one record', async () => {
    await start();
    jest.setSystemTime(START + 1500000);
    chrome.runtime.sendMessage({ type: 'CHECK_TIMER' });
    chrome._runDueAlarms();
    chrome.runtime.sendMessage({ type: 'CHECK_TIMER' }); // e.g. a second tab
    await flush();
    expect(bells()).toHaveLength(1);
    expect(sessions().completedSessions[today()]).toBe(1);
    expect(timer().phase).toBe('shortBreak1');
  });

  test('the popup asking early does nothing', async () => {
    await start();
    await passTime(600);
    await checkTimer();
    expect(bells()).toHaveLength(0);
    expect(timer().phase).toBe('study1');
  });
});

describe('the bell never rings for a timer that did not finish', () => {
  test('stopped with time left: no bell even long after the original end', async () => {
    await start();
    await passTime(1000);
    await stop();
    await passTime(3600);
    expect(bells()).toHaveLength(0);
    expect(timer()).toMatchObject({ state: 'stopped', timeLeft: 500 });
  });

  // Delivers a message so its handler starts, without waiting for it to finish
  const deliver = async (type) => {
    chrome.runtime.sendMessage({ type });
    await new Promise((r) => setTimeout(r, 0));
  };

  test('stop on the last second, with the end-of-phase alarm right behind it: no bell, no record', async () => {
    await start();
    jest.setSystemTime(START + 1500000 - 800); // 0:01 on the display
    await deliver('STOP_TIMER'); // stop is being handled...
    jest.setSystemTime(START + 1500000);
    chrome._runDueAlarms(); // ...when the alarm fires
    await flush();
    expect(bells()).toHaveLength(0);
    expect(local().sessions).toBeUndefined();
    expect(timer()).toMatchObject({ state: 'stopped', phase: 'study1', timeLeft: 1 });
  });

  test('reset on the last second, with the end-of-phase alarm right behind it: no bell, timer reset', async () => {
    await start();
    jest.setSystemTime(START + 1500000 - 800);
    await deliver('RESET_TIMER');
    jest.setSystemTime(START + 1500000);
    chrome._runDueAlarms();
    await flush();
    expect(bells()).toHaveLength(0);
    expect(timer()).toEqual({ state: 'stopped', timeLeft: 1500, phase: 'study1' });
  });

  test('stop pressed just after the time ran out: the finished session counts, the break is paused', async () => {
    await start();
    jest.setSystemTime(START + 1500000);
    chrome._runDueAlarms(); // the phase has ended...
    chrome.runtime.sendMessage({ type: 'STOP_TIMER' }); // ...and Stop arrives right after
    await flush();
    expect(bells()).toHaveLength(1);
    expect(sessions().completedSessions[today()]).toBe(1);
    expect(timer()).toMatchObject({ state: 'stopped', phase: 'shortBreak1', timeLeft: 300 });
  });

  test('a leftover alarm from before a stop does nothing', async () => {
    await start();
    await stop();
    chrome._alarms.pomodoro = { name: 'pomodoro', scheduledTime: Date.now() };
    await passTime(1);
    expect(bells()).toHaveLength(0);
  });

  test('a leftover alarm from before a restart does not end the new run early', async () => {
    await start();
    await passTime(1000);
    await stop();
    await start(); // ends 500s from now
    chrome._fireAlarm('pomodoro'); // stale firing
    await flush();
    expect(bells()).toHaveLength(0);
    expect(alarm().scheduledTime).toBe(Date.now() + 500000);
  });
});

describe('published extension: alarms no sooner than 30 seconds out', () => {
  beforeEach(() => {
    chrome._minAlarmDelayMs = 30000;
  });

  test('a 25-minute session still ends after 25 minutes', async () => {
    await start();
    await passTime(1499);
    expect(bells()).toHaveLength(0);
    await passTime(1);
    expect(bells()).toHaveLength(1);
    expect(timer().phase).toBe('shortBreak1');
  });

  test('a whole cycle takes exactly the configured time', async () => {
    await start();
    let elapsed = 0;
    for (let i = 0; i < 8; i++) {
      const left = (timer().endsAt - Date.now()) / 1000;
      elapsed += left;
      await passTime(left);
    }
    expect(elapsed).toBe(4 * 1500 + 3 * 300 + 900);
    expect(bells()).toHaveLength(8);
  });

  test('resuming with 10 seconds left: the late alarm is covered by the popup check at 0:00', async () => {
    await start();
    await passTime(1490);
    await stop();
    await start();
    expect(alarm().scheduledTime).toBe(Date.now() + 30000); // Chrome pushes it to 30s
    await passTime(10);
    expect(bells()).toHaveLength(0); // alarm not due yet
    await checkTimer(); // popup / floating timer hit 0:00
    expect(bells()).toHaveLength(1);
    await passTime(20);
    expect(bells()).toHaveLength(1); // the late alarm finds nothing to do
  });
});

describe('browser restart and extension update', () => {
  test('a phase that ended while the browser was closed finishes on startup', async () => {
    await start();
    jest.setSystemTime(START + 2 * 3600000); // browser was closed for 2 hours
    delete chrome._alarms.pomodoro; // alarms may not survive
    await fireStartup();
    chrome._runDueAlarms();
    await flush();
    expect(bells()).toHaveLength(1);
    expect(sessions()[today()]).toBe(25);
    expect(timer()).toMatchObject({ state: 'running', phase: 'shortBreak1', endsAt: Date.now() + 300000 });
  });

  test('a running timer survives a restart with its end time intact', async () => {
    await start();
    await passTime(600);
    delete chrome._alarms.pomodoro;
    await fireStartup();
    expect(alarm().scheduledTime).toBe(START + 1500000);
    expect(timer().endsAt).toBe(START + 1500000);
  });

  test('a stopped timer clears any leftover alarm on startup', async () => {
    chrome.storage.local._seed({ timer: { state: 'stopped', timeLeft: 100, phase: 'study1' } });
    chrome._alarms.pomodoro = { name: 'pomodoro', scheduledTime: Date.now() + 1000, periodInMinutes: 1 / 60 };
    await fireStartup();
    expect(alarm()).toBeUndefined();
  });

  test('a timer left running by the old per-second version is converted on update', async () => {
    chrome.storage.sync._seed({ timer: { state: 'running', timeLeft: 700, phase: 'study2' } });
    chrome._alarms.pomodoro = { name: 'pomodoro', scheduledTime: Date.now(), periodInMinutes: 1 / 60 };
    await fireInstalled();
    expect(timer()).toMatchObject({ state: 'running', timeLeft: 700, phase: 'study2', endsAt: START + 700000 });
    expect(alarm()).toEqual({ name: 'pomodoro', scheduledTime: START + 700000 });
    await passTime(700);
    expect(bells()).toHaveLength(1);
    expect(sessions()[today()]).toBe(25); // no saved length: the default
  });
});

describe('calendar recording', () => {
  test('stopping early records nothing', async () => {
    await start();
    await passTime(1400);
    await stop();
    expect(local().sessions).toBeUndefined();
  });

  test('changing the study length mid-session records the length it started with', async () => {
    await start();
    await passTime(60);
    setSettings({ study: 50 });
    await passTime(1440);
    expect(sessions()[today()]).toBe(25);
    await finishPhase(); // short break
    expect(timer()).toMatchObject({ phase: 'study2', timeLeft: 3000, duration: 3000 });
  });

  test('pause, change settings, resume, finish: records the original length', async () => {
    await start();
    await passTime(10);
    await stop();
    setSettings({ study: 10 });
    await start();
    await finishPhase();
    expect(sessions()[today()]).toBe(25);
  });

  test('reset, change settings, start, finish: records the new length', async () => {
    await start();
    await passTime(10);
    setSettings({ study: 45 });
    await reset();
    await start();
    await finishPhase();
    expect(sessions()[today()]).toBe(45);
  });

  test('sessions on the same day add up', async () => {
    setSettings({ study: 20 });
    await reset();
    await start();
    for (let i = 0; i < 3; i++) {
      await finishPhase(); // study
      await finishPhase(); // break
    }
    expect(sessions()[today()]).toBe(60);
    expect(sessions().completedSessions[today()]).toBe(3);
  });

  test('a session is recorded on the day it ends', async () => {
    setNow(new Date(2026, 2, 10, 23, 50));
    await start();
    await finishPhase(); // ends 00:15 on the 11th
    expect(Object.keys(sessions()).filter((k) => /^\d{4}/.test(k))).toEqual(['2026-03-11']);
  });

  test('uses the local date, not UTC (01:30 in Istanbul is still the previous day in UTC)', async () => {
    setNow(new Date('2026-03-10T22:05:00Z')); // ends 22:30 UTC = 01:30 on the 11th in Istanbul
    await start();
    await finishPhase();
    expect(Object.keys(sessions()).filter((k) => /^\d{4}/.test(k))).toEqual(['2026-03-11']);
  });

  test('keeps recording after a year of history', async () => {
    const history = { completedSessions: {} };
    for (let i = 1; i <= 365; i++) {
      const d = new Date(2025, 0, i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      history[key] = 50;
      history.completedSessions[key] = 2;
    }
    chrome.storage.local._seed({ sessions: history });
    await start();
    await finishPhase();
    expect(sessions()[today()]).toBe(25);
  });
});

describe('storage location', () => {
  test('a full session never writes to sync', async () => {
    await start();
    const before = chrome.storage.sync._writeCount();
    await finishPhase();
    await finishPhase();
    expect(chrome.storage.sync._writeCount()).toBe(before);
    expect(sync().timer).toBeUndefined();
    expect(sync().sessions).toBeUndefined();
  });
});

describe('one-time migration of completed-session counts', () => {
  test('old days get a count from the current study length; recordedPhases is removed', async () => {
    setSettings({ study: 50 });
    chrome.storage.local._seed({
      sessions: { '2026-01-01': 120, '2026-01-02': 49, recordedPhases: { 'study1_2026-01-01T10:00:00.000Z': true } },
    });
    await fireInstalled();
    expect(local().sessions).toEqual({
      '2026-01-01': 120,
      '2026-01-02': 49,
      completedSessions: { '2026-01-01': 2, '2026-01-02': 0 },
    });
  });

  test('existing counts are never recalculated, even if the study length changes', async () => {
    chrome.storage.local._seed({ sessions: { '2026-01-01': 100, completedSessions: { '2026-01-01': 4 } } });
    setSettings({ study: 10 });
    await fireInstalled();
    await fireInstalled();
    expect(local().sessions.completedSessions).toEqual({ '2026-01-01': 4 });
  });

  test('nothing to migrate means no write', async () => {
    const writes = [];
    chrome.storage.onChanged.addListener((changes) => writes.push(changes));
    chrome.storage.local._seed({ sessions: { '2026-01-01': 25, completedSessions: { '2026-01-01': 1 } } });
    await fireInstalled();
    expect(writes).toEqual([]);
  });

  test('an invalid saved study length falls back to 25', async () => {
    chrome.storage.sync._seed({ settings: { study: null } });
    chrome.storage.local._seed({ sessions: { '2026-01-01': 50 } });
    await fireInstalled();
    expect(local().sessions.completedSessions).toEqual({ '2026-01-01': 2 });
  });
});

describe('moving data from sync to local storage (on install/update)', () => {
  const OLD_DATA = {
    timer: { state: 'stopped', timeLeft: 900, phase: 'study2', duration: 1500 },
    lastPhase: 'study2',
    tasks: [{ id: 1, content: 'Old task', category: 'Work', done: false }],
    customCategories: [{ name: 'Work', color: 'coral' }],
    lastUsedCategory: 'Work',
    completedTasks: { '2026-01-01': [1] },
    sessions: { '2026-01-01': 50, completedSessions: { '2026-01-01': 2 } },
  };
  const PREFERENCES = {
    darkMode: true,
    floatingTimerEnabled: false,
    backgroundMusicEnabled: true,
    backgroundMusicVolume: 0.4,
    backgroundSoundType: 'whiteNoise',
  };

  test('everything that grows moves to local; preferences stay in sync', async () => {
    chrome.storage.sync._seed({ ...OLD_DATA, ...PREFERENCES });
    await fireInstalled();
    expect(local()).toEqual(OLD_DATA);
    expect(sync()).toEqual({ settings: expect.any(Object), ...PREFERENCES });
  });

  test('if local already has a key, local wins and the old sync copy is dropped', async () => {
    chrome.storage.sync._seed({ tasks: [{ id: 1, content: 'stale', category: 'Work', done: false }] });
    chrome.storage.local._seed({ tasks: [{ id: 2, content: 'current', category: 'Work', done: true }] });
    await fireInstalled();
    expect(local().tasks).toEqual([{ id: 2, content: 'current', category: 'Work', done: true }]);
    expect(sync().tasks).toBeUndefined();
  });

  test('old calendar days moved from sync also get their completed-session count', async () => {
    chrome.storage.sync._seed({ sessions: { '2026-01-01': 75, recordedPhases: { x: true } } });
    await fireInstalled();
    expect(local().sessions).toEqual({ '2026-01-01': 75, completedSessions: { '2026-01-01': 3 } });
    expect(sync().sessions).toBeUndefined();
  });

  test('running it again changes nothing', async () => {
    chrome.storage.sync._seed(OLD_DATA);
    await fireInstalled();
    const after = { local: local(), sync: sync() };
    await fireInstalled();
    expect({ local: local(), sync: sync() }).toEqual(after);
  });

  test('a fresh install has nothing to move', async () => {
    await fireInstalled('install');
    expect(local()).toEqual({});
  });

  test('a stopped timer keeps working from where it was after the move', async () => {
    chrome.storage.sync._seed({ timer: { state: 'stopped', timeLeft: 600, phase: 'study1', duration: 1500 } });
    await fireInstalled();
    await start();
    await finishPhase();
    expect(sessions()[today()]).toBe(25);
  });
});
