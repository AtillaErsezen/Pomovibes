// This file handles the Spotify embedded player functionality
// which is more compatible with Chrome extension CSP restrictions
// and supports background playback using offscreen documents

// Spotify Embed Player Controller class
class SpotifyEmbedController {
  constructor() {
    this.iframe = null;
    this.container = null;
    this.currentTrackId = null;
    this.isPlaying = false;
    this.isVisible = false;
    this.isBackgroundPlay = false;
    this.listeners = {
      playStateChanged: [],
      trackChanged: []
    };
    this.recentTracks = []; // Add a list to store recently played tracks
    this.currentTrackIndex = -1; // Track the current position in the recent tracks list
  }

  // Initialize the player with a container element
  initialize(container) {
    this.container = container;
    return this;
  }

  // Load a track by URI
  loadTrack(trackUri, useBackground = false) {
    // Store the track URI for background playback
    this.trackUri = trackUri;
    this.isBackgroundPlay = useBackground;
    
    // Find track in recent tracks list and update index
    if (trackUri) {
      const normalizedUri = trackUri.startsWith('spotify:track:') 
        ? trackUri 
        : `spotify:track:${trackUri}`;
        
      const trackIndex = this.recentTracks.findIndex(track => 
        track.uri === trackUri || track.uri === normalizedUri);
      
      if (trackIndex >= 0) {
        this.currentTrackIndex = trackIndex;
      }
    }
    
    if (useBackground) {
      // Use offscreen document for background playback
      this._setupBackgroundPlayback(trackUri);
      return this;
    }
    
    if (!this.container) {
      console.error("Container not set. Call initialize() first.");
      return this;
    }

    if (!trackUri) {
      console.error("No track URI provided for Spotify embed");
      return this;
    }

    // Convert Spotify URI to proper format if needed
    let spotifyId = trackUri;
    if (trackUri.startsWith('spotify:track:')) {
      spotifyId = trackUri.replace('spotify:track:', '');
    }

    // Only create a new iframe if the track is different or iframe doesn't exist
    if (this.currentTrackId !== spotifyId || !this.iframe) {
      this.currentTrackId = spotifyId;
      this.container.innerHTML = '';
      
      // Create the iframe element
      this.iframe = document.createElement('iframe');
      this.iframe.src = `https://open.spotify.com/embed/track/${spotifyId}?utm_source=generator`;
      this.iframe.width = "100%";
      this.iframe.height = "152";  // Height that shows player controls
      this.iframe.frameBorder = "0";
      this.iframe.allowTransparency = true;
      this.iframe.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
      this.iframe.loading = "lazy";
      this.iframe.style.borderRadius = "12px";
      
      // Add to container
      this.container.appendChild(this.iframe);
      
      // Notify listeners
      this._notifyTrackChanged(trackUri);
    }
    
    return this;
  }

  // Toggle visibility of the player
  toggleVisibility() {
    if (!this.iframe) return this;
    
    this.isVisible = !this.isVisible;
    this.iframe.style.display = this.isVisible ? "block" : "none";
    return this;
  }

  // Show the player
  show() {
    if (!this.iframe) return this;
    
    this.isVisible = true;
    this.iframe.style.display = "block";
    return this;
  }

  // Hide the player
  hide() {
    if (!this.iframe) return this;
    
    this.isVisible = false;
    this.iframe.style.display = "none";
    return this;
  }

