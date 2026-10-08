// Popup-level settings stored in chrome.storage: the floating timer and
// background sound toggles, their confirmation dialog, and dark mode.
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import App from '../src/App';
const { settle } = require('./helpers');

const sync = () => chrome.storage.sync._dump();

let utils;
const openPopup = async () => {
  utils = render(<App />);
  await settle();
};
const reopen = async () => {
  utils.unmount();
  await openPopup();
};

const floatingToggle = () => screen.getAllByRole('checkbox')[0];
const soundToggle = () => screen.getAllByRole('checkbox')[1];
const flip = async (box) => {
  fireEvent.click(box);
  await settle();
};
const dialog = () => screen.queryByRole('dialog');

describe('floating timer toggle', () => {
  test('is on by default on a fresh install', async () => {
    await openPopup();
    expect(floatingToggle()).toBeChecked();
  });

  test('turning it off is saved and survives reopening', async () => {
    await openPopup();
    await flip(floatingToggle());
    expect(sync().floatingTimerEnabled).toBe(false);
    await reopen();
    expect(floatingToggle()).not.toBeChecked();
  });

  test('turning it on is saved and shows the confirmation dialog', async () => {
    chrome.storage.sync._seed({ floatingTimerEnabled: false });
    await openPopup();
    await flip(floatingToggle());
    expect(sync().floatingTimerEnabled).toBe(true);
    expect(within(dialog()).getByText('Floating timer has been enabled')).toBeInTheDocument();
    expect(chrome.notifications.create).not.toHaveBeenCalled();
  });

  test('turning it off shows no dialog', async () => {
    await openPopup();
    await flip(floatingToggle());
    expect(dialog()).toBeNull();
  });

  test('closing it from a web page switches the toggle off live', async () => {
    await openPopup();
    chrome._runIn('content', () => chrome.storage.sync.set({ floatingTimerEnabled: false }));
    await settle();
    expect(floatingToggle()).not.toBeChecked();
  });

  test('flipping it five times from on ends off', async () => {
    await openPopup();
    for (let i = 0; i < 5; i++) {
      await flip(floatingToggle());
      const ok = screen.queryByRole('button', { name: 'OK' });
      if (ok) fireEvent.click(ok);
    }
    await settle();
    expect(sync().floatingTimerEnabled).toBe(false);
    expect(floatingToggle()).not.toBeChecked();
  });

  test('shows the refresh hint', async () => {
    await openPopup();
    expect(screen.getByText("If the timer isn't appearing, try refreshing the page.")).toBeInTheDocument();
  });
});

describe('background sound toggle', () => {
  test('is off by default', async () => {
    await openPopup();
    expect(soundToggle()).not.toBeChecked();
  });

  test('turning it on is saved, tells the audio page, and shows the dialog', async () => {
    await openPopup();
    await flip(soundToggle());
    expect(sync().backgroundMusicEnabled).toBe(true);
    expect(chrome._sentOfType('BACKGROUND_MUSIC_TOGGLE').at(-1).message).toEqual({
      type: 'BACKGROUND_MUSIC_TOGGLE',
      enabled: true,
    });
    expect(within(dialog()).getByText(/Background sound will play during study sessions/)).toBeInTheDocument();
  });

  test('its state survives reopening', async () => {
    await openPopup();
    await flip(soundToggle());
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    await reopen();
    expect(soundToggle()).toBeChecked();
    await flip(soundToggle());
    await reopen();
    expect(soundToggle()).not.toBeChecked();
  });

  test('shows the toggle hint', async () => {
    await openPopup();
    expect(screen.getByText("If the sound isn't playing, try toggling it off and on again.")).toBeInTheDocument();
  });
});

describe('confirmation dialog', () => {
  const openDialog = async () => {
    chrome.storage.sync._seed({ floatingTimerEnabled: false });
    await openPopup();
    await flip(floatingToggle());
    expect(dialog()).not.toBeNull();
  };

  test('has exactly two buttons: OK and the close button', async () => {
    await openDialog();
    expect(within(dialog()).getAllByRole('button').map((b) => b.getAttribute('aria-label') || b.textContent)).toEqual([
      'Close',
      'OK',
    ]);
  });

  test('OK closes it', async () => {
    await openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    await settle();
    expect(dialog()).toBeNull();
  });

  test('the close button closes it', async () => {
    await openDialog();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Close' }));
    await settle();
    expect(dialog()).toBeNull();
  });

  test('clicking the dimmed background closes it', async () => {
    await openDialog();
    fireEvent.click(dialog().previousSibling);
    await settle();
    expect(dialog()).toBeNull();
  });

  test('closing the dialog does not undo the setting', async () => {
    await openDialog();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Close' }));
    await settle();
    expect(sync().floatingTimerEnabled).toBe(true);
    expect(floatingToggle()).toBeChecked();
  });

  test('enabling both toggles one after the other shows the latest message', async () => {
    chrome.storage.sync._seed({ floatingTimerEnabled: false });
    await openPopup();
    await flip(floatingToggle());
    await flip(soundToggle());
    expect(within(dialog()).getByText(/Background sound will play/)).toBeInTheDocument();
  });
});

describe('dark mode', () => {
  test('switching is saved and survives reopening', async () => {
    await openPopup();
    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }));
    await settle();
    expect(sync().darkMode).toBe(true);
    await reopen();
    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeInTheDocument();
  });
});
