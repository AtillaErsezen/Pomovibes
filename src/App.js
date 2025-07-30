import React, { useState, useEffect } from 'react';
import Timer from './components/Timer';
import TodoList from './components/TodoList';
import Calendar from './components/Calendar';
import Settings from './components/Settings';
import Quote from './components/Quote';
import BackgroundMusic from './components/BackgroundMusic';
import SpotifyPlayer from './components/SpotifyPlayer';
import './styles/tailwind.css';
import './styles/custom.css';
import { useState as useStateReact, useEffect as useEffectReact } from 'react'; // For React Strict Mode compatibility

const App = () => {
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });
  const [view, setView] = useState('dashboard');
  const [settings, setSettings] = useState({
    study: 25,
    shortBreak: 5,
    longBreak: 15,
    cycles: 4,
  });  const [isEmojiAnimating, setIsEmojiAnimating] = useState(false);
  const [floatingTimerEnabled, setFloatingTimerEnabled] = useState(true);
  const [backgroundMusicEnabled, setBackgroundMusicEnabled] = useState(false);
  // Retrieve floatingTimer and backgroundMusic state on mount (or when dashboard is rendered)
  useEffect(() => {
    console.log('Floating Timer:', floatingTimerEnabled);
    chrome.storage.sync.get(['floatingTimerEnabled', 'backgroundMusicEnabled'], (data) => {
      setFloatingTimerEnabled(data.floatingTimerEnabled ?? true);
      setBackgroundMusicEnabled(data.backgroundMusicEnabled ?? false);
    });
  }, []);
    useEffect(() => {
    chrome.storage.sync.get(['darkMode', 'settings'], (data) => {
      setDarkMode(data.darkMode ?? false);
      setSettings(data.settings ?? settings);
    });
    
    if (darkMode) {
      document.body.className = 'dark fancy-scrollbar';
      document.documentElement.classList.add('dark');
      
      // Update button class for styling
      const toggleButton = document.querySelector('.dark-mode-toggle');
      if (toggleButton) {
        toggleButton.classList.add('dark');
      }
    } else {
      document.body.className = 'light fancy-scrollbar';
      document.documentElement.classList.remove('dark');
      
      // Update button class for styling
      const toggleButton = document.querySelector('.dark-mode-toggle');
      if (toggleButton) {
        toggleButton.classList.remove('dark');
      }
    }
    
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);
  const toggleDarkMode = () => {
    setIsEmojiAnimating(true);
    const newMode = !darkMode;
    setDarkMode(newMode);
    chrome.storage.sync.set({ darkMode: newMode });
    document.body.className = newMode ? 'dark fancy-scrollbar' : 'light fancy-scrollbar';
    
    // Add animation classes based on the new mode
    const toggleButton = document.querySelector('.dark-mode-toggle');
    if (toggleButton) {
      toggleButton.classList.remove('animate-to-light', 'animate-to-dark');
      toggleButton.classList.add(newMode ? 'animate-to-light' : 'animate-to-dark');
    }
    
    localStorage.setItem('darkMode', JSON.stringify(newMode));
  };

  const updateSettings = (newSettings) => {
    setSettings(newSettings);
    chrome.storage.sync.set({ settings: newSettings });
  };
  return (    <div
  className={`min-h-[600px] w-[400px] p-6 flex flex-col transition-all duration-700 ease-in-out relative z-[1] overflow-x-hidden overflow-y-auto scroll-smooth fancy-scrollbar ${
        darkMode ? 'bg-gray-900 text-white' : 'bg-gradient-to-br from-red-50 to-pink-50 text-gray-900'
      } shadow-lg rounded-xl`}
>

      <header className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold tracking-tight">My Pomodoro</h1>        <button
          onClick={toggleDarkMode}
          onAnimationEnd={() => setIsEmojiAnimating(false)}
          className={`p-2 rounded-full dark-mode-toggle ${darkMode ? 'bg-amber-100 dark' : 'bg-gray-700'} transition-all duration-500 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500`}
          aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <span className={isEmojiAnimating ? 'animate-orbit-emoji' : ''}>
            {darkMode ? '☀️' : '🌙'}
          </span>
        </button>
      </header>      <nav className="flex space-x-3 mb-4">
        <button
          onClick={() => {
            setView('dashboard');
            // Notify components about view change
            chrome.runtime.sendMessage({ type: 'VIEW_CHANGED', view: 'dashboard' });
          }}
          className={`px-5 py-2 rounded-lg font-medium transition-all duration-700 ease-in-out shadow-md ${
            view === 'dashboard'
              ? 'bg-blue-600 text-white'
              : `bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-white`
          }`}
        >
          Dashboard
        </button>
        <button
          onClick={() => {
            setView('settings');
            // Notify components about view change
            chrome.runtime.sendMessage({ type: 'VIEW_CHANGED', view: 'settings' });
          }}
          className={`px-5 py-2 rounded-lg font-medium transition-all duration-700 ease-in-out shadow-md ${
            view === 'settings'
              ? 'bg-blue-600 text-white'
              : `bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-white`
          }`}
        >
          Settings
        </button>
      </nav>{/* Floating Timer Toggle Section */}
      <div className={`flex items-center justify-between px-4 py-3 mb-4 rounded-lg shadow-sm group relative transition-all duration-300 hover:shadow-md border-l-4 border-blue-500 ${
        darkMode ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-800'
      }`}>
        <div className="flex items-center">
          <span className={`text-sm font-medium mr-2 flex items-center ${
            darkMode ? 'text-gray-200' : 'text-gray-700'
          }`}>
            Floating Timer
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ml-1 ${
              darkMode ? 'text-gray-400' : 'text-gray-500'
            }`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </span>
          {floatingTimerEnabled ? (
            <span className="px-1.5 py-0.5 text-xs bg-green-500 text-white rounded-md animate-pulse">
              Enabled
            </span>
          ) : (
            <span className="px-1.5 py-0.5 text-xs bg-gray-400 text-white rounded-md opacity-70">
              Disabled
            </span>
          )}
        </div>
          {/* Tooltip */}
        <div className={`absolute left-0 bottom-full mb-2 w-64 rounded-md text-xs p-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none shadow-lg ${
          darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-800 text-white'
        }`}>
          Shows a notification with the current timer status while browsing other websites.
        </div>
        
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={floatingTimerEnabled}              onChange={(e) => {
                const isEnabled = e.target.checked;
                chrome.storage.sync.set({ floatingTimerEnabled: isEnabled });
                setFloatingTimerEnabled(isEnabled);
                console.log('Floating Timer:', isEnabled);
                
                // Show a brief notification when toggled
                if (isEnabled) {
                  chrome.notifications.create('floatingTimerEnabled', {
                    type: 'basic',
                    iconUrl: chrome.runtime.getURL("assets/Pomodoro_Logo_128.png"),
                    title: 'Floating Timer',
                    message: 'Floating timer has been enabled',
                    silent: true,
                  });
                }
              }}          />          <div className={`w-11 h-6 peer-focus:outline-none peer-focus:ring-2 rounded-full peer peer-checked:bg-blue-600 ${
            darkMode ? 'bg-gray-700 peer-focus:ring-blue-800' : 'bg-gray-200 peer-focus:ring-blue-500'
          }`}></div>
          <div className={`absolute left-1 top-1 w-4 h-4 bg-white border rounded-full transition-transform peer-checked:translate-x-5 ${
            darkMode ? 'border-gray-600' : 'border-gray-300'
          }`}></div>
        </label>
      </div>      {/* Background Music Toggle Section - RECREATED */}
      <div 
        className={`flex items-center justify-between px-4 py-3 mb-4 rounded-lg shadow-sm group relative transition-all duration-300 hover:shadow-md border-l-4 border-purple-500 ${
          darkMode ? 'bg-gray-800 text-white' : 'bg-green-100 text-gray-800'
        }`}
        style={{ display: 'flex !important', position: 'relative', zIndex: 5 }}
      >
        <div className="flex items-center">          <span className={`text-sm font-medium mr-2 flex items-center ${
            darkMode ? 'text-gray-200' : 'text-gray-700'
          }`}>
            Background Sound
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ml-1 ${
              darkMode ? 'text-gray-400' : 'text-gray-500'
            }`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
          </span>
          {backgroundMusicEnabled ? (
            <span className="px-1.5 py-0.5 text-xs bg-green-500 text-white rounded-md animate-pulse">
              Enabled
            </span>
          ) : (
            <span className="px-1.5 py-0.5 text-xs bg-gray-400 text-white rounded-md opacity-70">
              Disabled
            </span>
          )}
        </div>
          {/* Tooltip */}
        <div className={`absolute left-0 bottom-full mb-2 w-64 rounded-md text-xs p-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none shadow-lg ${
          darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-800 text-white'
        }`}>
          Plays background sounds during your Pomodoro sessions to help you focus. Choose between music, brown noise, or white noise in Settings.
        </div>
        
        <label className="relative inline-flex items-center cursor-pointer">          <input
            type="checkbox"
            className="sr-only peer"
            checked={backgroundMusicEnabled}
            onChange={(e) => {
              const isEnabled = e.target.checked;
              chrome.storage.sync.set({ backgroundMusicEnabled: isEnabled });
              setBackgroundMusicEnabled(isEnabled);
              console.log('Background Music:', isEnabled);
              
              // Trigger immediate status check for background music
              chrome.runtime.sendMessage({ type: 'BACKGROUND_MUSIC_TOGGLE', enabled: isEnabled });
                // Show a brief notification when toggled
              if (isEnabled) {
                chrome.notifications.create('backgroundMusicEnabled', {
                  type: 'basic',
                  iconUrl: chrome.runtime.getURL("assets/Pomodoro_Logo_128.png"),
                  title: 'Background Sound',
                  message: 'Background sound will play during study sessions. You can choose the sound type in Settings.',
                  silent: true,
                });
              }
            }}          />          <div className={`w-11 h-6 peer-focus:outline-none peer-focus:ring-2 rounded-full peer peer-checked:bg-blue-600 ${
            darkMode ? 'bg-gray-700 peer-focus:ring-blue-800' : 'bg-gray-200 peer-focus:ring-blue-500'
          }`}></div>
          <div className={`absolute left-1 top-1 w-4 h-4 bg-white border rounded-full transition-transform peer-checked:translate-x-5 ${
            darkMode ? 'border-gray-600' : 'border-gray-300'
          }`}></div>
        </label>
      </div>

      {/* Spotify Player Component */}
      <SpotifyPlayer darkMode={darkMode} />
      {/* Background Music component moved outside the view conditional to keep it always active */}
      <BackgroundMusic />
      
      <main className="flex-1 flex flex-col space-y-6 relative">{view === 'dashboard' ? (
    <>
      <Timer settings={settings} darkMode={darkMode} />
      <Quote darkMode={darkMode} />
      <TodoList darkMode={darkMode} />
      <Calendar darkMode={darkMode} />
    </>
  ) : (
    <>
      {/* ✅ BACKGROUND OVERLAY */}
      <div className="fixed inset-0 bg-black bg-opacity-30 z-40"></div>      {/* ✅ SETTINGS MODAL */}
      <Settings settings={settings}
       updateSettings={updateSettings}
        darkMode={darkMode}
         onClose={() => {
           setView('dashboard');
           // Notify components about view change
           chrome.runtime.sendMessage({ type: 'VIEW_CHANGED', view: 'dashboard' });
         }} />
    </>
  )}
</main>


      <div className="wave-container">
        <div className="wave"></div>
        <div className="wave"></div>
      </div>
    </div>
  );
};


export default App;