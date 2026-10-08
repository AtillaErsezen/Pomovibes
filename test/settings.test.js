// Settings: duration fields, background sound options, and the custom bell upload.
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import Settings from '../src/components/Settings';
const { settle, flush, makeFile, MB, read } = require('./helpers');

const SAVED = { study: 25, shortBreak: 5, longBreak: 15, cycles: 4 };

let props;
let container;
const renderSettings = async (saved = SAVED) => {
  chrome.storage.sync._seed({ settings: saved });
  props = { settings: saved, updateSettings: jest.fn(), onClose: jest.fn(), darkMode: false };
  ({ container } = render(<Settings {...props} />));
  await settle();
};

const sync = () => chrome.storage.sync._dump();
const local = () => chrome.storage.local._dump();
const field = (name) => container.querySelector(`input[name="${name}"]`);
const fileInput = () => container.querySelector('input[type="file"]');
const type = (name, value) => fireEvent.change(field(name), { target: { value } });
const save = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  await settle();
};

// Picks a file and waits for FileReader + storage to finish after pressing Upload
const chooseFile = (file) => fireEvent.change(fileInput(), { target: { files: [file] } });
const upload = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
  // FileReader is truly async in jsdom; wait until the upload has been stored (or give up)
  for (let i = 0; i < 200 && !local().customBellSound; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
      await flush();
    });
  }
};

describe('duration fields', () => {
  test.each([
    ['2a5', '25'],
    ['-5', '5'],
    ['1e3', '13'],
    ['2.5', '25'],
    [' 30 ', '30'],
    ['abc', ''],
    ['+12', '12'],
  ])('typing %p keeps only the digits: %p', async (typed, kept) => {
    await renderSettings();
    type('study', typed);
    expect(field('study').value).toBe(kept);
  });

  test('all three fields are digit-only text fields with a numeric keypad', async () => {
    await renderSettings();
    for (const name of ['study', 'shortBreak', 'longBreak']) {
      expect(field(name)).toHaveAttribute('type', 'text');
      expect(field(name)).toHaveAttribute('inputMode', 'numeric');
    }
  });

  test('a field can be cleared while typing', async () => {
    await renderSettings();
    type('study', '');
    expect(field('study').value).toBe('');
  });

  test.each(['', '0', '000'])('leaving the field as %p goes back to the saved value', async (value) => {
    await renderSettings({ ...SAVED, study: 40 });
    type('study', value);
    fireEvent.blur(field('study'));
    expect(field('study').value).toBe('40');
  });

  test('saving with an empty field stores the last saved value, never null', async () => {
    await renderSettings({ ...SAVED, shortBreak: 7 });
    type('shortBreak', '');
    await save();
    expect(sync().settings.shortBreak).toBe(7);
    expect(props.updateSettings).toHaveBeenCalledWith(expect.objectContaining({ shortBreak: 7 }));
  });

  test('with no valid saved value, an empty field falls back to the default', async () => {
    await renderSettings({ study: null, shortBreak: 0, longBreak: undefined, cycles: 4 });
    type('study', '');
    type('shortBreak', '');
    type('longBreak', '');
    await save();
    expect(sync().settings).toMatchObject({ study: 25, shortBreak: 5, longBreak: 15 });
  });

  test('valid values are saved as numbers and the modal closes', async () => {
    await renderSettings();
    type('study', '50');
    type('shortBreak', '010');
    type('longBreak', '999');
    await save();
    expect(sync().settings).toEqual({ study: 50, shortBreak: 10, longBreak: 999, cycles: 4 });
    expect(props.updateSettings).toHaveBeenCalledWith({ study: 50, shortBreak: 10, longBreak: 999, cycles: 4 });
    expect(props.onClose).toHaveBeenCalled();
  });

  test('closing with the X does not save duration changes', async () => {
    await renderSettings();
    type('study', '90');
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    await settle();
    expect(sync().settings.study).toBe(25);
    expect(props.onClose).toHaveBeenCalled();
  });

  test('edit → clear → retype → save keeps the last typed value', async () => {
    await renderSettings();
    type('study', '45');
    type('study', '');
    fireEvent.blur(field('study'));
    type('study', '35');
    await save();
    expect(sync().settings.study).toBe(35);
  });

  test('reopening Settings shows what was saved', async () => {
    await renderSettings();
    type('study', '33');
    await save();
    const saved = sync().settings;
    render(<Settings settings={saved} updateSettings={jest.fn()} onClose={jest.fn()} darkMode={false} />);
    await settle();
    expect(screen.getAllByDisplayValue('33').length).toBeGreaterThan(0);
  });
});