  // Add an event listener
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
    return this;
  }

  // Remove an event listener
  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
    return this;
  }

  // Notify all listeners of an event
  _notifyPlayStateChanged(isPlaying) {
    this.isPlaying = isPlaying;
    this.listeners.playStateChanged.forEach(callback => {
      try {
        callback(isPlaying);
      } catch (error) {
        console.error("Error in playStateChanged callback:", error);
      }
    });
  }

  _notifyTrackChanged(trackUri) {
    this.listeners.trackChanged.forEach(callback => {
      try {
        callback(trackUri);
      } catch (error) {
        console.error("Error in trackChanged callback:", error);
      }
    });
  }
  
  // Add a method to set recent tracks list
  setRecentTracks(tracks) {
    if (!tracks || !Array.isArray(tracks)) return this;
    
    this.recentTracks = tracks.filter(track => track && track.uri);
    return this;
  }
  
  // Add a track to recent tracks and set as current
  addToRecentTracks(trackData) {
    if (!trackData || !trackData.uri) return this;
    
    // Avoid duplicates at the end of the list
    if (this.recentTracks.length > 0 && 
        this.recentTracks[this.recentTracks.length - 1].uri === trackData.uri) {
      return this;
    }
    
    this.recentTracks.push(trackData);
    this.currentTrackIndex = this.recentTracks.length - 1;
    
    // Limit the size of the recent tracks list (optional)
    if (this.recentTracks.length > 50) {
      this.recentTracks = this.recentTracks.slice(-50);
      this.currentTrackIndex = this.recentTracks.length - 1;
    }
    
    return this;
  }
  
  // Navigate to previous track
  previousTrack() {
    console.log("Previous track requested", {
      hasRecentTracks: !!this.recentTracks?.length,
      currentTrackIndex: this.currentTrackIndex,
      recentTracksLength: this.recentTracks?.length || 0
    });
    
    // Handle edge cases better
    if (!this.recentTracks || !Array.isArray(this.recentTracks)) {
      console.log("Recent tracks list not initialized");
      this.recentTracks = [];
      return this;
    }
    
    if (this.recentTracks.length <= 1) {
      console.log("Not enough tracks for navigation");
      return this;
    }
    
    // If index is invalid, reset to last track
    if (this.currentTrackIndex < 0 || this.currentTrackIndex >= this.recentTracks.length) {
      this.currentTrackIndex = this.recentTracks.length - 1;
    }
    
    // If at first track, don't go back further
    if (this.currentTrackIndex <= 0) {
      console.log("Already at first track");
      return this;
    }
    
    // Navigate to previous
    this.currentTrackIndex--;
    const prevTrack = this.recentTracks[this.currentTrackIndex];
    
    if (!prevTrack || !prevTrack.uri) {
      console.error("Previous track has no URI");
      return this;
    }
    
    this.loadTrack(prevTrack.uri, this.isBackgroundPlay);
    this._notifyTrackChanged(prevTrack);
    
    return prevTrack;
  }
  
  // Navigate to next track
  nextTrack() {
    console.log("Next track requested", {
      hasRecentTracks: !!this.recentTracks?.length,
      currentTrackIndex: this.currentTrackIndex,
      recentTracksLength: this.recentTracks?.length || 0
    });
    
    // Handle edge cases better
    if (!this.recentTracks || !Array.isArray(this.recentTracks)) {
      console.log("Recent tracks list not initialized");
      this.recentTracks = [];
      return this;
    }
    
    if (this.recentTracks.length <= 1) {
      console.log("Not enough tracks for navigation");
      return this;
    }
    
    // If index is invalid, reset to first track
    if (this.currentTrackIndex < 0 || this.currentTrackIndex >= this.recentTracks.length) {
      this.currentTrackIndex = 0;
    }
    
    // If at last track, don't go further
    if (this.currentTrackIndex >= this.recentTracks.length - 1) {
      console.log("Already at last track");
      return this;
    }
    
    this.currentTrackIndex++;
    const nextTrack = this.recentTracks[this.currentTrackIndex];
    
    if (!nextTrack || !nextTrack.uri) {
      console.error("Next track has no URI");
      return this;
    }
    
    this.loadTrack(nextTrack.uri, this.isBackgroundPlay);
    this._notifyTrackChanged(nextTrack);
    
    return nextTrack;
  }
  
  // Set up background playback using offscreen document
  async _setupBackgroundPlayback(trackUri) {
    if (!trackUri) return this;
    
    // Convert Spotify URI to proper format if needed
    let spotifyId = trackUri;
    if (trackUri.startsWith('spotify:track:')) {
      spotifyId = trackUri.replace('spotify:track:', '');
    }
    
    // Store the current track ID for later reference
    this.currentTrackId = spotifyId;
    
    // Add track to recent tracks list if it's not already in our navigation history
    if (trackUri) {
      const normalizedUri = trackUri.startsWith('spotify:track:') 
        ? trackUri 
        : `spotify:track:${trackUri}`;
        
      // If the track isn't already in our list or we're at a different position, add it
      const trackIndex = this.recentTracks.findIndex(track => 
        track.uri === trackUri || track.uri === normalizedUri);
      
      if (trackIndex === -1) {
        this.addToRecentTracks({
          uri: normalizedUri,
          name: "Unknown Track", // We don't have metadata here
          artist: "Unknown Artist",
          albumArt: ""
        });
      }
    }
    
    try {
      // Check if offscreen document exists, create if not
      if (!await chrome.offscreen.hasDocument()) {
        await chrome.offscreen.createDocument({
          url: 'src/offscreen.html',
          reasons: ['AUDIO_PLAYBACK'],
          justification: 'Playing Spotify music in background'
        });
      }
      
      // Send message to offscreen document to load Spotify embed
      chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'playSpotifyTrack',
        trackId: spotifyId
      });
      
      // Set as playing
      this.isPlaying = true;
      this._notifyPlayStateChanged(true);
      
    } catch (error) {
      console.error('Error setting up background playback:', error);
    }
    
    return this;
  }
  
  // Control background playback
  async toggleBackgroundPlayback() {
    if (!this.trackUri) return this;
    
    try {
      chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'togglePlayback',
        isPlaying: !this.isPlaying
      });
      
      this.isPlaying = !this.isPlaying;
      this._notifyPlayStateChanged(this.isPlaying);
      
    } catch (error) {
      console.error('Error toggling background playback:', error);
    }
    
    return this;
  }
  
  // Close background playback when done
  async stopBackgroundPlayback() {
    try {
      if (await chrome.offscreen.hasDocument()) {
        chrome.runtime.sendMessage({
          target: 'offscreen',
          type: 'stopPlayback'
        });
        
        // Only close the document if we're stopping playback
        // Let Chrome manage the document lifecycle otherwise
        await chrome.offscreen.closeDocument();
      }
      
      this.isPlaying = false;
      this._notifyPlayStateChanged(false);
      
    } catch (error) {
      console.error('Error stopping background playback:', error);
    }
    
    return this;
  }
  
  // Navigate to previous track in background
  async previousTrackBackground() {
    if (!this.recentTracks.length || this.currentTrackIndex <= 0) {
      console.log("No previous tracks available");
      return this;
    }
    
    this.currentTrackIndex--;
    const prevTrack = this.recentTracks[this.currentTrackIndex];
    
    // Use background playback for the previous track
    await this._setupBackgroundPlayback(prevTrack.uri);
    this._notifyTrackChanged(prevTrack);
    
    return this;
  }
  
  // Navigate to next track in background
  async nextTrackBackground() {
    if (!this.recentTracks.length || this.currentTrackIndex >= this.recentTracks.length - 1) {
      console.log("No next tracks available");
      return this;
    }
    
    this.currentTrackIndex++;
    const nextTrack = this.recentTracks[this.currentTrackIndex];
    
    // Use background playback for the next track
    await this._setupBackgroundPlayback(nextTrack.uri);
    this._notifyTrackChanged(nextTrack);
    
    return this;
  }
}

// Helper function to create an embed controller
function createSpotifyEmbed(container) {
  return new SpotifyEmbedController().initialize(container);
}

// Export functions for use in other files
export { createSpotifyEmbed, SpotifyEmbedController };
