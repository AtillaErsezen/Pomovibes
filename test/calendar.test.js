// Calendar items: study sessions and completed tasks per day — created by the
// background script and the to-do list, read by the calendar, updated, deleted.
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Calendar from '../src/components/Calendar';
import TodoList from '../src/components/TodoList';
const { settle, setNow, loadBackground, passTime, today, flush } = require('./helpers');

const local = () => chrome.storage.local._dump();

let utils;
const openCalendar = async () => {
  utils = render(<Calendar darkMode={false} />);
  await settle();
};
const reopen = async () => {
  utils.unmount();
  await openCalendar();
};

// The tooltip for a day of the shown month: { study, sessions, tasks }
const dayInfo = (day) => {
  const cell = Array.from(document.querySelectorAll('.group')).find(
    (g) => g.querySelector('span.relative.z-10')?.textContent === String(day)
  );
  const values = Array.from(cell.querySelectorAll('span.font-medium')).map((s) => s.textContent);
  return { study: values[0], sessions: values[1], tasks: values[2], cell };
};
const header = () => screen.getByRole('heading', { level: 2 }).textContent;
const monthBox = () => document.getElementById('monthInput');
const yearBox = () => document.getElementById('yearInput');

beforeEach(() => {
  setNow(new Date(2026, 4, 20, 10, 0)); // 20 May 2026, local time
});

describe('read', () => {
  test('a day shows its study minutes, completed sessions and tasks done', async () => {
    chrome.storage.local._seed({
      sessions: { '2026-05-12': 75, completedSessions: { '2026-05-12': 3 } },
      completedTasks: { '2026-05-12': [1, 2] },
    });
    await openCalendar();
    expect(dayInfo(12)).toMatchObject({ study: '75 min', sessions: '3', tasks: '2' });
  });

  test('an empty day shows zeros', async () => {
    await openCalendar();
    expect(dayInfo(3)).toMatchObject({ study: '0 min', sessions: '0', tasks: '0' });
  });

  test('completed sessions come from the stored count, not the current study length', async () => {
    chrome.storage.local._seed({ settings: { study: 10, shortBreak: 5, longBreak: 15, cycles: 4 } });
    chrome.storage.local._seed({ sessions: { '2026-05-12': 75, completedSessions: { '2026-05-12': 3 } } });
    await openCalendar();
    expect(dayInfo(12).sessions).toBe('3');
  });

  test('changing the study length later does not change past days', async () => {
    chrome.storage.local._seed({ sessions: { '2026-05-12': 50, completedSessions: { '2026-05-12': 2 } } });
    await openCalendar();
    chrome.storage.sync.set({ settings: { study: 50, shortBreak: 5, longBreak: 15, cycles: 4 } });
    await reopen();
    expect(dayInfo(12).sessions).toBe('2');
  });

  test('today is highlighted using the local date', async () => {
    setNow(new Date('2026-03-10T22:30:00Z')); // 11 March, 01:30 in Istanbul
    await openCalendar();
    expect(header()).toBe('March 2026');
    expect(dayInfo(11).cell.querySelector('.bg-blue-500')).not.toBeNull();
    expect(dayInfo(10).cell.querySelector('.bg-blue-500')).toBeNull();
  });

  test('neighbouring study days are marked as a streak; a lone day is not', async () => {
    chrome.storage.local._seed({ sessions: { '2026-05-04': 25, '2026-05-05': 25, '2026-05-14': 25 } });
    await openCalendar();
    const streak = (d) => dayInfo(d).cell.querySelector('.bg-green-300') !== null;
    expect(streak(4)).toBe(true);
    expect(streak(5)).toBe(true);
    expect(streak(14)).toBe(false);
  });

  test('a streak across a month boundary counts', async () => {
    chrome.storage.local._seed({ sessions: { '2026-04-30': 25, '2026-05-01': 25 } });
    await openCalendar();
    expect(dayInfo(1).cell.querySelector('.bg-green-300')).not.toBeNull();
  });
});

describe('create (records appear as they happen)', () => {
  test('a finished study session shows up without reopening', async () => {
    loadBackground();
    await openCalendar();
    // a session that ends one second from now
    chrome.storage.local._seed({ timer: { state: 'running', timeLeft: 1500, phase: 'study1', duration: 1500, endsAt: Date.now() + 1000 } });
    chrome._alarms.pomodoro = { name: 'pomodoro', scheduledTime: Date.now() + 1000 };
    await passTime(1, { inAct: true });
    expect(dayInfo(20)).toMatchObject({ study: '25 min', sessions: '1' });
  });

  test('completing a to-do shows up in "Tasks Done" right away', async () => {
    render(<TodoList darkMode={false} />);
    await openCalendar();
    fireEvent.change(screen.getByPlaceholderText('Add a task...'), { target: { value: 'Ship it' } });
    fireEvent.submit(screen.getByPlaceholderText('Add a task...').closest('form'));
    await settle();
    fireEvent.click(document.querySelector('ul > li').querySelectorAll('button')[0]);
    await settle();
    expect(dayInfo(20).tasks).toBe('1');
  });
});

