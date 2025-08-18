import React, { useState, useEffect, useRef } from 'react';
import { redirectToAuthCodeFlow, client_id, isLoggedIn, getRecentTrack } from '../spotify_api';
import { createSpotifyEmbed } from '../spotify_embed';

const SpotifyPlayer = ({ darkMode }) => {
  const [spotifyLoggedIn, setSpotifyLoggedIn] = useState(false);
  const [stayLoggedIn, setStayLoggedIn] = useState(() => {
    const saved = localStorage.getItem('stayLoggedIn');
    return saved ? JSON.parse(saved) : false;
  });
  const [currentTrack, setCurrentTrack] = useState({
    name: "Focus Flow",
    artist: "Spotify",
    albumArt: "https://thumbs.dreamstime.com/b/caution-icon-sign-flat-style-isolated-warning-symbol-your-web-site-logo-app-ui-design-vector-illustration-92961182.jpg",
    isPlaying: false,
    uri: null
  });
  // Add a state for tracking if previous/next buttons should be enabled
  const [canNavigate, setCanNavigate] = useState({
    previous: false,
    next: false
  });
  const playerRef = useRef(null);
  const embedContainerRef = useRef(null);
  const embedPlayerRef = useRef(null);

  // Check Spotify login status on component mount
  useEffect(() => {
    const checkSpotifyLogin = async () => {
      try {
        const loginStatus = await isLoggedIn();
        console.log('Spotify login status:', loginStatus);
        setSpotifyLoggedIn(loginStatus.isLoggedIn);
        
        // If logged in, get track info
        if (loginStatus.isLoggedIn) {
          try {
            // Get the most recent track information
            const recentTrackInfo = await getRecentTrack();
            console.log("Track info retrieved:", recentTrackInfo);
            
            setCurrentTrack({
              name: recentTrackInfo.name,
              artist: recentTrackInfo.artist,
              albumArt: recentTrackInfo.wide_image,
              isPlaying: false,
              uri: recentTrackInfo.uri
            });
            
            // After we have track info, initialize the iframe player if container is ready
            if (embedContainerRef.current && recentTrackInfo.uri) {
              // Create the embed player if it doesn't exist yet
              if (!embedPlayerRef.current) {
                embedPlayerRef.current = createSpotifyEmbed(embedContainerRef.current);
              }
              
              // Load the track
              embedPlayerRef.current.loadTrack(recentTrackInfo.uri);
              
              // Force initial navigation state to be enabled so buttons can be clicked
              setCanNavigate({
                previous: true,
                next: true
              });
              console.log("Initial navigation enabled");
              
              // Force update of navigation status
              updateNavigationStatus();
              
              // Fetch recent tracks for navigation
              fetchRecentTracks();
            }
          } catch (err) {
            console.error("Error fetching recent track:", err);
          }
        }
      } catch (error) {
        console.error('Error checking Spotify login status:', error);
      }
    };
    
    // Function to fetch recently played tracks for navigation
    const fetchRecentTracks = async () => {
      try {
        // Get access token from storage
        const tokenData = await chrome.storage.local.get("access_token");
        const accessToken = tokenData.access_token;
        
        if (!accessToken) {
          console.log("No access token available");
          return;
        }
        
        console.log("Fetching recent tracks...");
        
        // Get the last 20 recently played tracks
        const response = await fetch(
          "https://api.spotify.com/v1/me/player/recently-played?limit=20",
          {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${accessToken}`
            }
          }
        );
        
        if (!response.ok) {
          throw new Error(`Failed to fetch recent tracks: ${response.status}`);
        }
        
        const data = await response.json();
        console.log("Recent tracks data:", data);
        
        if (data && data.items && data.items.length > 0) {
          // Format the tracks for our player
          const recentTracks = data.items.map(item => ({
            uri: item.track.uri,
            id: item.track.id,
            name: item.track.name,
            artist: item.track.artists.map(a => a.name).join(", "),
            albumArt: item.track.album.images[0]?.url || ''
          }));
          
          console.log("Formatted recent tracks:", recentTracks);
          
          // Set them in our controller and update navigation state
          if (embedPlayerRef.current) {
            embedPlayerRef.current.setRecentTracks(recentTracks);
            
            // Find the current track in the list
            const currentUri = currentTrack.uri;
            if (currentUri) {
              const currentIndex = recentTracks.findIndex(track => 
                track.uri === currentUri || 
                track.uri === `spotify:track:${currentUri.replace('spotify:track:', '')}`
              );
              
              if (currentIndex !== -1) {
                embedPlayerRef.current.currentTrackIndex = currentIndex;
              } else {
                // If current track not found in list, set to first track
                embedPlayerRef.current.currentTrackIndex = 0;
              }
            } else {
              // No current track, default to first in list
              embedPlayerRef.current.currentTrackIndex = 0;
            }
            
            // Always enable navigation when we have tracks
            setCanNavigate({
              previous: embedPlayerRef.current.currentTrackIndex > 0,
              next: embedPlayerRef.current.currentTrackIndex < recentTracks.length - 1
            });
            
            console.log("Navigation status updated:", { 
              previous: embedPlayerRef.current.currentTrackIndex > 0, 
              next: embedPlayerRef.current.currentTrackIndex < recentTracks.length - 1,
              currentIndex: embedPlayerRef.current.currentTrackIndex,
              tracksLength: recentTracks.length
            });
          }
        }
      } catch (error) {
        console.error("Error fetching recent tracks:", error);
      }
    };

    checkSpotifyLogin();
    
    // Cleanup function for component unmount
    return () => {
      // Don't stop background playback on component unmount
      // This allows music to continue playing when popup closes
      
      // Just clean up the reference
      embedPlayerRef.current = null;
    };
  }, []);
  
  // Add listener for track changes
  useEffect(() => {
    if (embedPlayerRef.current) {
      // Track change handler to update UI
      const trackChangedHandler = (trackData) => {
        if (trackData) {
          // Update current track info
          setCurrentTrack(prev => ({
            ...prev,
            name: trackData.name || prev.name,
            artist: trackData.artist || prev.artist,
            albumArt: trackData.albumArt || prev.albumArt,
            uri: trackData.uri || prev.uri
          }));
          
          // Update navigation status
          updateNavigationStatus();
        }
      };
      
      // Add the listener
      embedPlayerRef.current.on('trackChanged', trackChangedHandler);
      
      // Cleanup
      return () => {
        if (embedPlayerRef.current) {
          embedPlayerRef.current.off('trackChanged', trackChangedHandler);
        }
      };
    }
  }, [spotifyLoggedIn]);

  // Function to handle login
  const handleLogin = () => {
    redirectToAuthCodeFlow(client_id, stayLoggedIn).then(() => {
      // Check login status after authentication attempt
      isLoggedIn().then(status => setSpotifyLoggedIn(status.isLoggedIn));
    });
  };

  // Function to handle logout
  const handleLogout = async () => {
    // Stop any background playback
    if (embedPlayerRef.current) {
      await embedPlayerRef.current.stopBackgroundPlayback();
    }
    
    // Clear tokens
    await chrome.storage.local.remove(["access_token", "refresh_token"]);
    setSpotifyLoggedIn(false);
  };
  
  // Functions to handle track navigation
  const handlePreviousTrack = async () => {
    console.log("Previous track button clicked", {
      canNavigate,
      hasEmbedPlayer: !!embedPlayerRef.current,
      recentTracks: embedPlayerRef.current?.recentTracks?.length || 0
    });
    
    // Force navigation to be enabled if not already
    if (!canNavigate.previous) {
      setCanNavigate(prev => ({...prev, previous: true}));
    }
    
    try {
      if (embedPlayerRef.current) {
        if (currentTrack.isPlaying) {
          // If playing in background, use background navigation
          await embedPlayerRef.current.previousTrackBackground();
        } else {
          // Normal navigation
          await embedPlayerRef.current.previousTrack();
          
          // Get the current track after navigation
          const currentIndex = embedPlayerRef.current.currentTrackIndex;
          const tracks = embedPlayerRef.current.recentTracks;
          
          if (tracks && tracks.length > 0 && tracks[currentIndex]) {
            const track = tracks[currentIndex];
            // Update the display with the current track
            setCurrentTrack({
              ...currentTrack,
              name: track.name || "Unknown Track",
              artist: track.artist || "Unknown Artist",
              albumArt: track.albumArt || currentTrack.albumArt,
              uri: track.uri
            });
          }
        }
        
        // Update navigation status
        updateNavigationStatus();
      } else {
        console.error("Embed player reference is not available");
      }
    } catch (error) {
      console.error("Error navigating to previous track:", error);
    }
  };
  
  const handleNextTrack = async () => {
    console.log("Next track button clicked", {
      canNavigate,
      hasEmbedPlayer: !!embedPlayerRef.current,
      recentTracks: embedPlayerRef.current?.recentTracks?.length || 0
    });
    
    // Force navigation to be enabled if not already
    if (!canNavigate.next) {
      setCanNavigate(prev => ({...prev, next: true}));
    }
    
    try {
      if (embedPlayerRef.current) {
        if (currentTrack.isPlaying) {
          // If playing in background, use background navigation
          await embedPlayerRef.current.nextTrackBackground();
        } else {
          // Normal navigation
          await embedPlayerRef.current.nextTrack();
          
          // Get the current track after navigation
          const currentIndex = embedPlayerRef.current.currentTrackIndex;
          const tracks = embedPlayerRef.current.recentTracks;
          
          if (tracks && tracks.length > 0 && tracks[currentIndex]) {
            const track = tracks[currentIndex];
            // Update the display with the current track
            setCurrentTrack({
              ...currentTrack,
              name: track.name || "Unknown Track",
              artist: track.artist || "Unknown Artist",
              albumArt: track.albumArt || currentTrack.albumArt,
              uri: track.uri
            });
          }
        }
        
        // Update navigation status
        updateNavigationStatus();
      } else {
        console.error("Embed player reference is not available");
      }
    } catch (error) {
      console.error("Error navigating to next track:", error);
    }
  };
  
  // Function to update navigation button status
  const updateNavigationStatus = () => {
    if (embedPlayerRef.current && embedPlayerRef.current.recentTracks) {
      const tracks = embedPlayerRef.current.recentTracks;
      const currentIndex = embedPlayerRef.current.currentTrackIndex;
      
      console.log("Updating navigation status:", {
        tracksLength: tracks.length,
        currentIndex: currentIndex,
        hasPrevious: currentIndex > 0,
        hasNext: currentIndex < tracks.length - 1
      });
      
      // If we have tracks but index is invalid, set a default
      if (tracks.length > 0 && (currentIndex < 0 || currentIndex === undefined)) {
        embedPlayerRef.current.currentTrackIndex = 0;
      }
      
      setCanNavigate({
        previous: tracks.length > 0 && currentIndex > 0,
        next: tracks.length > 0 && currentIndex < tracks.length - 1
      });
    } else {
      // Default to enabling navigation if we can't determine state
      // This will let users try clicking and get appropriate feedback
      setCanNavigate({
        previous: true,
        next: true
      });
      console.log("No track data available to update navigation status");
    }
  };

  // Function to toggle play state - for background playback
  const togglePlayState = () => {
    if (currentTrack.uri) {
      // If not playing, start background playback
      if (!currentTrack.isPlaying) {
        // Initialize background player if needed
        if (!embedPlayerRef.current) {
          embedPlayerRef.current = createSpotifyEmbed(embedContainerRef.current);
        }
        
        // Start background playback
        embedPlayerRef.current.loadTrack(currentTrack.uri, true);
        setCurrentTrack(prev => ({...prev, isPlaying: true}));
      } else {
        // If already playing, toggle background playback
        if (embedPlayerRef.current) {
          embedPlayerRef.current.stopBackgroundPlayback();
        }
        setCurrentTrack(prev => ({...prev, isPlaying: false}));
      }
    } else {
      console.warn("Cannot toggle play - no track URI available");
      // Visual toggle only as a fallback
      setCurrentTrack(prev => ({...prev, isPlaying: !prev.isPlaying}));
    }
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
          {/* Spotify player styled section */}
          <div className={`${darkMode ? 'bg-gradient-to-r from-[#0F2B4C] to-[#102749]' : 'bg-white'} ${darkMode ? 'text-white' : 'text-[#0F2B4C]'} p-3`}>
            {/* Spotify logo */}
            <div className="flex items-center gap-1 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" className="text-[#1DB954]">
                <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm3.669 11.538a.498.498 0 0 1-.686.165c-1.879-1.147-4.243-1.407-7.028-.77a.499.499 0 0 1-.222-.973c3.048-.696 5.662-.397 7.77.892a.5.5 0 0 1 .166.686zm.979-2.178a.624.624 0 0 1-.858.205c-2.15-1.321-5.428-1.704-7.972-.932a.625.625 0 0 1-.362-1.194c2.905-.881 6.517-.454 8.986 1.063a.624.624 0 0 1 .206.858zm.084-2.268c-2.586-1.533-6.846-1.675-9.32-.92a.75.75 0 0 1-.92-.53.751.751 0 0 1 .53-.919c2.838-.862 7.552-.689 10.527 1.071a.75.75 0 0 1-.817 1.298z"/>
              </svg>
              <span className="text-sm font-medium">Spotify</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16" className="ml-auto">
                <path d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
              </svg>
            </div>

            {/* Track info */}
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 overflow-hidden rounded">
                <img 
                  src={currentTrack.albumArt || "https://thumbs.dreamstime.com/b/caution-icon-sign-flat-style-isolated-warning-symbol-your-web-site-logo-app-ui-design-vector-illustration-92961182.jpg"}
                  alt="Album artwork" 
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <h3 className="font-semibold text-sm">{currentTrack.name || "Focus Flow"}</h3>
                <p className={`text-xs ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>{currentTrack.artist || "Spotify"}</p>
              </div>
            </div>
            
            {/* Spotify iframe embed container - hidden by default */}
            <div 
              ref={embedContainerRef} 
              className={`w-full ${currentTrack.isPlaying ? 'block' : 'hidden'} mb-3`}
            ></div>
            
            {/* Player controls - Updated with navigation buttons */}
            <div className="flex items-center justify-center space-x-2 mb-3">
              {/* Previous button */}
              <button 
                onClick={handlePreviousTrack}
                disabled={!canNavigate.previous}
                className={`p-2 rounded-full flex items-center justify-center
                  ${darkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-200 hover:bg-gray-300'} 
                  ${!canNavigate.previous ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                  ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}
                aria-label="Previous track"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M4 4a.5.5 0 0 1 1 0v3.248l6.267-3.636c.54-.313 1.232.066 1.232.696v7.384c0 .63-.692 1.01-1.232.697L5 8.753V12a.5.5 0 0 1-1 0V4z"/>
                </svg>
              </button>
              
              {/* Play/Pause button */}
              <button 
                onClick={togglePlayState}
                className={`px-6 py-2 ${darkMode ? 'bg-[#1DB954] hover:bg-[#1aa34a]' : 'bg-[#1DB954] hover:bg-[#1aa34a]'} text-white rounded-full transition flex items-center justify-center`}
              >
                {currentTrack.isPlaying ? (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 16 16" className="mr-2">
                      <path d="M6 3.5a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-1 0V4a.5.5 0 0 1 .5-.5zm4 0a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-1 0V4a.5.5 0 0 1 .5-.5z"/>
                    </svg>
                    Hide Player
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 16 16" className="mr-2">
                      <path d="m11.596 8.697-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393z"/>
                    </svg>
                    Show Player
                  </>
                )}
              </button>
              
              {/* Next button */}
              <button 
                onClick={handleNextTrack}
                disabled={!canNavigate.next}
                className={`p-2 rounded-full flex items-center justify-center
                  ${darkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-200 hover:bg-gray-300'} 
                  ${!canNavigate.next ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                  ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}
                aria-label="Next track"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M12.5 4a.5.5 0 0 0-1 0v3.248L5.233 3.612C4.693 3.3 4 3.678 4 4.308v7.384c0 .63.692 1.01 1.233.697L11.5 8.753V12a.5.5 0 0 0 1 0V4z"/>
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