describe('background sound options', () => {
  test('only brown and white noise are offered', async () => {
    await renderSettings();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.queryByText(/Background Music/)).not.toBeInTheDocument();
  });

  test('brown noise is selected by default', async () => {
    await renderSettings();
    expect(screen.getByLabelText(/Brown Noise/)).toBeChecked();
  });

  test('choosing a sound saves it immediately (no Save needed)', async () => {
    await renderSettings();
    fireEvent.click(screen.getByLabelText(/White Noise/));
    await settle();
    expect(sync().backgroundSoundType).toBe('whiteNoise');
    fireEvent.click(screen.getByLabelText(/Brown Noise/));
    await settle();
    expect(sync().backgroundSoundType).toBe('brownNoise');
  });

  test('an old saved "music" choice shows brown noise selected', async () => {
    chrome.storage.sync._seed({ backgroundSoundType: 'music' });
    await renderSettings();
    expect(screen.getByLabelText(/Brown Noise/)).toBeChecked();
  });

  test('the saved white noise choice is shown when reopened', async () => {
    chrome.storage.sync._seed({ backgroundSoundType: 'whiteNoise' });
    await renderSettings();
    expect(screen.getByLabelText(/White Noise/)).toBeChecked();
  });

  test('volume changes are saved immediately', async () => {
    await renderSettings();
    fireEvent.change(container.querySelector('input[type="range"]'), { target: { value: '70' } });
    await settle();
    expect(sync().backgroundMusicVolume).toBe(0.7);
    expect(screen.getByText('70%')).toBeInTheDocument();
  });
});