describe('update', () => {
  test('undoing a completed to-do lowers "Tasks Done" again', async () => {
    render(<TodoList darkMode={false} />);
    await openCalendar();
    fireEvent.change(screen.getByPlaceholderText('Add a task...'), { target: { value: 'Oops' } });
    fireEvent.submit(screen.getByPlaceholderText('Add a task...').closest('form'));
    await settle();
    const toggleButton = () => document.querySelector('ul > li').querySelectorAll('button')[0];
    fireEvent.click(toggleButton());
    await settle();
    fireEvent.click(toggleButton());
    await settle();
    expect(dayInfo(20).tasks).toBe('0');
  });

  test('a second session on the same day adds to it', async () => {
    loadBackground();
    chrome.storage.local._seed({ sessions: { [today()]: 25, completedSessions: { [today()]: 1 } } });
    await openCalendar();
    // a session that ends one second from now
    chrome.storage.local._seed({ timer: { state: 'running', timeLeft: 1800, phase: 'study2', duration: 1800, endsAt: Date.now() + 1000 } });
    chrome._alarms.pomodoro = { name: 'pomodoro', scheduledTime: Date.now() + 1000 };
    await passTime(1, { inAct: true });
    expect(dayInfo(20)).toMatchObject({ study: '55 min', sessions: '2' });
  });
});

describe('delete', () => {
  test('removing study records clears the calendar (after reopening)', async () => {
    chrome.storage.local._seed({ sessions: { '2026-05-12': 75, completedSessions: { '2026-05-12': 3 } } });
    await openCalendar();
    await chrome.storage.local.remove('sessions');
    await reopen();
    expect(dayInfo(12)).toMatchObject({ study: '0 min', sessions: '0' });
  });

  test('removing completed tasks clears "Tasks Done" right away', async () => {
    chrome.storage.local._seed({ completedTasks: { '2026-05-12': [1, 2, 3] } });
    await openCalendar();
    chrome.storage.local.remove('completedTasks');
    await settle();
    expect(dayInfo(12).tasks).toBe('0');
  });

  test('removing one day only affects that day', async () => {
    chrome.storage.local._seed({
      sessions: { '2026-05-12': 75, '2026-05-13': 25, completedSessions: { '2026-05-12': 3, '2026-05-13': 1 } },
    });
    const { sessions } = local();
    delete sessions['2026-05-12'];
    delete sessions.completedSessions['2026-05-12'];
    chrome.storage.local.set({ sessions });
    await flush();
    await openCalendar();
    expect(dayInfo(12)).toMatchObject({ study: '0 min', sessions: '0' });
    expect(dayInfo(13)).toMatchObject({ study: '25 min', sessions: '1' });
  });

  test('broken completed-task data (not a date key, not a list) is ignored', async () => {
    chrome.storage.local._seed({ completedTasks: { 0: [5], 'not-a-date': [1], '2026-05-12': 'oops', '2026-05-13': [7] } });
    await openCalendar();
    expect(dayInfo(12).tasks).toBe('0');
    expect(dayInfo(13).tasks).toBe('1');
  });
});

describe('navigation and the date boxes', () => {
  test.each([
    ['monthInput', '1a', '1'],
    ['monthInput', '-3', '3'],
    ['yearInput', '20x26', '2026'],
    ['yearInput', '2.02', '202'],
  ])('%s accepts digits only: %p → %p', async (id, typed, kept) => {
    await openCalendar();
    const box = document.getElementById(id);
    box.value = typed;
    fireEvent.input(box);
    expect(box.value).toBe(kept);
  });

  test('Go jumps to the typed month and year', async () => {
    chrome.storage.local._seed({ sessions: { '2025-02-14': 40 } });
    await openCalendar();
    monthBox().value = '02';
    yearBox().value = '2025';
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    await settle();
    expect(header()).toBe('February 2025');
    expect(dayInfo(14).study).toBe('40 min');
  });

  test.each([
    ['13', '12'],
    ['0', '01'],
    ['', '01'],
  ])('month %p is corrected to %p when leaving the box', async (typed, corrected) => {
    await openCalendar();
    monthBox().value = typed;
    fireEvent.blur(monthBox());
    expect(monthBox().value).toBe(corrected);
  });

  test('an empty year goes back to the shown year when leaving the box', async () => {
    await openCalendar();
    yearBox().value = '';
    fireEvent.blur(yearBox());
    expect(yearBox().value).toBe('2026');
  });

  test('arrows move one month; the today button comes back', async () => {
    await openCalendar();
    fireEvent.click(screen.getByRole('button', { name: '→' }));
    await settle();
    expect(header()).toBe('June 2026');
    fireEvent.click(screen.getByRole('button', { name: '←' }));
    fireEvent.click(screen.getByRole('button', { name: '←' }));
    await settle();
    expect(header()).toBe('April 2026');
    fireEvent.click(screen.getByRole('button', { name: '◎' }));
    await settle();
    expect(header()).toBe('May 2026');
  });

  test('arrows cross the year boundary', async () => {
    setNow(new Date(2026, 11, 15));
    await openCalendar();
    fireEvent.click(screen.getByRole('button', { name: '→' }));
    await settle();
    expect(header()).toBe('January 2027');
  });

  test('→ on the 31st goes to the next month, not the one after', async () => {
    setNow(new Date(2026, 0, 31)); // 31 January
    await openCalendar();
    fireEvent.click(screen.getByRole('button', { name: '→' }));
    await settle();
    expect(header()).toBe('February 2026');
  });

  // The box shows its default value until the user types in it. Chrome redraws it when React
  // updates that default; the test DOM (jsdom) doesn't, so check the default itself.
  test('the month and year boxes follow the arrows', async () => {
    setNow(new Date(2026, 11, 15));
    await openCalendar();
    fireEvent.click(screen.getByRole('button', { name: '→' }));
    await settle();
    expect(monthBox().defaultValue).toBe('01');
    expect(yearBox().defaultValue).toBe('2027');
  });
});
