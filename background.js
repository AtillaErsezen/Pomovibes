// Utility: Ensure offscreen document exists.
async function ensureOffscreen() {
  const isDocumentPresent = await chrome.offscreen.hasDocument();
  if (!isDocumentPresent) {
    await chrome.offscreen.createDocument({
      url: 'src/offscreen.html',
      reasons: ['DOM_PARSER', 'AUDIO_PLAYBACK'], // reasons for needing a DOM including audio
      justification: 'To play bell sound and background sounds for Pomodoro timer.'
    });
    console.log('Offscreen document created');
  }
}

const DEFAULT_STUDY_MINUTES = 25;

// Data that grows or changes every second lives in chrome.storage.local (no size limit with
// the unlimitedStorage permission, no write-rate limit). Small preferences stay in
// chrome.storage.sync so they follow the user across devices.
const LOCAL_KEYS = ['timer', 'lastPhase', 'tasks', 'customCategories', 'lastUsedCategory', 'completedTasks', 'sessions'];

// Reads the timer (local) and settings (sync) together
function getTimerAndSettings(callback) {
  chrome.storage.local.get(['timer'], (localData) => {
    chrome.storage.sync.get(['settings'], (syncData) => {
      callback({ ...localData, ...syncData });
    });
  });
}

// YYYY-MM-DD in the user's local time zone (toISOString() would use UTC)
function toLocalDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Records a finished study session in the calendar: adds its length (the duration it
// started with) to today's minutes and counts one completed session. Called once,
// only when a study phase counts down to zero.
function recordCompletedStudySession(durationSeconds) {
  const date = toLocalDateKey();
  const minutesStudied = durationSeconds / 60;

  chrome.storage.local.get(['sessions'], (data) => {
    const sessions = data.sessions || {};
    const completedSessions = sessions.completedSessions || {};

    const updated = {
      ...sessions,
      [date]: (sessions[date] || 0) + minutesStudied,
      completedSessions: {
        ...completedSessions,
        [date]: (completedSessions[date] || 0) + 1
      }
    };

    chrome.storage.local.set({ sessions: updated }, () => {
      console.log(`Updated calendar: ${minutesStudied} minutes studied on ${date}`);
      // Send message to update calendar UI
      chrome.runtime.sendMessage({ 
        type: 'CALENDAR_UPDATE', 
        sessions: updated,
        date: date
      });
      
      // Also notify all tabs about the update
      chrome.tabs.query({}, (tabs) => {
        for (const tab of tabs) {
          chrome.tabs.sendMessage(tab.id, { 
            type: 'CALENDAR_UPDATE', 
            sessions: updated,
            date: date
          }, () => {
            if (chrome.runtime.lastError) {
              // Ignore errors for tabs that don't have the content script
            }
          });
        }
      });
    });
  });
}

// One-time migration: older versions kept everything in chrome.storage.sync. Copy those
// keys into chrome.storage.local (unless local already has them), then remove them from sync.
function migrateSyncToLocal(done) {
  chrome.storage.sync.get(LOCAL_KEYS, (syncData) => {
    const keys = Object.keys(syncData);
    if (keys.length === 0) return done();
    chrome.storage.local.get(keys, (localData) => {
      const toCopy = {};
      for (const key of keys) {
        if (!(key in localData)) toCopy[key] = syncData[key];
      }
      chrome.storage.local.set(toCopy, () => {
        if (chrome.runtime.lastError) {
          // Keep the sync copy so nothing is lost; the next update will try again
          console.error('Moving data to local storage failed:', chrome.runtime.lastError.message);
          return done();
        }
        chrome.storage.sync.remove(keys, () => done());
      });
    });
  });
}

// One-time migration: days recorded before completed sessions were stored get their
// count calculated once from the current study duration, then never recalculated.
function migrateCompletedSessions() {
  chrome.storage.local.get(['sessions'], (localData) => chrome.storage.sync.get(['settings'], (syncData) => {
    const data = { ...localData, ...syncData };
    const sessions = data.sessions || {};
    const study = data.settings?.study >= 1 ? data.settings.study : 25;
    const completedSessions = { ...(sessions.completedSessions || {}) };
    // The old per-record dedup list is no longer used and only grows
    let changed = 'recordedPhases' in sessions;

    for (const key of Object.keys(sessions)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(key) && completedSessions[key] === undefined) {
        completedSessions[key] = Math.floor(sessions[key] / study);
        changed = true;
      }
    }

    if (changed) {
      const { recordedPhases, ...rest } = sessions;
      chrome.storage.local.set({ sessions: { ...rest, completedSessions } });
    }
  }));
}

