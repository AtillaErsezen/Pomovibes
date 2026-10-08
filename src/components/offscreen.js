// Background sounds (white and brown noise) are generated in code
const isNoise = (soundType) => soundType === 'whiteNoise' || soundType === 'brownNoise';

// Create audio elements
const bellAudio = new Audio();

// Current background sound state
let currentSoundType = 'brownNoise';
let currentVolume = 0.3;
let isBackgroundAudioEnabled = false;

// --- Generated noise (Web Audio) ---
const NOISE_SECONDS = 10;   // length of the looped buffer
const CROSSFADE_SECONDS = 0.05; // blends the loop point so it doesn't click

let audioContext = null;
let noiseGain = null;
let noiseSource = null;
const noiseBuffers = {};

// Fills `data` with noise. White: flat spectrum. Brown: integrated white noise (-6 dB/octave).
const fillNoise = (data, soundType) => {
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    if (soundType === 'brownNoise') {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else {
      data[i] = white * 0.35;
    }
  }
};

const getNoiseBuffer = (soundType) => {
  if (noiseBuffers[soundType]) return noiseBuffers[soundType];

  const sampleRate = audioContext.sampleRate;
  const length = NOISE_SECONDS * sampleRate;
  const fade = Math.floor(CROSSFADE_SECONDS * sampleRate);
  const buffer = audioContext.createBuffer(2, length, sampleRate);

  for (let channel = 0; channel < 2; channel++) {
    // Generate a little extra and fade it into the start so the loop is seamless
    const raw = new Float32Array(length + fade);
    fillNoise(raw, soundType);
    const data = buffer.getChannelData(channel);
    data.set(raw.subarray(0, length));
    for (let i = 0; i < fade; i++) {
      const t = i / fade;
      data[i] = raw[i] * Math.sqrt(t) + raw[length + i] * Math.sqrt(1 - t);
    }
  }

  noiseBuffers[soundType] = buffer;
  return buffer;
};

const startNoise = (soundType) => {
  if (!audioContext) {
    audioContext = new AudioContext();
    noiseGain = audioContext.createGain();
    noiseGain.connect(audioContext.destination);
  }
  audioContext.resume();
  noiseGain.gain.value = currentVolume;

  noiseSource = audioContext.createBufferSource();
  noiseSource.buffer = getNoiseBuffer(soundType);
  noiseSource.loop = true;
  noiseSource.connect(noiseGain);
  noiseSource.start();
};

const stopNoise = () => {
  if (noiseSource) {
    noiseSource.stop();
    noiseSource.disconnect();
    noiseSource = null;
  }
};

// --- Background sound controls ---
const isBackgroundPlaying = () => noiseSource !== null;

const playBackground = () => {
  if (isBackgroundPlaying()) return;
  startNoise(currentSoundType);
};

const pauseBackground = () => {
  stopNoise();
};

const setBackgroundVolume = (volume) => {
  currentVolume = volume;
  if (noiseGain) noiseGain.gain.value = volume;
};

const setBackgroundSoundType = (soundType) => {
  // Older saved settings may still say 'music', which no longer exists
  if (!isNoise(soundType)) soundType = 'brownNoise';
  if (soundType === currentSoundType) return;
  const wasPlaying = isBackgroundPlaying();
  pauseBackground();
  currentSoundType = soundType;
  // Keep playing with the new sound if we were already playing
  if (wasPlaying) playBackground();
};

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
    
    if (volume !== undefined) {
      setBackgroundVolume(volume);
    }

    if (soundType) {
      setBackgroundSoundType(soundType);
    }

    // Execute command
    if (command === 'play') {
      isBackgroundAudioEnabled = true;
      playBackground();
    } else if (command === 'pause') {
      isBackgroundAudioEnabled = false;
      pauseBackground();
    }

    // Send response to confirm action
    sendResponse({ success: true });
    return true;
  }
});

// Sound preferences live in chrome.storage.sync, the timer in chrome.storage.local
const getSoundState = (callback) => {
  chrome.storage.sync.get(['backgroundMusicEnabled', 'backgroundMusicVolume', 'backgroundSoundType'], (syncData) => {
    chrome.storage.local.get(['timer'], (localData) => callback({ ...syncData, ...localData }));
  });
};

// Check and recover audio playback every few seconds
setInterval(() => {
  getSoundState((data) => {
    const isEnabled = data.backgroundMusicEnabled ?? false;
    const timer = data.timer || { state: 'stopped' };
    const soundType = data.backgroundSoundType || 'brownNoise';
    
    // Only play during study phases when enabled
    const shouldPlay = isEnabled && timer.state === 'running' && timer.phase.startsWith('study');
    
    if (shouldPlay) {
      setBackgroundSoundType(soundType);
      if (data.backgroundMusicVolume !== undefined) {
        setBackgroundVolume(data.backgroundMusicVolume);
      }
      playBackground();
    } else {
      pauseBackground();
    }
  });
}, 3000);

console.log('Offscreen audio handler initialized');