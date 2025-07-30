import React, { useState, useEffect } from 'react';
import { redirectToAuthCodeFlow, client_id, isLoggedIn, getRecentTrack } from '../spotify_api';

const SpotifyPlayer = ({ darkMode }) => {
  const [spotifyLoggedIn, setSpotifyLoggedIn] = useState(false);
  const [stayLoggedIn, setStayLoggedIn] = useState(() => {
    const saved = localStorage.getItem('stayLoggedIn');
    return saved ? JSON.parse(saved) : false;
  });
  const [currentTrack, setCurrentTrack] = useState({
    name: "Focus Flow",
    artist: "Spotify",
    albumArt: "https://i.scdn.co/image/ab67616d0000485137dffdc5c5f6ee1666e26f72",
    isPlaying: false
  });

  // Check Spotify login status on component mount
  useEffect(() => {
    const checkSpotifyLogin = async () => {
      try {
        const loginStatus = await isLoggedIn();
        console.log('Spotify login status:', loginStatus);
        setSpotifyLoggedIn(loginStatus.isLoggedIn);
        
        // If logged in, get recent track info
        if (loginStatus.isLoggedIn) {
          try {
            const trackInfo = await getRecentTrack();
            setCurrentTrack({
              name: trackInfo.name,
              artist: trackInfo.artist,
              albumArt: trackInfo.wide_image,
              isPlaying: false
            });
          } catch (err) {
            console.error("Error fetching recent track:", err);
          }
        }
      } catch (error) {
        console.error('Error checking Spotify login status:', error);
      }
    };

    checkSpotifyLogin();
  }, []);

  // Function to handle login
  const handleLogin = () => {
    redirectToAuthCodeFlow(client_id, stayLoggedIn).then(() => {
      // Check login status after authentication attempt
      isLoggedIn().then(status => setSpotifyLoggedIn(status.isLoggedIn));
    });
  };

  // Function to handle logout
  const handleLogout = async () => {
    await chrome.storage.local.remove(["access_token", "refresh_token"]);
    setSpotifyLoggedIn(false);
  };

  // Function to toggle play state
  const togglePlayState = () => {
    setCurrentTrack(prev => ({...prev, isPlaying: !prev.isPlaying}));
  };

  return (
    <>
      {!spotifyLoggedIn ? (
        // Login Section - shown only when not logged in
        <div className="flex flex-col items-center justify-center mb-4 px-4">
          <div className="flex items-center justify-between w-full mb-2">
            <span className={`text-sm font-medium ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
              Stay logged in
            </span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={stayLoggedIn}
                onChange={(e) => {
                  const isChecked = e.target.checked;
                  setStayLoggedIn(isChecked);
                  localStorage.setItem('stayLoggedIn', JSON.stringify(isChecked));
                }}
              />
              <div className={`w-11 h-6 peer-focus:outline-none peer-focus:ring-2 rounded-full peer peer-checked:bg-blue-600 ${
                darkMode ? 'bg-gray-700 peer-focus:ring-blue-800' : 'bg-gray-200 peer-focus:ring-blue-500'
              }`}></div>
              <div className={`absolute left-1 top-1 w-4 h-4 bg-white border rounded-full transition-transform peer-checked:translate-x-5 ${
                darkMode ? 'border-gray-600' : 'border-gray-300'
              }`}></div>
            </label>
          </div>
          <button
            onClick={handleLogin}
            className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition flex items-center justify-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 mr-2">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.49 14.54c-.18.3-.57.38-.87.2-2.4-1.47-5.42-1.8-8.99-1-1.38.33-1.75-1.01-.37-1.34 3.9-.93 7.3-.53 10.02 1.2.3.18.38.57.21.87v.07zm1.2-2.67c-.23.36-.72.48-1.08.25-2.75-1.69-6.95-2.18-10.2-1.19-.42.13-.85-.1-.98-.51-.13-.42.1-.85.51-.98 3.72-1.13 8.35-.58 11.5 1.35.36.23.48.72.25 1.08zm.1-2.77c-.3.43-.89.57-1.35.28-3.15-1.94-8.36-2.12-12.29-1.16-.49.12-.99-.18-1.11-.67-.12-.49.18-.99.67-1.11 4.45-1.07 10.21-.86 13.76 1.34.46.27.6.89.32 1.32z"/>
            </svg>
            Login with Spotify
          </button>
        </div>
      ) : (
        // Spotify Player Controls - shown when logged in
        <div className="mb-4 rounded-lg overflow-hidden shadow-md">
          {/* Spotify player styled after the image */}
          <div className={`${darkMode ? 'bg-gradient-to-r from-[#0F2B4C] to-[#102749]' : 'bg-white'} ${darkMode ? 'text-white' : 'text-[#0F2B4C]'} p-3`}>
            {/* Spotify logo */}
            <div className="flex items-center gap-1 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" className="text-[#1DB954]">
                <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm3.669 11.538a.498.498 0 0 1-.686.165c-1.879-1.147-4.243-1.407-7.028-.77a.499.499 0 0 1-.222-.973c3.048-.696 5.662-.397 7.77.892a.5.5 0 0 1 .166.686zm.979-2.178a.624.624 0 0 1-.858.205c-2.15-1.321-5.428-1.704-7.972-.932a.625.625 0 0 1-.362-1.194c2.905-.881 6.517-.454 8.986 1.063a.624.624 0 0 1 .206.858zm.084-2.268c-2.586-1.533-6.846-1.675-9.32-.92a.75.75 0 0 1-.92-.53.751.751 0 0 1 .53-.919c2.838-.862 7.552-.689 10.527 1.071a.75.75 0 0 1-.817 1.298z"/>
              </svg>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16" className="ml-auto">
                <path d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
              </svg>
            </div>

            {/* Track info moved up */}
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 overflow-hidden rounded">
                <img 
                  src={currentTrack.albumArt || "https://i.scdn.co/image/ab67616d0000485137dffdc5c5f6ee1666e26f72"}
                  alt="Album artwork" 
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <h3 className="font-semibold text-sm">{currentTrack.name || "Aynalı Kemer"}</h3>
                <p className={`text-xs ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>{currentTrack.artist || "Barış Manço"}</p>
              </div>
            </div>

            {/* Control buttons */}
            <div className="flex items-center justify-center gap-6">
              {/* Previous button */}
              <button className={`${darkMode ? 'text-white' : 'text-gray-600'} hover:opacity-70 transition`}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M4 4a.5.5 0 0 1 1 0v3.248l6.267-3.636c.52-.302 1.233.043 1.233.696v7.384c0 .653-.713.998-1.233.696L5 8.752V12a.5.5 0 0 1-1 0V4zm7.5.633L5.696 8l5.804 3.367V4.633z"/>
                </svg>
              </button>
              
              {/* Play/pause button */}
              <button 
                onClick={togglePlayState}
                className={`${darkMode ? 'text-white' : 'text-gray-600'} hover:opacity-70 transition`}
              >
                {currentTrack.isPlaying ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M6 3.5a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-1 0V4a.5.5 0 0 1 .5-.5zm4 0a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-1 0V4a.5.5 0 0 1 .5-.5z"/>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" fill="currentColor" viewBox="0 0 16 16">
                    <path d="m11.596 8.697-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393z"/>
                  </svg>
                )}
              </button>
              
              {/* Next button */}
              <button className={`${darkMode ? 'text-white' : 'text-gray-600'} hover:opacity-70 transition`}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M12.5 4a.5.5 0 0 0-1 0v3.248L5.233 3.612C4.713 3.31 4 3.655 4 4.308v7.384c0 .653.713.998 1.233.696L11.5 8.752V12a.5.5 0 0 0 1 0V4zM5 4.633l5.804 3.367L5 11.367V4.633z"/>
                </svg>
              </button>
            </div>
          </div>
          
          {/* Logout button */}
          <div className="bg-[#0A1B33] p-2 flex justify-end">
            <button
              onClick={handleLogout}
              className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded"
            >
              Disconnect
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default SpotifyPlayer;