// --- Timer engine ---
// A running timer stores when its phase ends (endsAt, in ms). Nothing ticks: the popup and
// the floating timer work out the remaining time themselves, and a single alarm fires when
// the phase ends. (Published extensions can't have alarms more often than every 30 seconds.)
const PHASE_ALARM = 'pomodoro';
// An alarm can fire a moment before endsAt; treat that as on time
const END_TOLERANCE_MS = 500;

// Seconds left: running timers count down to endsAt, stopped ones keep timeLeft
function remainingSeconds(timer, now = Date.now()) {
  if (timer.state === 'running' && typeof timer.endsAt === 'number') {
    return Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
  }
  return timer.timeLeft;
}

function durationsFrom(settings) {
  const valid = (value, fallback) => (value >= 1 ? value : fallback);
  return {
    study: valid(settings?.study, DEFAULT_STUDY_MINUTES),
    shortBreak: valid(settings?.shortBreak, 5),
    longBreak: valid(settings?.longBreak, 15),
  };
}

function nextPhaseFor(phase, settings) {
  const { study, shortBreak, longBreak } = durationsFrom(settings);
  const phases = {
    study1:      ['shortBreak1', shortBreak * 60],
    shortBreak1: ['study2',      study * 60],
    study2:      ['shortBreak2', shortBreak * 60],
    shortBreak2: ['study3',      study * 60],
    study3:      ['shortBreak3', shortBreak * 60],
    shortBreak3: ['study4',      study * 60],
    study4:      ['longBreak',   longBreak * 60],
    longBreak:   ['study1',      study * 60],
  };
  return phases[phase] || ['study1', study * 60];
}

// Saves the timer, schedules (or clears) the end-of-phase alarm, and tells the popup
function saveTimer(timer, done) {
  chrome.storage.local.set({ timer }, () => {
    chrome.alarms.clear(PHASE_ALARM, () => {
      const finish = () => {
        chrome.runtime.sendMessage({ type: 'TIMER_UPDATE', timer });
        if (done) done();
      };
      if (timer.state === 'running') {
        chrome.alarms.create(PHASE_ALARM, { when: timer.endsAt }, finish);
      } else {
        finish();
      }
    });
  });
}

function playBell() {
  chrome.storage.local.get(['customBellSound'], async (result) => {
    const audioSource = result.customBellSound || chrome.runtime.getURL('assets/bell_sound.mp3');
    // Ensure the offscreen document exists first.
    await ensureOffscreen();
    chrome.runtime.sendMessage({ type: 'PLAY_BELL', audioSource });
  });
}

// Every change to the timer (start, stop, reset, end of phase) runs through this queue,
// one at a time, so e.g. a Stop can't slip in between "the phase is due" and its write.
// Each task calls done() when it has finished writing.
let timerQueue = Promise.resolve();
function queueTimerTask(task) {
  timerQueue = timerQueue.then(() => new Promise((done) => task(done))).catch((error) => {
    console.error('Timer task failed:', error);
  });
}

// Ends the phase if it is due: records a finished study session, rings the bell once,
// and starts the next phase. The alarm and the popup's 0:00 check can both call this;
// the second call finds the next phase already running and does nothing.
function finishPhaseIfDue() {
  queueTimerTask((done) => {
    getTimerAndSettings((data) => {
      const timer = data.timer;
      if (!timer || timer.state !== 'running') return done();

      // A running timer saved by an older version has no end time: give it one
      if (typeof timer.endsAt !== 'number') {
        return saveTimer({ ...timer, endsAt: Date.now() + timer.timeLeft * 1000 }, done);
      }

      // Not due yet (e.g. an early check): make sure the alarm is set for the real end
      if (timer.endsAt - Date.now() > END_TOLERANCE_MS) {
        return chrome.alarms.create(PHASE_ALARM, { when: timer.endsAt }, done);
      }

      // Record the finished study session with the length it started with,
      // not the current setting (which may have changed mid-session)
      if (timer.phase.startsWith('study')) {
        recordCompletedStudySession(timer.duration ?? DEFAULT_STUDY_MINUTES * 60);
      }
      console.log('Session ended, playing bell sound');
      playBell();

      const [nextPhase, nextTime] = nextPhaseFor(timer.phase, data.settings);
      console.log('Transitioned to next phase:', nextPhase);
      saveTimer(
        {
          state: 'running',
          phase: nextPhase,
          timeLeft: nextTime,
          duration: nextTime,
          endsAt: Date.now() + nextTime * 1000,
        },
        done
      );
    });
  });
}

