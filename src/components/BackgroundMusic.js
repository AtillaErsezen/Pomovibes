import React, { useEffect } from 'react';

const BackgroundMusic = () => {
  // Sound sources (reference only - actual playback is handled in offscreen.js)
  const soundSources = {
    music: chrome.runtime.getURL("assets/background_music.mp3"),
    brownNoise: chrome.runtime.getURL("assets/brown_noise.mp3"),
    whiteNoise: chrome.runtime.getURL("assets/White-Noise-10min.mp3")
  };

  // Helper function to ensure offscreen document exists
  const ensureOffscreenExists = async () => {
    const isDocumentPresent = await chrome.offscreen.hasDocument();
    if (!isDocumentPresent) {
      try {
        await chrome.offscreen.createDocument({
          url: 'src/offscreen.html',
          reasons: ['DOM_PARSER', 'AUDIO_PLAYBACK'], 
          justification: 'To play background sounds for Pomodoro timer.'
        });
        console.log('Offscreen document created for background audio');
      } catch (error) {
        console.error('Failed to create offscreen document:', error);
      }
    }
  };

  useEffect(() => {
    // Function to check music status and update playback
    const updateMusicPlayback = async () => {
      // First ensure the offscreen document exists
      await ensureOffscreenExists();
      
      chrome.storage.sync.get(['backgroundMusicEnabled', 'backgroundMusicVolume', 'backgroundSoundType', 'timer'], (data) => {
        // Extract settings with defaults
        const isEnabled = data.backgroundMusicEnabled ?? false;
        const volume = data.backgroundMusicVolume ?? 0.3;
        const soundType = data.backgroundSoundType ?? 'music';
        const timer = data.timer || { state: 'stopped', phase: 'study1' };
        
        // Determine if we should be playing
        const shouldPlay = isEnabled && timer.state === 'running' && timer.phase.startsWith('study');
        
        // Send message to offscreen document to handle audio playback
        chrome.runtime.sendMessage({
          type: 'BACKGROUND_AUDIO_CONTROL',
          command: shouldPlay ? 'play' : 'pause',
          volume: volume,
          soundType: soundType
        });
      });
    };
    
    // Update initially
    updateMusicPlayback();
    
    // Create a special event to force resume audio when needed
    const checkAndRecoverAudio = async () => {
      await ensureOffscreenExists();
      
      chrome.storage.sync.get(['backgroundMusicEnabled', 'backgroundMusicVolume', 'backgroundSoundType', 'timer'], (data) => {
        const isEnabled = data.backgroundMusicEnabled ?? false;
        const timer = data.timer || { state: 'stopped' };
        const soundType = data.backgroundSoundType ?? 'music';
        const volume = data.backgroundMusicVolume ?? 0.3;
        
        // Only play during study phases when enabled
        const shouldPlay = isEnabled && timer.state === 'running' && timer.phase.startsWith('study');
        
        // Send recovery command to ensure audio is in the correct state
        chrome.runtime.sendMessage({
          type: 'BACKGROUND_AUDIO_CONTROL',
          command: shouldPlay ? 'play' : 'pause',
          volume: volume,
          soundType: soundType,
          isRecovery: true // Flag to indicate this is a recovery check
        });
      });
    };
    
    // Set up listeners for timer changes and toggle events
    const messageListener = (message) => {
      if (['TIMER_UPDATE', 'TIMER_TICK', 'START_TIMER', 'STOP_TIMER', 'RESET_TIMER', 'BACKGROUND_MUSIC_TOGGLE'].includes(message.type)) {
        updateMusicPlayback();
      } else if (message.type === 'VIEW_CHANGED') {
        // When view changes, check and recover audio state
        setTimeout(checkAndRecoverAudio, 100);
      }
    };
    
    // Listen to changes in storage
    const storageListener = (changes, area) => {
      if (area === 'sync' && (
          changes.backgroundMusicEnabled || 
          changes.backgroundMusicVolume || 
          changes.backgroundSoundType ||
          changes.timer
        )) {
        updateMusicPlayback();
      }
    };
    
    // Add event listeners
    chrome.runtime.onMessage.addListener(messageListener);
    chrome.storage.onChanged.addListener(storageListener);
    
    // Set up periodic checks to ensure audio continues playing when it should
    const recoveryInterval = setInterval(checkAndRecoverAudio, 5000);
    
    // Clean up event listeners when component unmounts
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
      chrome.storage.onChanged.removeListener(storageListener);
      clearInterval(recoveryInterval);
      
      // Note: We do NOT stop audio when this component unmounts
      // Audio playback is now managed by the persistent offscreen document
    };
  }, []);

  // No need for an audio element anymore - offscreen document handles audio
  return null;
};

export default BackgroundMusic;
