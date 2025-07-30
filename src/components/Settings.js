// src/components/Settings.js
import React, { useState, useEffect } from 'react';

const Settings = ({
  settings: initialSettings,
  updateSettings,
  onClose,
  darkMode
}) => {  const [settings, setSettings] = useState(initialSettings);
  const [selectedFile, setSelectedFile] = useState(null);
  const [backgroundMusicVolume, setBackgroundMusicVolume] = useState(0.3);
  const [backgroundSoundType, setBackgroundSoundType] = useState('music');
  // keep in sync if parent-storage changes
  useEffect(() => {
    chrome.storage.sync.get(['settings', 'backgroundMusicVolume', 'backgroundSoundType'], (data) => {
      if (data.settings) setSettings(data.settings);
      if (data.backgroundMusicVolume !== undefined) {
        setBackgroundMusicVolume(data.backgroundMusicVolume);
      }
      if (data.backgroundSoundType !== undefined) {
        setBackgroundSoundType(data.backgroundSoundType);
      }
    });
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setSettings((prev) => ({ ...prev, [name]: parseInt(value) }));
  };  const handleSaveChanges = () => {
    // 1) persist to chrome.storage
    chrome.storage.sync.set({ 
      settings, 
      backgroundMusicVolume,
      backgroundSoundType
    }, () => {
      console.log('Settings saved:', settings);
      console.log('Background music volume saved:', backgroundMusicVolume);
      console.log('Background sound type saved:', backgroundSoundType);
      // 2) lift up to App.js
      updateSettings(settings);
      // 3) close the modal
      onClose();
    });
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('audio/')) {
      setSelectedFile(file);
    } else {
      alert('Please select a valid audio file.');
    }
  };

  const handleUploadMusic = () => {
    if (selectedFile) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const audioData = e.target.result;
        chrome.storage.local.set({ customBellSound: audioData }, () => {
          console.log('Custom bell sound uploaded and saved.');
          setSelectedFile(null);
        });
      };
      reader.readAsDataURL(selectedFile);
    }
  };
  // We don't want to reset the timer when opening settings
  // This code was removed to prevent timer from resetting when visiting the Settings page

  return (    <div
      className={`fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[60]
                  w-[90%] max-h-[calc(100vh-60px)] overflow-auto p-4 rounded-xl shadow-lg
                  backdrop-blur-md transition-all duration-700 ease-in-out ${
                    darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                  }`}
    >      <div className="flex justify-between items-center mb-3">
        <h2 className="text-lg font-semibold font-sans">Settings</h2>
        <button
          onClick={() => {
            // Notify about view change before closing
            chrome.runtime.sendMessage({ type: 'VIEW_CHANGED', view: 'dashboard' });
            onClose();
          }}
          className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-300 ease-in-out focus:outline-none"
          aria-label="Close settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-sans">Study (minutes)</label>
          <input
            type="number"
            name="study"
            min="1"
            value={settings.study}
            onChange={handleChange}
            className={`w-full p-3 rounded-lg border font-sans custom-number-input ${
              darkMode
                ? 'bg-gray-700 text-white border-gray-600'
                : 'bg-gray-50 text-gray-900 border-gray-300'
            } focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-700 ease-in-out`}
          />
        </div>
        <div>
          <label className="block text-sm font-sans">Short Break (minutes)</label>
          <input
            type="number"
            name="shortBreak"
            min="1"
            value={settings.shortBreak}
            onChange={handleChange}
            className={`w-full p-3 rounded-lg border font-sans custom-number-input ${
              darkMode
                ? 'bg-gray-700 text-white border-gray-600'
                : 'bg-gray-50 text-gray-900 border-gray-300'
            } focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-700 ease-in-out`}
          />
        </div>
        <div>
          <label className="block text-sm font-sans">Long Break (minutes)</label>
          <input
            type="number"
            name="longBreak"
            min="1"
            value={settings.longBreak}
            onChange={handleChange}
            className={`w-full p-3 rounded-lg border font-sans custom-number-input ${
              darkMode
                ? 'bg-gray-700 text-white border-gray-600'
                : 'bg-gray-50 text-gray-900 border-gray-300'
            } focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-700 ease-in-out`}
          />        </div>
        
        {/* Background Sound Type */}
        <div>
          <label className="block text-sm font-sans mb-1">Background Sound Type</label>
          <div className="flex flex-col space-y-2">
            <div className="flex items-center space-x-2">
              <input
                type="radio"
                id="sound-type-music"
                name="sound-type"
                value="music"
                checked={backgroundSoundType === 'music'}
                onChange={() => {
                  setBackgroundSoundType('music');
                  chrome.storage.sync.set({ backgroundSoundType: 'music' });
                }}
                className={`w-4 h-4 ${
                  darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-300'
                }`}
              />
              <label htmlFor="sound-type-music" className="ml-2 text-sm font-sans">
                Background Music
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="radio"
                id="sound-type-brown"
                name="sound-type"
                value="brownNoise"
                checked={backgroundSoundType === 'brownNoise'}
                onChange={() => {
                  setBackgroundSoundType('brownNoise');
                  chrome.storage.sync.set({ backgroundSoundType: 'brownNoise' });
                }}
                className={`w-4 h-4 ${
                  darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-300'
                }`}
              />
              <label htmlFor="sound-type-brown" className="ml-2 text-sm font-sans">
                Brown Noise (Deep, relaxing sound)
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="radio"
                id="sound-type-white"
                name="sound-type"
                value="whiteNoise"
                checked={backgroundSoundType === 'whiteNoise'}
                onChange={() => {
                  setBackgroundSoundType('whiteNoise');
                  chrome.storage.sync.set({ backgroundSoundType: 'whiteNoise' });
                }}
                className={`w-4 h-4 ${
                  darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-300'
                }`}
              />
              <label htmlFor="sound-type-white" className="ml-2 text-sm font-sans">
                White Noise (Higher pitch background sound)
              </label>
            </div>
          </div>
        </div>
        
        {/* Background Music Volume */}
        <div>
          <label className="block text-sm font-sans mb-1">Background Sound Volume</label>
          <div className="flex items-center space-x-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
            <input
              type="range"
              min="0"
              max="100"
              value={backgroundMusicVolume * 100}
              onChange={(e) => {
                const newVolume = parseInt(e.target.value) / 100;
                setBackgroundMusicVolume(newVolume);
                chrome.storage.sync.set({ backgroundMusicVolume: newVolume });
              }}
              className="flex-1 h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
            />
            <span className="text-sm font-sans w-8 text-right">{Math.round(backgroundMusicVolume * 100)}%</span>
          </div>
        </div>
        
        {/* Upload Bell Sound */}
        <div>
          <label className="block text-sm font-sans mb-1">Upload Custom Bell Sound</label>
          <div className="flex items-center space-x-2">
            <label className="relative cursor-pointer flex-1">
              <div className="p-2 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg hover:from-purple-600 hover:to-purple-700 transition-all duration-700 ease-in-out shadow-md text-sm flex items-center justify-center space-x-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16l-4-4m0 0l4-4m-4 4h18" />
                </svg>
                <span>{selectedFile ? selectedFile.name : 'Choose Audio File'}</span>
              </div>
              <input
                type="file"
                accept="audio/*"
                onChange={handleFileChange}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </label>
            <button
              onClick={handleUploadMusic}
              disabled={!selectedFile}
              className={`p-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-700 ease-in-out shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              Upload
            </button>
          </div>
        </div>

        {/* Save & Close */}
        <button
          onClick={handleSaveChanges}
          className="w-full p-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all duration-700 ease-in-out shadow-md focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
        >
          Save Changes
        </button>
      </div>
    </div>
  );
};

export default Settings;
