// The popup's Timer component wired to the real background.js, driven the way a
// user would: Start / Stop / Reset in different orders, mixed with settings changes.
// The popup works out the time from the saved end time, so tests move the clock.
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Timer from '../src/components/Timer';
const { settle, loadBackground, passTime, redraw, setNow, today } = require('./helpers');

const DEFAULTS = { study: 25, shortBreak: 5, longBreak: 15, cycles: 4 };

const local = () => chrome.storage.local._dump();
const stored = () => local().timer;
const bells = () => chrome._sentOfType('PLAY_BELL');
const display = () => screen.getByText(/^\d+:\d\d$/).textContent;
const status = () => screen.getByText(/^(Running|Stopped)$/).textContent;
const button = (name) => screen.getByRole('button', { name });

const click = async (name) => {
  fireEvent.click(button(name));
  await settle();
};
// Let time pass with the popup open, then let it redraw
const wait = async (seconds) => {
  await passTime(seconds, { inAct: true });
  await redraw();
};

let rerender;
const renderTimer = async (settings = DEFAULTS) => {
  chrome.storage.sync._seed({ settings });
  ({ rerender } = render(<Timer settings={settings} darkMode={false} />));
  await settle();
};

// What saving in Settings does: store the new settings and pass them down from App
const changeSettings = async (changes) => {
  const settings = { ...DEFAULTS, ...changes };
  chrome.storage.sync._seed({ settings });
  rerender(<Timer settings={settings} darkMode={false} />);
  await settle();
};

const secondsToEnd = () => (stored().endsAt - Date.now()) / 1000;

beforeEach(() => {
  setNow(new Date(2026, 4, 20, 10, 0, 0));
  loadBackground();
});

describe('basic controls', () => {
  test('first open with empty storage shows a stopped 25:00 study timer and saves it', async () => {
    await renderTimer();
    expect(display()).toBe('25:00');
    expect(status()).toBe('Stopped');
    expect(screen.getByText(/Study Phase:/)).toBeInTheDocument();
    expect(stored()).toEqual({ state: 'stopped', timeLeft: 1500, phase: 'study1' });
  });

  test('Start runs the timer and the display counts down', async () => {
    await renderTimer();
    await click('Start');
    expect(status()).toBe('Running');
    expect(button('Start')).toBeDisabled();
    expect(button('Stop')).toBeEnabled();
    await wait(3);
    expect(display()).toBe('24:57');
    await wait(57);
    expect(display()).toBe('24:00');
  });

  test('Stop freezes the time and disables Stop', async () => {
    await renderTimer();
    await click('Start');
    await wait(5);
    await click('Stop');
    expect(status()).toBe('Stopped');
    expect(button('Stop')).toBeDisabled();
    expect(display()).toBe('24:55');
    expect(stored()).toMatchObject({ state: 'stopped', timeLeft: 1495 });
    await wait(60);
    expect(display()).toBe('24:55');
  });

  test('Reset while running goes back to a stopped full study timer', async () => {
    await renderTimer();
    await click('Start');
    await wait(7);
    await click('Reset');
    expect(display()).toBe('25:00');
    expect(status()).toBe('Stopped');
    expect(chrome._alarms.pomodoro).toBeUndefined();
    expect(stored()).toEqual({ state: 'stopped', timeLeft: 1500, phase: 'study1' });
  });

  test('Reset when already reset changes nothing', async () => {
    await renderTimer();
    await click('Reset');
    await click('Reset');
    expect(stored()).toEqual({ state: 'stopped', timeLeft: 1500, phase: 'study1' });
    expect(bells()).toHaveLength(0);
  });

  test('closing and reopening the popup while running shows the right time', async () => {
    await renderTimer();
    await click('Start');
    await wait(4);
    rerender(<div />); // popup closed
    await settle();
    await passTime(6);
    rerender(<Timer settings={DEFAULTS} darkMode={false} />);
    await settle();
    expect(display()).toBe('24:50');
    expect(status()).toBe('Running');
  });

  test('a phase that ends while the popup is closed shows the break on reopen', async () => {
    await renderTimer();
    await click('Start');
    rerender(<div />);
    await settle();
    await passTime(1500);
    await passTime(60);
    rerender(<Timer settings={DEFAULTS} darkMode={false} />);
    await settle();
    expect(screen.getByText(/Short Break:/)).toBeInTheDocument();
    expect(display()).toBe('4:00');
    expect(bells()).toHaveLength(1);
  });
});

