// An in-memory stand-in for the parts of the `chrome.*` extension API this project uses.
// It mirrors the real behaviour that matters for correctness:
//  - callbacks are asynchronous and run in the order the calls were made
//  - values are stored as JSON (NaN -> null, undefined keys dropped, objects copied)
//  - storage quotas are enforced (local: 10MB unless manifest has "unlimitedStorage";
//    sync: 8KB per item, 100KB total, 120 writes/minute, 1800 writes/hour) and failures
//    report chrome.runtime.lastError
//  - storage.onChanged only fires for values that actually changed
//  - runtime.sendMessage is not delivered back to the context that sent it
const fs = require('fs');
const { AsyncLocalStorage } = require('async_hooks');
const path = require('path');

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));

function createChrome() {
  // --- execution contexts (popup, background, content script...) ---
  // AsyncLocalStorage carries the context through callbacks, timers and promises, the way
  // separate extension processes would keep their own identity.
  const contexts = new AsyncLocalStorage();
  const runIn = (ctx, fn) => contexts.run(ctx, fn);
  const current = () => contexts.getStore() ?? 'popup';

  // --- async scheduling, FIFO ---
  let pending = 0;
  const defer = (fn) => {
    pending++;
    setTimeout(() => {
      pending--;
      fn();
    }, 0);
  };

  // Runs a callback later, in the context it was registered from, with lastError set if needed
  const later = (cb, args = [], lastError) => {
    if (typeof cb !== 'function') return;
    const ctx = current();
    defer(() =>
      runIn(ctx, () => {
        chrome.runtime.lastError = lastError ? { message: lastError } : undefined;
        try {
          cb(...args);
        } finally {
          chrome.runtime.lastError = undefined;
        }
      })
    );
  };

  const createEvent = () => {
    const listeners = [];
    return {
      addListener(fn) {
        listeners.push({ fn, ctx: current() });
      },
      removeListener(fn) {
        const i = listeners.findIndex((l) => l.fn === fn);
        if (i >= 0) listeners.splice(i, 1);
      },
      hasListener(fn) {
        return listeners.some((l) => l.fn === fn);
      },
      hasListeners() {
        return listeners.length > 0;
      },
      _listeners: listeners,
      _dispatch(...args) {
        return listeners.slice().map((l) => runIn(l.ctx, () => l.fn(...args)));
      },
    };
  };

  const json = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
  const bytesOf = (key, value) => key.length + JSON.stringify(value).length;

  // --- storage ---
  const storageOnChanged = createEvent();

  const createArea = (areaName, limits) => {
    let data = {};
    const onChanged = createEvent();
    const writeTimes = [];

    // Chrome counts every set/remove/clear against sync's write-rate limits
    const rateError = () => {
      if (!limits.perMinute) {
        writeTimes.push(Date.now());
        return null;
      }
      const now = Date.now();
      const inLast = (ms) => writeTimes.filter((t) => now - t < ms).length;
      if (inLast(60 * 1000) >= limits.perMinute) return 'MAX_WRITE_OPERATIONS_PER_MINUTE quota exceeded';
      if (inLast(60 * 60 * 1000) >= limits.perHour) return 'MAX_WRITE_OPERATIONS_PER_HOUR quota exceeded';
      writeTimes.push(now);
      return null;
    };

    const pick = (keys) => {
      if (keys === null || keys === undefined) return json(data);
      if (typeof keys === 'string') keys = [keys];
      if (Array.isArray(keys)) {
        const out = {};
        for (const k of keys) if (k in data) out[k] = json(data[k]);
        return out;
      }
      // object form: keys with default values
      const out = {};
      for (const [k, def] of Object.entries(keys)) out[k] = k in data ? json(data[k]) : json(def);
      return out;
    };

    const emitChanges = (before, after) => {
      const changes = {};
      for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
        const oldJson = key in before ? JSON.stringify(before[key]) : undefined;
        const newJson = key in after ? JSON.stringify(after[key]) : undefined;
        if (oldJson !== newJson) {
          changes[key] = {};
          if (key in before) changes[key].oldValue = json(before[key]);
          if (key in after) changes[key].newValue = json(after[key]);
        }
      }
      if (Object.keys(changes).length === 0) return;
      defer(() => {
        storageOnChanged._dispatch(json(changes), areaName);
        onChanged._dispatch(json(changes));
      });
    };

    // Per-item limit applies to the items being written; the total limit to everything
    const quotaError = (next, written) => {
      if (limits.perItem) {
        for (const [k, v] of Object.entries(written)) {
          if (bytesOf(k, v) > limits.perItem) return 'QUOTA_BYTES_PER_ITEM quota exceeded';
        }
      }
      if (limits.total) {
        const total = Object.entries(next).reduce((sum, [k, v]) => sum + bytesOf(k, v), 0);
        if (total > limits.total) return 'QUOTA_BYTES quota exceeded';
      }
      return null;
    };

    // Supports both callback and promise styles
    const op = (cb, run) => {
      if (typeof cb === 'function') {
        const { result, error } = run();
        later(cb, error ? [] : result === undefined ? [] : [result], error);
        return undefined;
      }
      return new Promise((resolve, reject) => {
        const { result, error } = run();
        defer(() => (error ? reject(new Error(error)) : resolve(result)));
      });
    };

    return {
      QUOTA_BYTES: limits.total,
      QUOTA_BYTES_PER_ITEM: limits.perItem,
      onChanged,
      get(keys, cb) {
        if (typeof keys === 'function') {
          cb = keys;
          keys = null;
        }
        return op(cb, () => ({ result: pick(keys) }));
      },
      set(items, cb) {
        return op(cb, () => {
          const clean = json(items) || {};
          const next = { ...data, ...clean };
          const error = quotaError(next, clean) || rateError();
          if (error) return { error };
          const before = data;
          data = next;
          emitChanges(before, data);
          return {};
        });
      },
      remove(keys, cb) {
        return op(cb, () => {
          const error = rateError();
          if (error) return { error };
          const list = typeof keys === 'string' ? [keys] : keys;
          const before = data;
          data = { ...data };
          for (const k of list) delete data[k];
          emitChanges(before, data);
          return {};
        });
      },
      clear(cb) {
        return op(cb, () => {
          const error = rateError();
          if (error) return { error };
          const before = data;
          data = {};
          emitChanges(before, data);
          return {};
        });
      },
      getBytesInUse(keys, cb) {
        if (typeof keys === 'function') {
          cb = keys;
          keys = null;
        }
        return op(cb, () => {
          const picked = keys === null || keys === undefined ? data : pick(keys);
          return { result: Object.entries(picked).reduce((s, [k, v]) => s + bytesOf(k, v), 0) };
        });
      },
      // Test helpers: synchronous access to what is really stored
      _dump: () => json(data),
      _writeCount: () => writeTimes.length,
      _seed: (items) => {
        data = { ...data, ...json(items) };
      },
    };
  };

  const hasUnlimitedStorage = (manifest.permissions || []).includes('unlimitedStorage');

  // --- runtime messaging ---
  const sent = [];
  const onMessage = createEvent();

  const sendMessage = (message, cb) => {
    const from = current();
    const msg = json(message);
    sent.push({ from, message: msg });

    const receivers = onMessage._listeners.filter((l) => l.ctx !== from);
    // The reply callback runs back in the sender's context
    const respond = (response, error) => {
      if (typeof cb === 'function') {
        runIn(from, () => later(cb, response === undefined ? [] : [response], error));
      }
    };

    if (receivers.length === 0) {
      respond(undefined, 'Could not establish connection. Receiving end does not exist.');
      return typeof cb === 'function' ? undefined : Promise.resolve(undefined);
    }

    let responded = false;
    let keepOpen = false;
    let resolvePromise;
    const promise = new Promise((r) => (resolvePromise = r));
    const sendResponse = (response) => {
      if (responded) return;
      responded = true;
      respond(response);
      resolvePromise(response);
    };

    defer(() => {
      for (const l of receivers) {
        const result = runIn(l.ctx, () => l.fn(json(msg), { id: 'test-extension-id' }, sendResponse));
        if (result === true) keepOpen = true;
      }
      if (!responded && !keepOpen) {
        responded = true;
        respond(undefined, 'The message port closed before a response was received.');
        resolvePromise(undefined);
      }
    });

    return typeof cb === 'function' ? undefined : promise;
  };

  // --- alarms ---
  const alarms = {};
  const onAlarm = createEvent();

  const chrome = {
    runtime: {
      id: 'test-extension-id',
      lastError: undefined,
      getURL: (p) => `chrome-extension://test-extension-id/${String(p).replace(/^\//, '')}`,
      getManifest: () => json(manifest),
      sendMessage,
      onMessage,
      onInstalled: createEvent(),
      onStartup: createEvent(),
    },
    storage: {
      onChanged: storageOnChanged,
      local: createArea('local', { total: hasUnlimitedStorage ? null : 10485760 }),
      sync: createArea('sync', { total: 102400, perItem: 8192, perMinute: 120, perHour: 1800 }),
    },
    alarms: {
      // Like Chrome: one alarm per name; `when` or `delayInMinutes` sets the first time.
      // Published extensions can't fire sooner than 30s out (set chrome._minAlarmDelayMs).
      create(name, info, cb) {
        if (typeof name === 'object') {
          cb = info;
          info = name;
          name = '';
        }
        const now = Date.now();
        let at = info.when ?? now + (info.delayInMinutes ?? info.periodInMinutes ?? 0) * 60000;
        at = Math.max(at, now + chrome._minAlarmDelayMs);
        alarms[name] = { name, scheduledTime: at, ...(info.periodInMinutes ? { periodInMinutes: info.periodInMinutes } : {}) };
        later(cb);
      },
      clear(name, cb) {
        const existed = name in alarms;
        delete alarms[name];
        later(cb, [existed]);
      },
      get(name, cb) {
        later(cb, [json(alarms[name])]);
      },
      getAll(cb) {
        later(cb, [json(Object.values(alarms))]);
      },
      onAlarm,
    },
    tabs: {
      query(q, cb) {
        later(cb, [[]]);
      },
      sendMessage(tabId, message, cb) {
        later(cb, [], 'Could not establish connection. Receiving end does not exist.');
      },
    },
    notifications: {
      create: jest.fn(),
    },
    offscreen: {
      _open: false,
      async hasDocument() {
        return chrome.offscreen._open;
      },
      async createDocument() {
        chrome.offscreen._open = true;
      },
    },

    // --- test helpers ---
    _sent: sent,
    _sentOfType: (type) => sent.filter((s) => s.message && s.message.type === type),
    _alarms: alarms,
    _minAlarmDelayMs: 0, // 0 = unpacked extension; 30000 = published
    // Fires an alarm now, whether or not it is due (one-shot alarms are removed first)
    _fireAlarm(name) {
      if (!(name in alarms)) return false;
      const alarm = { ...alarms[name] };
      if (alarm.periodInMinutes) alarms[name].scheduledTime += alarm.periodInMinutes * 60000;
      else delete alarms[name];
      onAlarm._dispatch(alarm);
      return true;
    },
    // Fires every alarm whose time has come (call after moving the clock)
    _runDueAlarms() {
      let fired = 0;
      for (const name of Object.keys(alarms)) {
        if (alarms[name] && alarms[name].scheduledTime <= Date.now()) {
          chrome._fireAlarm(name);
          fired++;
        }
      }
      return fired;
    },
    _runIn: runIn,
    _pending: () => pending,
    _hasUnlimitedStorage: hasUnlimitedStorage,
  };

  return chrome;
}

module.exports = { createChrome, manifest };