describe('custom bell upload', () => {
  test('shows the 10MB limit', async () => {
    await renderSettings();
    expect(screen.getByText('Maximum file size: 10MB.')).toBeInTheDocument();
  });

  test('Upload is disabled until a file is chosen', async () => {
    await renderSettings();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled();
  });

  test('a small mp3 is stored in local storage as a data URL with the exact bytes', async () => {
    await renderSettings();
    const bytes = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0xff]);
    chooseFile(new File([bytes], 'ding.mp3', { type: 'audio/mpeg' }));
    expect(screen.getByText('ding.mp3')).toBeInTheDocument();
    await upload();
    const stored = local().customBellSound;
    expect(stored).toMatch(/^data:audio\/mpeg;base64,/);
    expect(Buffer.from(stored.split(',')[1], 'base64')).toEqual(Buffer.from(bytes));
    // the chooser resets after a successful upload
    expect(screen.getByText('Choose Audio File')).toBeInTheDocument();
  });

  test('the bell is stored in local storage, not sync (which is too small)', async () => {
    await renderSettings();
    chooseFile(makeFile(1000));
    await upload();
    expect(local().customBellSound).toBeDefined();
    expect(sync().customBellSound).toBeUndefined();
  });

  test('exactly 10MB is accepted and stored', async () => {
    await renderSettings();
    chooseFile(makeFile(10 * MB, 'big.mp3'));
    expect(window.alert).not.toHaveBeenCalled();
    await upload();
    // base64 makes it about a third bigger than the file
    expect(local().customBellSound.length).toBeGreaterThan(13 * MB);
  });

  test('a 10MB file only fits because the manifest asks for unlimitedStorage', () => {
    const manifest = JSON.parse(read('manifest.json'));
    expect(manifest.permissions).toContain('unlimitedStorage');
  });

  test('one byte over 10MB is rejected with the warning and nothing is stored', async () => {
    await renderSettings();
    chooseFile(makeFile(10 * MB + 1, 'huge.mp3'));
    expect(window.alert).toHaveBeenCalledWith(expect.stringMatching(/bigger than 10MB/));
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled();
    expect(screen.getByText('Choose Audio File')).toBeInTheDocument();
    expect(local().customBellSound).toBeUndefined();
  });

  test('a huge non-audio file gets the size warning (size is checked first)', async () => {
    await renderSettings();
    chooseFile(makeFile(20 * MB, 'movie.mkv', 'video/x-matroska'));
    expect(window.alert).toHaveBeenCalledTimes(1);
    expect(window.alert).toHaveBeenCalledWith(expect.stringMatching(/bigger than 10MB/));
  });

  test.each([
    ['notes.txt', 'text/plain'],
    ['photo.png', 'image/png'],
    ['clip.mp4', 'video/mp4'],
  ])('%s is rejected as not audio', async (name, mime) => {
    await renderSettings();
    chooseFile(makeFile(100, name, mime));
    expect(window.alert).toHaveBeenCalledWith('Please select a valid audio file.');
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled();
  });

  test.each([
    ['bell.wav', 'audio/wav'],
    ['bell.ogg', 'audio/ogg'],
    ['bell.m4a', 'audio/mp4'],
  ])('%s is accepted as audio', async (name, mime) => {
    await renderSettings();
    chooseFile(makeFile(100, name, mime));
    expect(window.alert).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled();
  });

  test('an .mp3 the browser reports with no MIME type is rejected (only the MIME type is checked)', async () => {
    await renderSettings();
    chooseFile(makeFile(100, 'bell.mp3', ''));
    expect(window.alert).toHaveBeenCalledWith('Please select a valid audio file.');
  });

  test('a file named .txt but reported as audio is accepted (only the MIME type is checked)', async () => {
    await renderSettings();
    chooseFile(makeFile(100, 'bell.txt', 'audio/mpeg'));
    expect(window.alert).not.toHaveBeenCalled();
  });

  test('an empty (0 byte) mp3 is accepted and stored', async () => {
    await renderSettings();
    chooseFile(makeFile(0, 'empty.mp3'));
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
    for (let i = 0; i < 50 && local().customBellSound === undefined; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 5));
        await flush();
      });
    }
    expect(local().customBellSound).toBe('data:audio/mpeg;base64,');
  });

  test('uploading a second file replaces the first', async () => {
    await renderSettings();
    chooseFile(new File([new Uint8Array([1])], 'one.mp3', { type: 'audio/mpeg' }));
    await upload();
    const first = local().customBellSound;
    chooseFile(new File([new Uint8Array([2, 2])], 'two.mp3', { type: 'audio/mpeg' }));
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
    for (let i = 0; i < 100 && local().customBellSound === first; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 5));
        await flush();
      });
    }
    expect(Buffer.from(local().customBellSound.split(',')[1], 'base64')).toEqual(Buffer.from([2, 2]));
  });

  test('choosing a too-big file after a valid one keeps the valid one selected', async () => {
    await renderSettings();
    chooseFile(makeFile(100, 'good.mp3'));
    chooseFile(makeFile(11 * MB, 'bad.mp3'));
    expect(window.alert).toHaveBeenCalledWith(expect.stringMatching(/bigger than 10MB/));
    expect(screen.getByText('good.mp3')).toBeInTheDocument();
    await upload();
    expect(local().customBellSound.length).toBeLessThan(1000);
  });

  test('a file chosen but never uploaded is not stored', async () => {
    await renderSettings();
    chooseFile(makeFile(100));
    await save();
    expect(local().customBellSound).toBeUndefined();
  });
});