describe('combinations of start / stop / reset', () => {
  test('start → stop → start → stop → start counts correctly', async () => {
    await renderTimer();
    await click('Start');
    await wait(2);
    await click('Stop');
    await wait(30); // paused time doesn't count
    await click('Start');
    await wait(3);
    await click('Stop');
    await click('Start');
    await wait(1);
    expect(display()).toBe('24:54');
    expect(stored()).toMatchObject({ state: 'running', duration: 1500 });
    expect(Object.keys(chrome._alarms)).toEqual(['pomodoro']);
  });

  test('reset then start runs from the full length again', async () => {
    await renderTimer();
    await click('Start');
    await wait(10);
    await click('Reset');
    await click('Start');
    await wait(1);
    expect(display()).toBe('24:59');
    expect(stored()).toMatchObject({ state: 'running', phase: 'study1', duration: 1500 });
  });

  test('stop → reset → start → stop leaves a stopped timer with the right time', async () => {
    await renderTimer();
    await click('Start');
    await wait(3);
    await click('Stop');
    await click('Reset');
    await click('Start');
    await wait(2);
    await click('Stop');
    expect(stored()).toMatchObject({ state: 'stopped', timeLeft: 1498, phase: 'study1' });
  });

  test('running a study session to the end rings once and shows the short break', async () => {
    await renderTimer();
    await click('Start');
    await wait(1500);
    expect(bells()).toHaveLength(1);
    expect(display()).toBe('5:00');
    expect(screen.getByText(/Short Break:/)).toBeInTheDocument();
    expect(status()).toBe('Running');
  });

  test('Stop on the last second: no bell, no calendar record', async () => {
    await renderTimer();
    await click('Start');
    await wait(1499);
    expect(display()).toBe('0:01');
    await click('Stop');
    await wait(60);
    expect(bells()).toHaveLength(0);
    expect(local().sessions).toBeUndefined();
    expect(stored()).toMatchObject({ state: 'stopped', phase: 'study1', timeLeft: 1 });
  });

  test('Reset on the last second: no bell, timer reset', async () => {
    await renderTimer();
    await click('Start');
    await wait(1499);
    await click('Reset');
    await wait(60);
    expect(bells()).toHaveLength(0);
    expect(stored()).toEqual({ state: 'stopped', timeLeft: 1500, phase: 'study1' });
  });

  test('the long break is labelled "Long Break"', async () => {
    chrome.storage.local._seed({ timer: { state: 'stopped', timeLeft: 900, phase: 'longBreak', duration: 900 } });
    await renderTimer();
    expect(screen.getByText(/Long Break:/)).toBeInTheDocument();
    expect(display()).toBe('15:00');
  });
});

describe('published extension (alarms no sooner than 30 seconds out)', () => {
  beforeEach(() => {
    chrome._minAlarmDelayMs = 30000;
  });

  test('a full session still takes 25 minutes', async () => {
    await renderTimer();
    await click('Start');
    await wait(1499);
    expect(bells()).toHaveLength(0);
    await wait(1);
    expect(bells()).toHaveLength(1);
    expect(screen.getByText(/Short Break:/)).toBeInTheDocument();
  });

  test('resume with 10 seconds left: the open popup finishes the phase at 0:00 without waiting for the late alarm', async () => {
    await renderTimer();
    await click('Start');
    await wait(1490);
    await click('Stop');
    await click('Start');
    await wait(10);
    expect(bells()).toHaveLength(1);
    expect(screen.getByText(/Short Break:/)).toBeInTheDocument();
  });
});

describe('changing settings combined with the controls', () => {
  test('changing study length while stopped at the start: shows the old time until Reset', async () => {
    await renderTimer();
    await changeSettings({ study: 50 });
    expect(display()).toBe('25:00');
    await click('Reset');
    expect(display()).toBe('50:00');
    expect(stored().timeLeft).toBe(3000);
  });

  test('changing study length while running does not change the running session', async () => {
    await renderTimer();
    await click('Start');
    await wait(5);
    await changeSettings({ study: 10 });
    await wait(1);
    expect(display()).toBe('24:54');
    await wait(secondsToEnd());
    expect(local().sessions[today()]).toBe(25);
  });

  test('change settings → reset → start → finish records the new length', async () => {
    await renderTimer();
    await click('Start');
    await wait(5);
    await changeSettings({ study: 30, shortBreak: 8 });
    await click('Reset');
    await click('Start');
    await wait(secondsToEnd());
    expect(local().sessions[today()]).toBe(30);
    expect(display()).toBe('8:00');
  });

  test('stop → change settings → start resumes the old session where it was', async () => {
    await renderTimer();
    await click('Start');
    await wait(10);
    await click('Stop');
    await changeSettings({ study: 45 });
    await click('Start');
    expect(stored()).toMatchObject({ state: 'running', timeLeft: 1490, duration: 1500 });
  });

  test('changing the break length mid-study applies to the coming break', async () => {
    await renderTimer();
    await click('Start');
    await changeSettings({ shortBreak: 12 });
    await wait(secondsToEnd());
    expect(stored()).toMatchObject({ phase: 'shortBreak1', timeLeft: 720 });
    expect(display()).toBe('12:00');
  });

  test('several settings changes then reset uses only the last one', async () => {
    await renderTimer();
    await changeSettings({ study: 40 });
    await changeSettings({ study: 15 });
    await changeSettings({ study: 60 });
    await click('Reset');
    expect(stored().timeLeft).toBe(3600);
  });
});
