import React, { useState, useEffect, useRef } from 'react';

// Seconds left: a running timer counts down to its end time (endsAt, saved by the
// background script); a stopped one keeps timeLeft
const remainingSeconds = (timer, now = Date.now()) =>
  timer.state === 'running' && typeof timer.endsAt === 'number'
    ? Math.max(0, Math.ceil((timer.endsAt - now) / 1000))
    : timer.timeLeft;

const Timer = ({ settings, darkMode }) => {
  const study = settings?.study ?? 25;
  const [timer, setTimer] = useState({
    state: 'stopped',
    timeLeft: study * 60,
    phase: 'study1',
  });
  const [now, setNow] = useState(Date.now());
  const [focusMode, setFocusMode] = useState(false);
  // The phase end we've already asked the background to handle
  const askedForEndRef = useRef(null);

  useEffect(() => {
    chrome.storage.local.get(['timer'], (data) => {
      let currentTimer = data.timer;
      if (!currentTimer) {
        currentTimer = {
          state: 'stopped',
          timeLeft: settings.study * 60,
          phase: 'study1',
        };
        console.log('No timer found in memory, initializing timer with settings:', currentTimer);
        chrome.storage.local.set({ timer: currentTimer });
      }
      setTimer(currentTimer);
    });

    // Check if we're starting a new study phase and need to reset the tracking
    const checkPhaseStart = () => {
      chrome.storage.local.get(['timer', 'lastPhase'], (data) => {
        const currentPhase = data.timer?.phase;
        const lastPhase = data.lastPhase;
        
        // If we're starting a new study phase
        if (currentPhase && currentPhase.startsWith('study') && currentPhase !== lastPhase) {
          console.log('Starting new study phase:', currentPhase);
          // Store the current phase as last phase
          chrome.storage.local.set({ lastPhase: currentPhase });
        }
      });
    };
    // Check phase on initial load
    checkPhaseStart();
    const phaseCheckInterval = setInterval(checkPhaseStart, 5000);

    // The background script saves every change (start, stop, reset, next phase)
    const storageListener = (changes, area) => {
      if (area === 'local' && changes.timer && changes.timer.newValue) {
        setTimer(changes.timer.newValue);
      }
    };
    const messageListener = (message) => {
      if (message.type === 'TIMER_UPDATE' && message.timer) {
        setTimer(message.timer);
      }
    };
    chrome.storage.onChanged.addListener(storageListener);
    chrome.runtime.onMessage.addListener(messageListener);

    return () => {
      clearInterval(phaseCheckInterval);
      chrome.storage.onChanged.removeListener(storageListener);
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [settings.study]);

  // Redraw while running; the time shown is always worked out from the end time
  useEffect(() => {
    if (timer.state !== 'running') return undefined;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [timer.state, timer.endsAt]);

  const timeLeft = remainingSeconds(timer, now);

  // At 0:00, ask the background to finish the phase in case its alarm is late
  useEffect(() => {
    if (timer.state === 'running' && timeLeft === 0 && askedForEndRef.current !== timer.endsAt) {
      askedForEndRef.current = timer.endsAt;
      chrome.runtime.sendMessage({ type: 'CHECK_TIMER' });
    }
  }, [timeLeft, timer.state, timer.endsAt]);

  const startTimer = () => {
    // Show it running right away; the background saves the real end time
    setTimer((prev) => ({
      ...prev,
      state: 'running',
      duration: prev.duration ?? prev.timeLeft,
      endsAt: Date.now() + prev.timeLeft * 1000,
    }));
    chrome.runtime.sendMessage({ type: 'START_TIMER' }, () => {
      if (chrome.runtime.lastError) {
        console.error('START_TIMER failed:', chrome.runtime.lastError.message);
        setTimeout(() => chrome.runtime.sendMessage({ type: 'START_TIMER' }), 500);
      }
    });
  };

  const stopTimer = () => {
    setTimer((prev) => {
      const { endsAt, ...rest } = prev;
      return { ...rest, state: 'stopped', timeLeft: remainingSeconds(prev) };
    });
    chrome.runtime.sendMessage({ type: 'STOP_TIMER' });
  };

  const resetTimer = () => {
    setTimer({ state: 'stopped', timeLeft: study * 60, phase: 'study1' });
    chrome.runtime.sendMessage({ type: 'RESET_TIMER' });
  };

  const toggleFocusMode = () => setFocusMode(!focusMode);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const formatPhase = (phase) => {
    // 'longBreak' has no number, so the digits are optional
    const [type, num] = phase.match(/^([a-zA-Z]+)(\d*)$/)?.slice(1) || ['study', '1'];
    const formattedType =
      type === 'study'
        ? 'Study Phase'
        : type === 'shortBreak'
        ? 'Short Break'
        : type === 'longBreak'
        ? 'Long Break'
        : type.replace(/([A-Z])/g, ' $1').trim();
    return { type: formattedType + ':', num };
  };

  const { type, num } = formatPhase(timer.phase);
  const focusTextColor = darkMode ? 'text-gray-200' : 'text-gray-800';

  return (
    <div
      className={`p-6 rounded-xl shadow-lg transition-all duration-700 ease-in-out ${
        darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      } ${focusMode ? 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80' : ''}`}
    >
      {focusMode ? (
        <div className="text-center animate-fade-in">
          <h2 className={`text-6xl font-extrabold mb-6 ${focusTextColor}`}>{formatTime(timeLeft)}</h2>
          <p className={`text-2xl font-medium ${focusTextColor} mb-4`}>
            {type}{' '}
            <span className="bg-gradient-to-r from-blue-400 to-purple-500 text-transparent bg-clip-text">
              {num}
            </span>
          </p>
          <p className={`text-lg ${focusTextColor} mb-6`}>Focus on your task!</p>
          <button
            onClick={toggleFocusMode}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all duration-700 ease-in-out shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Exit Focus Mode
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          <h2 className="text-2xl font-semibold font-sans">Pomodoro Timer</h2>
          <div className="text-5xl font-bold text-center py-4 bg-gradient-to-r from-blue-400 to-purple-500 text-transparent bg-clip-text">
            {formatTime(timeLeft)}
          </div>
          <div className="flex items-center justify-center space-x-2">
            <p className="text-lg text-center font-sans">
              {type}{' '}
              <span className="bg-gradient-to-r from-blue-400 to-purple-500 text-transparent bg-clip-text">
                {num}
              </span>
            </p>
            <span className="px-2 py-0.5 text-xs rounded-full bg-opacity-70 dark:bg-opacity-70"
                  style={{ backgroundColor: timer.state === 'running' ? '#10B981' : '#6B7280' }}>
              {timer.state === 'running' ? 'Running' : 'Stopped'}
            </span>
          </div>
          <div className="flex flex-wrap gap-2 justify-center">
            <button
              onClick={startTimer}
              disabled={timer.state === 'running'}
              className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all duration-700 ease-in-out shadow-md disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
            >
              Start
            </button>
            <button
              onClick={stopTimer}
              disabled={timer.state === 'stopped'}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all duration-700 ease-in-out shadow-md disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
            >
              Stop
            </button>
            <button
              onClick={resetTimer}
              className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-all duration-700 ease-in-out shadow-md focus:outline-none focus:ring-2 focus:ring-gray-500 text-sm"
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
// <button
//   onClick={toggleFocusMode}
//   className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-700 ease-in-out shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
// >
//   Focus Mode
// </button>
export default Timer;