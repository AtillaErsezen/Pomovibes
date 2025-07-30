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

// Function to update study minutes in calendar
function updateStudyMinutes(phase, timeLeft, studyDuration) {
  // Only update for study phases that are ending or have 5 or fewer minutes left
  if (phase.startsWith('study') && (timeLeft === 0 || timeLeft <= 5 * 60)) {
    const date = new Date().toISOString().split('T')[0];
    
    chrome.storage.sync.get(['sessions'], (data) => {
      const sessions = data.sessions || {};
      
      // Calculate minutes studied in this phase
      let minutesStudied = 0;
      
      if (timeLeft === 0) {
        // When the timer reaches 0, we've completed the full study duration
        minutesStudied = studyDuration;
      } else {
        // When we hit the 5-minute mark, record the minutes we've studied so far
        // but only if we haven't already recorded this session
        const minutesCompleted = studyDuration - Math.ceil(timeLeft / 60);
        minutesStudied = minutesCompleted;
      }
      
      // Ensure we don't double-count minutes if already recorded
      const existingMinutes = sessions[date] || 0;
      const phaseKey = `${phase}_${new Date().toISOString()}`;
      const recordedPhases = sessions.recordedPhases || {};
      
      if (!recordedPhases[phaseKey]) {
        // Update sessions with studied minutes
        const updated = {
          ...sessions,
          [date]: existingMinutes + minutesStudied,
          recordedPhases: {
            ...recordedPhases,
            [phaseKey]: true
          }
        };
        
        chrome.storage.sync.set({ sessions: updated }, () => {
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
      }
    });
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'pomodoro') {
    console.log('Alarm triggered for pomodoro at:', new Date().toISOString());
    chrome.storage.sync.get(['timer', 'settings'], (data) => {
      // Safely get settings with fallback
      const study = data.settings?.study ?? 25;
      const shortBreak = data.settings?.shortBreak ?? 5;
      const longBreak = data.settings?.longBreak ?? 15;
      let timer = data.timer || { state: 'stopped', timeLeft: study * 60, phase: 'study1' };
      if (timer.state === 'running') {
        timer.timeLeft = Math.max(0, timer.timeLeft - 1);
        console.log('Tick: timeLeft updated to', timer.timeLeft);

        // Check for study phase and update calendar when 5 minutes or less remain
        if (timer.phase.startsWith('study') && (timer.timeLeft === 5 * 60 || timer.timeLeft === 0)) {
          updateStudyMinutes(timer.phase, timer.timeLeft, study);
        }

        if (timer.timeLeft === 0) {
          console.log('Session ended, playing bell sound');
          chrome.storage.local.get(['customBellSound'], async (result) => {
            const audioSource = result.customBellSound || chrome.runtime.getURL('assets/bell_sound.mp3');
            // Ensure the offscreen document exists first.
            await ensureOffscreen();
            chrome.runtime.sendMessage({ type: 'PLAY_BELL', audioSource });
          });

          const phases = {
            study1:      ['shortBreak1',  shortBreak * 60],
            shortBreak1: ['study2',      study * 60],
            study2:      ['shortBreak2', shortBreak * 60],
            shortBreak2: ['study3',      study * 60],
            study3:      ['shortBreak3', shortBreak * 60],
            shortBreak3: ['study4',      study * 60],
            study4:      ['longBreak',   longBreak * 60],
            longBreak:   ['study1',      study * 60],
          };
          const [nextPhase, nextTime] = phases[timer.phase] || ['study1', study * 60];
          timer = {
            state: 'running',
            timeLeft: nextTime,
            phase: nextPhase,
          };
          console.log('Transitioned to next phase:', timer.phase);
        }        chrome.storage.sync.set({ timer }, () => {
          console.log('Timer state saved:', timer);
          
          // Send both TIMER_TICK and TIMER_UPDATE messages for better UI synchronization
          chrome.runtime.sendMessage({ type: 'TIMER_TICK', timeLeft: timer.timeLeft });
          chrome.runtime.sendMessage({ type: 'TIMER_UPDATE', timer });
          
          // only send FLOATING_TIMER update if enabled
          chrome.storage.sync.get(['floatingTimerEnabled'], (data) => {
            if (data.floatingTimerEnabled) {
              chrome.runtime.sendMessage({ type: 'FLOATING_TIMER', timeLeft: timer.timeLeft });
            }
          });
          
          // send message to all open tabs...
          chrome.tabs.query({}, (tabs) => {
            for (const tab of tabs) {
              chrome.tabs.sendMessage(tab.id, { type: 'TIMER_TICK', timeLeft: timer.timeLeft }, (response) => {
                if (chrome.runtime.lastError) {
                  console.warn(`No content script in tab ${tab.id}:`, chrome.runtime.lastError.message);
                }
              });
              
              // Send full timer state update to tabs
              chrome.tabs.sendMessage(tab.id, { type: 'TIMER_UPDATE', timer }, (response) => {
                if (chrome.runtime.lastError) {
                  // Ignore errors for tabs that don't have the content script
                }
              });
              
              chrome.storage.sync.get(['floatingTimerEnabled'], (data) => {
                if (data.floatingTimerEnabled) {
                  chrome.tabs.sendMessage(tab.id, { type: 'FLOATING_TIMER', timeLeft: timer.timeLeft }, (response) => {
                    if (chrome.runtime.lastError) {
                      console.warn(`No content script in tab ${tab.id}:`, chrome.runtime.lastError.message);
                    }
                  });
                }
              });
            }
          });
        });
      } else {
        console.log('Timer is not running, state:', timer.state);
      }
    });
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
    console.log('Received START_TIMER message at:', new Date().toISOString());
    chrome.storage.sync.get(['timer', 'settings'], (data) => {
      const settings = data.settings || { study: 25 };
      let timer = data.timer || { state: 'stopped', timeLeft: settings.study * 60, phase: 'study1' };
      
      // Update timer state to running
      timer.state = 'running';
      
      // Create an immediate tick function to avoid the initial delay
      const immediateTick = () => {
        // Send an immediate timer update for responsive UI
        chrome.runtime.sendMessage({ type: 'TIMER_UPDATE', timer });
        chrome.runtime.sendMessage({ type: 'TIMER_TICK', timeLeft: timer.timeLeft });
      };
      
      // Call it once immediately
      immediateTick();
      
      // Then set up the regular alarm
      chrome.storage.sync.set({ timer }, () => {
        chrome.alarms.clear('pomodoro', () => {
          // Create alarm with no initial delay
          chrome.alarms.create('pomodoro', { 
            delayInMinutes: 0, // Start immediately
            periodInMinutes: 1 / 60 // Fire every second
          }, () => {
            console.log('Alarm created for timer start with no delay');
            
            sendResponse({ success: true });
          });
        });
      });
    });
    return true;
  } else if (message.type === 'STOP_TIMER') {
    console.log('Received STOP_TIMER message');
    chrome.alarms.clear('pomodoro');
    sendResponse({ success: true });  } else if (message.type === 'RESET_TIMER') {
    console.log('Received RESET_TIMER message');
    chrome.alarms.clear('pomodoro');
    
    chrome.storage.sync.get(['settings'], (data) => {
      const settings = data.settings || { study: 25 };
      const newTimer = { 
        state: 'stopped', 
        timeLeft: settings.study * 60, 
        phase: 'study1' 
      };
      
      // Update storage with new timer state
      chrome.storage.sync.set({ timer: newTimer }, () => {
        console.log('Timer reset to:', newTimer);
        
        // Send TIMER_UPDATE message to update UI
        chrome.runtime.sendMessage({ type: 'TIMER_UPDATE', timer: newTimer });
        
        // Update floating timer in all tabs
        chrome.tabs.query({}, (tabs) => {
          for (const tab of tabs) {
            chrome.tabs.sendMessage(tab.id, { 
              type: 'RESET_TIMER',
              timer: newTimer
            }, (response) => {
              if (chrome.runtime.lastError) {
                console.warn(`No content script in tab ${tab.id}:`, chrome.runtime.lastError.message);
              }
            });
          }
        });
        
        sendResponse({ success: true });
      });
    });
    
    return true; // Required for async sendResponse
  }
});