// Makes sure the alarm matches the saved timer (after an update or a browser restart).
// A phase that ended while the browser was closed finishes right away.
function ensureTimerScheduled() {
  queueTimerTask((done) => {
    chrome.storage.local.get(['timer'], ({ timer }) => {
      if (timer && timer.state === 'running') {
        saveTimer(typeof timer.endsAt === 'number' ? timer : { ...timer, endsAt: Date.now() + timer.timeLeft * 1000 }, done);
      } else {
        chrome.alarms.clear(PHASE_ALARM, () => done());
      }
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  migrateSyncToLocal(() => {
    migrateCompletedSessions();
    ensureTimerScheduled();
  });
});

chrome.runtime.onStartup.addListener(ensureTimerScheduled);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === PHASE_ALARM) {
    finishPhaseIfDue();
  } else {
    console.log('Unknown alarm:', alarm.name);
  }
});

// Ensure offscreen document exists specifically for audio playback
async function ensureOffscreenForAudio() {
  const isDocumentPresent = await chrome.offscreen.hasDocument();
  if (!isDocumentPresent) {
    await chrome.offscreen.createDocument({
      url: 'src/offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'To play background sounds for Pomodoro timer.'
    });
    console.log('Offscreen document created for audio playback');
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle background audio control messages
  if (message.type === 'BACKGROUND_AUDIO_CONTROL') {
    // Ensure we have an offscreen document for audio
    ensureOffscreenForAudio().then(() => {
      // Forward the message to the offscreen document
      chrome.runtime.sendMessage(message, (response) => {
        if (response) {
          sendResponse(response);
        }
      });
    }).catch(error => {
      console.error('Error creating offscreen document for audio:', error);
      sendResponse({ success: false, error: error.message });
    });
    
    return true; // Keep message channel open for async response
  }
  
  if (message.type === 'START_TIMER') {
    queueTimerTask((done) => {
      const finish = () => {
        sendResponse({ success: true });
        done();
      };
      getTimerAndSettings((data) => {
        const { study } = durationsFrom(data.settings);
        const timer = data.timer || { state: 'stopped', timeLeft: study * 60, phase: 'study1' };
        if (timer.state === 'running' && typeof timer.endsAt === 'number') return finish(); // already running
        saveTimer(
          {
            ...timer,
            state: 'running',
            // Remember the length this session started with (kept through pause/resume)
            duration: timer.duration ?? timer.timeLeft,
            endsAt: Date.now() + timer.timeLeft * 1000,
          },
          finish
        );
      });
    });
    return true;
  } else if (message.type === 'STOP_TIMER') {
    // Freeze the time from when Stop was pressed, not from when the queue gets to it
    const stoppedAt = Date.now();
    queueTimerTask((done) => {
      const finish = () => {
        sendResponse({ success: true });
        done();
      };
      chrome.storage.local.get(['timer'], ({ timer }) => {
        if (!timer || timer.state !== 'running') return chrome.alarms.clear(PHASE_ALARM, finish);
        // Freeze the remaining time; endsAt only applies while running
        const { endsAt, ...rest } = timer;
        saveTimer({ ...rest, state: 'stopped', timeLeft: remainingSeconds(timer, stoppedAt) }, finish);
      });
    });
    return true;
  } else if (message.type === 'RESET_TIMER') {
    queueTimerTask((done) => {
      chrome.storage.sync.get(['settings'], (data) => {
        const { study } = durationsFrom(data.settings);
        saveTimer({ state: 'stopped', timeLeft: study * 60, phase: 'study1' }, () => {
          sendResponse({ success: true });
          done();
        });
      });
    });
    return true;
  } else if (message.type === 'CHECK_TIMER') {
    // Sent by the popup / floating timer when they reach 0:00, in case the alarm is late
    finishPhaseIfDue();
  }
});