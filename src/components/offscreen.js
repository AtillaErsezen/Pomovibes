// Sound sources for background audio
const soundSources = {
  music: chrome.runtime.getURL("assets/background_music.mp3"),
  brownNoise: chrome.runtime.getURL("assets/brown_noise.mp3"),
  whiteNoise: chrome.runtime.getURL("assets/White-Noise-10min.mp3")
};

// Create audio elements
const bellAudio = new Audio();
const backgroundAudio = new Audio();
backgroundAudio.loop = true;

// Current background sound state
let currentSoundType = 'music';
let isBackgroundAudioEnabled = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle bell sound for timer completion
  if (message.type === 'PLAY_BELL' && message.audioSource) {
    bellAudio.src = message.audioSource;
    bellAudio.play()
      .then(() => sendResponse({ success: true }))
      .catch((error) => {
        console.error('Bell audio playback failed:', error);
        sendResponse({ success: false, error: error.message });
      });
      
    // Return true so the runtime knows you'll respond asynchronously.
    return true;
  }
  
  // Handle background audio control
  if (message.type === 'BACKGROUND_AUDIO_CONTROL') {
    const { command, volume, soundType } = message;
    
    // Set volume
    if (volume !== undefined) {
      backgroundAudio.volume = volume;
    }
    
    // Update source if needed
    if (soundType && soundType !== currentSoundType) {
      const wasPlaying = !backgroundAudio.paused;
      currentSoundType = soundType;
      backgroundAudio.src = soundSources[soundType] || soundSources.music;
      backgroundAudio.load();
      
      // If we were playing and changed sound, resume playing with new sound
      if (wasPlaying && command === 'play') {
        backgroundAudio.play().catch(error => {
          console.log('Play after source change prevented by browser:', error);
        });
      }
    }
    
    // Execute command
    if (command === 'play') {
      isBackgroundAudioEnabled = true;
      if (backgroundAudio.paused) {
        backgroundAudio.play().catch(error => {
          console.log('Background audio play prevented by browser:', error);
        });
      }
    } else if (command === 'pause') {
      isBackgroundAudioEnabled = false;
      if (!backgroundAudio.paused) {
        backgroundAudio.pause();
      }
    }
    
    // Send response to confirm action
    sendResponse({ success: true });
    return true;
  }
});

// Check and recover audio playback every few seconds
setInterval(() => {
  chrome.storage.sync.get(['backgroundMusicEnabled', 'backgroundMusicVolume', 'backgroundSoundType', 'timer'], (data) => {
    const isEnabled = data.backgroundMusicEnabled ?? false;
    const timer = data.timer || { state: 'stopped' };
    const soundType = data.backgroundSoundType || 'music';
    
    // Only play during study phases when enabled
    const shouldPlay = isEnabled && timer.state === 'running' && timer.phase.startsWith('study');
    
    if (shouldPlay) {
      // Update source if needed
      if (soundType !== currentSoundType) {
        currentSoundType = soundType;
        backgroundAudio.src = soundSources[soundType] || soundSources.music;
        backgroundAudio.load();
      }
      
      // Ensure volume is correct
      if (data.backgroundMusicVolume !== undefined) {
        backgroundAudio.volume = data.backgroundMusicVolume;
      }
      
      // Resume play if paused
      if (backgroundAudio.paused) {
        backgroundAudio.play().catch(error => {
          console.log('Background audio resume prevented by browser:', error);
        });
      }
    } else if (!shouldPlay && !backgroundAudio.paused) {
      backgroundAudio.pause();
    }
  });
}, 3000);

console.log('Offscreen audio handler initialized');