// Sanity checks that the fake chrome API behaves like the real one on the points
// the other tests rely on.
const { flush, MB } = require('./helpers');
const { manifest } = require('./chromeMock');

describe('fake chrome.storage', () => {
  test('set then get round-trips values through JSON', async () => {
    let result;
    chrome.storage.sync.set({ a: { n: NaN, keep: 1, drop: undefined }, list: [1, 2] });
    chrome.storage.sync.get(['a', 'list', 'missing'], (r) => (result = r));
    await flush();
    expect(result).toEqual({ a: { n: null, keep: 1 }, list: [1, 2] });
  });

  test('get with defaults object fills in missing keys', async () => {
    let result;
    chrome.storage.sync.set({ a: 1 });
    chrome.storage.sync.get({ a: 0, b: 'default' }, (r) => (result = r));
    await flush();
    expect(result).toEqual({ a: 1, b: 'default' });
  });

  test('callbacks are asynchronous and keep call order', async () => {
    const order = [];
    chrome.storage.sync.get('x', () => order.push('get-before-set'));
    chrome.storage.sync.set({ x: 1 }, () => order.push('set'));
    chrome.storage.sync.get('x', (r) => order.push(`get-after-set:${r.x}`));
    expect(order).toEqual([]);
    await flush();
    expect(order).toEqual(['get-before-set', 'set', 'get-after-set:1']);
  });

  test('a get issued before a set sees the old value', async () => {
    chrome.storage.sync.set({ x: 'old' });
    let seen;
    chrome.storage.sync.get('x', (r) => (seen = r.x));
    chrome.storage.sync.set({ x: 'new' });
    await flush();
    expect(seen).toBe('old');
  });

  test('remove and clear delete keys', async () => {
    chrome.storage.sync.set({ a: 1, b: 2, c: 3 });
    chrome.storage.sync.remove('a');
    chrome.storage.sync.remove(['b']);
    await flush();
    expect(chrome.storage.sync._dump()).toEqual({ c: 3 });
    chrome.storage.sync.clear();
    await flush();
    expect(chrome.storage.sync._dump()).toEqual({});
  });

  test('onChanged fires only for values that really changed', async () => {
    const events = [];
    chrome.storage.onChanged.addListener((changes, area) => events.push({ changes, area }));
    chrome.storage.sync.set({ a: 1, b: 2 });
    chrome.storage.sync.set({ a: 1, b: 3 });
    await flush();
    expect(events).toEqual([
      { area: 'sync', changes: { a: { newValue: 1 }, b: { newValue: 2 } } },
      { area: 'sync', changes: { b: { oldValue: 2, newValue: 3 } } },
    ]);
  });

  test('sync rejects an item over 8KB and keeps the old value', async () => {
    chrome.storage.sync.set({ big: 'ok' });
    let error;
    chrome.storage.sync.set({ big: 'x'.repeat(9000) }, () => (error = chrome.runtime.lastError));
    await flush();
    expect(error.message).toMatch(/QUOTA_BYTES_PER_ITEM/);
    expect(chrome.storage.sync._dump().big).toBe('ok');
  });

  test('sync allows 120 writes a minute, then fails', async () => {
    const errors = [];
    for (let i = 0; i < 121; i++) {
      chrome.storage.sync.set({ n: i }, () => errors.push(chrome.runtime.lastError?.message));
    }
    await flush();
    expect(errors.filter(Boolean)).toEqual(['MAX_WRITE_OPERATIONS_PER_MINUTE quota exceeded']);
    expect(chrome.storage.sync._dump().n).toBe(119);
  });

  test('local has no write-rate limit', async () => {
    let error;
    for (let i = 0; i < 500; i++) chrome.storage.local.set({ n: i }, () => (error = error || chrome.runtime.lastError));
    await flush();
    expect(error).toBeUndefined();
    expect(chrome.storage.local._dump().n).toBe(499);
  });

  test('local storage limit follows the manifest (unlimitedStorage)', async () => {
    expect(chrome._hasUnlimitedStorage).toBe(manifest.permissions.includes('unlimitedStorage'));
    let error = 'not called';
    chrome.storage.local.set({ blob: 'x'.repeat(11 * MB) }, () => (error = chrome.runtime.lastError));
    await flush();
    if (chrome._hasUnlimitedStorage) {
      expect(error).toBeUndefined();
    } else {
      expect(error.message).toMatch(/QUOTA_BYTES/);
    }
  });

  test('promise style works too', async () => {
    await chrome.storage.local.set({ p: 1 });
    await expect(chrome.storage.local.get('p')).resolves.toEqual({ p: 1 });
  });
});

describe('fake chrome.runtime messaging', () => {
  test('a message is not delivered back to the context that sent it', async () => {
    const popupGot = [];
    const backgroundGot = [];
    chrome.runtime.onMessage.addListener((m) => popupGot.push(m.type));
    chrome._runIn('background', () => chrome.runtime.onMessage.addListener((m) => backgroundGot.push(m.type)));

    chrome.runtime.sendMessage({ type: 'FROM_POPUP' });
    chrome._runIn('background', () => chrome.runtime.sendMessage({ type: 'FROM_BACKGROUND' }));
    await flush();

    expect(popupGot).toEqual(['FROM_BACKGROUND']);
    expect(backgroundGot).toEqual(['FROM_POPUP']);
  });

  test('sending with nobody listening sets lastError', async () => {
    let error;
    chrome.runtime.sendMessage({ type: 'X' }, () => (error = chrome.runtime.lastError));
    await flush();
    expect(error.message).toMatch(/Receiving end does not exist/);
  });
});
