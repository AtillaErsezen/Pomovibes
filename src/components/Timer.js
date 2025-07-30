import React, { useState, useEffect } from 'react';

const Timer = ({ settings, darkMode }) => {
  const study = settings?.study ?? 25;
  const [timer, setTimer] = useState({
    state: 'stopped',
    timeLeft: study * 60,
    phase: 'study1',
  });
  const [focusMode, setFocusMode] = useState(false);  // Local interval for smooth countdown independent of background process
  const [localInterval, setLocalInterval] = useState(null);
  
  // Function to handle smooth UI countdown
  const startLocalCountdown = () => {
    // Clear any existing interval first
    if (localInterval) {
      clearInterval(localInterval);
    }
    
    // Start a new countdown interval
    const interval = setInterval(() => {
      setTimer(prev => {
        if (prev.state === 'running' && prev.timeLeft > 0) {
          return { ...prev, timeLeft: prev.timeLeft - 1 };
        }
        return prev;
      });
    }, 1000);
    
    setLocalInterval(interval);
  };
  
  // Stop local countdown
  const stopLocalCountdown = () => {
    if (localInterval) {
      clearInterval(localInterval);
      setLocalInterval(null);
    }
  };
  
  useEffect(() => {
    // More robust timer initialization with better logging
    const initializeTimer = () => {
      
      chrome.storage.sync.get(['timer'], (data) => {
        console.log('Retrieved timer state from storage:', data.timer);
        
        // Check if we need to initialize or update the timer
        if (!data.timer) {
          console.log('No timer found in memory, initializing timer with settings:', initialTimer);
          const initialTimer = {
            state: 'stopped',
            timeLeft: settings.study * 60,
            phase: 'study1',
          };
          
          chrome.storage.sync.set({ timer: initialTimer });
          setTimer(initialTimer);
        }else{
          console.log('Using existing timer from storage:', data.timer);
          setTimer(data.timer);
        }
        
        // If timer is already running, start local countdown
        if (data.timer.state === 'running') {
          startLocalCountdown();
        }
        
        // Force UI update with latest timer state
        setTimeout(() => {
          chrome.runtime.sendMessage({ type: 'TIMER_UPDATE', timer: initialTimer });
        }, 200);
      });
    };
    
    initializeTimer();

  // Check if we're starting a new study phase and need to reset the tracking
  const checkPhaseStart = () => {
    chrome.storage.sync.get(['timer', 'lastPhase'], (data) => {
      const currentPhase = data.timer?.phase;
      const lastPhase = data.lastPhase;
      
      // If we're starting a new study phase
      if (currentPhase && currentPhase.startsWith('study') && currentPhase !== lastPhase) {
        console.log('Starting new study phase:', currentPhase);
        // Store the current phase as last phase
        chrome.storage.sync.set({ lastPhase: currentPhase });
      }
    });
  };
    // Check phase on initial load
  checkPhaseStart();
  
  // Set up periodic checks for phase and timer state
  const phaseCheckInterval = setInterval(checkPhaseStart, 5000);
  
  // Set up periodic refresh of timer state from storage
  const timerRefreshInterval = setInterval(() => {
    chrome.storage.sync.get(['timer'], (data) => {
      if (data.timer) {
        const storedTimeLeft = data.timer.timeLeft;
        const currentTimeLeft = timer.timeLeft;
        
        // Only update if there's a significant difference (more than 2 seconds)
        // to avoid unnecessary re-renders
        if (Math.abs(storedTimeLeft - currentTimeLeft) > 2) {
          console.log('Auto-refreshing timer state - stored:', storedTimeLeft, 'current:', currentTimeLeft);
          setTimer(data.timer);
        }
      }
    });
  }, 3000);
  
  // Clean up intervals
  return () => {
    clearInterval(phaseCheckInterval);
    clearInterval(timerRefreshInterval);
  };    const listener = (message) => {
      if (message.type === 'TIMER_UPDATE') {
        console.log('Received TIMER_UPDATE', message.timer);
        
        // Update the timer state
        setTimer(message.timer);
        
        // Manage local countdown based on timer state
        if (message.timer.state === 'running') {
          startLocalCountdown();
        } else {
          stopLocalCountdown();
        }
      } else if (message.type === 'TIMER_TICK') {
        // We're using local countdown for smoother UI updates,
        // so we only sync with TIMER_TICK if there's a significant difference
        setTimer((prev) => {
          if (Math.abs(prev.timeLeft - message.timeLeft) > 2) {
            console.log('Significant time difference detected, syncing with background');
            return { ...prev, timeLeft: message.timeLeft };
          }
          return prev;
        });
      } else if (message.type === 'FLOATING_TIMER') {
        chrome.notifications.create('timerNotification', {
          type: 'basic',
          iconUrl: chrome.runtime.getURL("assets/Pomodoro_Logo_128.png"),
          title: 'Pomodoro Timer',
          message: `Time Left: ${formatTime(message.timeLeft)}`,
          silent: true,
        });
      }
    };
    chrome.runtime.onMessage.addListener(listener);

    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [settings.study]);

  const startTimer = () => {
    // Create local timer state first for immediate UI update
    const updatedTimer = { ...timer, state: 'running' };
    
    // Update local state immediately 
    setTimer(updatedTimer);
    
    // Start local countdown for immediate feedback
    startLocalCountdown();
    
    // Then update storage and notify background script
    chrome.storage.sync.set({ timer: updatedTimer }, () => {
      chrome.runtime.sendMessage({ type: 'START_TIMER' }, (response) => {
        if (response?.success) {
          console.log('Timer started successfully');
          console.log('sending message to floating timer');
          chrome.runtime.sendMessage({ type: 'FLOATING_TIMER', timeLeft: updatedTimer.timeLeft });
        } else if (chrome.runtime.lastError) {
          console.error('START_TIMER failed:', chrome.runtime.lastError.message);
          setTimeout(() => chrome.runtime.sendMessage({ type: 'START_TIMER' }), 500);
        }
      });
    });
  };  
  const stopTimer = () => {
    const updatedTimer = { ...timer, state: 'stopped' };
    
    // Update local state immediately for instant UI feedback
    setTimer(updatedTimer);
    
    // Stop the local countdown
    stopLocalCountdown();
    
    // Update storage and stop background timer
    chrome.storage.sync.set({ timer: updatedTimer }, () => {
      // Immediately update UI through message system
      chrome.runtime.sendMessage({ type: 'TIMER_UPDATE', timer: updatedTimer });
      
      // Send stop message to background script (separate for clarity)
      chrome.runtime.sendMessage({ type: 'STOP_TIMER' }, (response) => {
        console.log('Timer stopped successfully');
      });
    });
  };
  const resetTimer = () => {
    const newTimer = { state: 'stopped', timeLeft: study * 60, phase: 'study1' };
    
    // Update local state immediately
    setTimer(newTimer);
    
    // Stop any local countdown
    stopLocalCountdown();
    
    // Update storage and reset background timer
    chrome.storage.sync.set({ timer: { state: 'stopped', timeLeft: settings.study * 60, phase: 'study1' } });
    chrome.runtime.sendMessage({ type: 'STOP_TIMER' });
    chrome.runtime.sendMessage({ type: 'RESET_TIMER' });
  };

  const toggleFocusMode = () => setFocusMode(!focusMode);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const formatPhase = (phase) => {
    const [type, num] = phase.match(/([a-zA-Z]+)(\d+)/)?.slice(1) || ['study', '1'];
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
  // Function to manually refresh timer state from storage
  const refreshTimerState = () => {
    chrome.storage.sync.get(['timer'], (data) => {
      if (data.timer) {
        console.log('Manually refreshing timer:', data.timer);
        setTimer(data.timer);
      }
    });
  };

  return (
    <div
      className={`p-6 rounded-xl shadow-lg transition-all duration-700 ease-in-out ${
        darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      } ${focusMode ? 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80' : ''}`}
    >
      {focusMode ? (
        <div className="text-center animate-fade-in">
          <h2 className={`text-6xl font-extrabold mb-6 ${focusTextColor}`}>{formatTime(timer.timeLeft)}</h2>
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
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-semibold font-sans">Pomodoro Timer</h2>
            <button
              onClick={refreshTimerState}
              className="p-2 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
              title="Refresh timer state"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
          <div className="text-5xl font-bold text-center py-4 bg-gradient-to-r from-blue-400 to-purple-500 text-transparent bg-clip-text">
            {formatTime(timer.timeLeft)}
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