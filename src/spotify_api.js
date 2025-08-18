const client_id = "cb2e07fa244f45dc91a5644f25685cd7";
const redirect_uri = chrome.identity.getRedirectURL("callback");
const track_id = "5kbX6QlSDGgprK3jVuxGt7"; // Example track ID
async function isLoggedIn() {
  const data = await chrome.storage.local.get(["refresh_token"]);
  return {
    isLoggedIn: !!data.refresh_token,
  };
}
//const code=params.get("code");
//
//if (!code){
//    redirectToAuthCodeFlow(client_id);
//}else{
//    const accessToken = await getAccessToken(clientId, code);
//}
/**
 * Get access token for code.
 * @param clientId - The Spotify client ID.
 * @param code - The authorization code received from Spotify after user login.
 */
async function generateCodeChallenge(codeVerifier) {
    const data = new TextEncoder().encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode.apply(null, [...new Uint8Array(digest)]))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}
function generateCodeVerifier(length) {
    let text = '';
    let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
/**
 * Redirects the user to Spotify's authorization code flow.
 * @param clientId - The Spotify client ID.
 * @param stayLoggedIn - Whether to keep the user logged in.
 */
async function redirectToAuthCodeFlow(clientId, stayLoggedIn = false) {
    console.log("generating code verifier...");
    const verifier = generateCodeVerifier(128);
    console.log("generating code challenge...");
    const challenge = await generateCodeChallenge(verifier);

    console.log("storing verifier in chrome storage...");
    chrome.storage.local.set({ "verifier": verifier });

    const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri,
    scope: "user-read-private user-read-email user-read-playback-state user-read-recently-played user-read-currently-playing streaming",
    code_challenge_method: "S256",
    code_challenge: challenge
  });
    console.log("redirecting to Spotify authorization...");
    chrome.identity.launchWebAuthFlow(
        { 
    url: `https://accounts.spotify.com/authorize?${params.toString()}`,
     interactive: true 
        },(redirectedTo) => {
      // parse code out of redirectedTo and call getAccessToken(...)
      const code = new URL(redirectedTo).searchParams.get('code');
      console.log("redirected to code:", code);
        if (code && stayLoggedIn) {
            getAccessTokenWithRefresh(clientId, code)
            .then(({ access_token, refresh_token }) => {
                chrome.storage.local.set({ "access_token": access_token });
                if (!refresh_token) {
                    throw new Error("No refresh token received from Spotify.");
                }
                chrome.storage.local.set({ "refresh_token": refresh_token });
            })
            .catch(error => {
                console.error("Error getting access token with refresh:", error);
            });
        } else if (code && !stayLoggedIn) {
            getAccessToken(clientId, code)
            .then(access_token => {
                chrome.storage.local.set({ "access_token": access_token });
            })
            .catch(error => {
                console.error("Error getting access token:", error);
            });
        } else {
            console.error("Authorization code not found in redirect URL.");
        }
    }
  );
    
}
async function getAccessToken(clientId, code) {
    const data = await chrome.storage.local.get(["verifier"]);
    const verifier = data.verifier;

    const params = new URLSearchParams({
        client_id: clientId,
        grant_type: "authorization_code",
        code: code,
        redirect_uri: redirect_uri,
        code_verifier: verifier
    });

    console.log("requesting access token from Spotify...");
    const result = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params
    });
    if (!result.ok) {
        throw new Error(`Failed to get access token: ${result.statusText}`);
    }
    const { access_token } = await result.json();
    if (!access_token) {
        throw new Error("Error in receiving access token from Spotify.");
    }
    return access_token;
}
async function getAccessTokenWithRefresh(clientId, code) {
   const data = await chrome.storage.local.get(["verifier"]);
   const verifier = data.verifier;

    const params = new URLSearchParams({
        client_id: clientId,
        grant_type: "authorization_code",
        code: code,
        redirect_uri: redirect_uri,
        code_verifier: verifier
    });

    console.log("requesting access token from Spotify...");
    const result = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params
    });
    if (!result.ok) {
        throw new Error(`Failed to get access token: ${result.statusText}`);
    }
    const { access_token, refresh_token } = await result.json();
    if (!access_token) {
        throw new Error("No access token received from Spotify.");
    }
    if (!refresh_token) {
        console.log("No refresh token received from Spotify.");
    }
    return { access_token, refresh_token  };
}
async function refreshAccessToken(clientId) {
    const data = await chrome.storage.local.get(["refresh_token"]);
    const refresh_token = data.refresh_token;
    if (!refresh_token) {
        console.log("Refresh token not found in storage.");
        return;
    }
    const params = new URLSearchParams({
        client_id: clientId,
        grant_type: "refresh_token",
        refresh_token: refresh_token
    });
    console.log("Refreshing access token from Spotify...");
    const result = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params
    });
    if (!result.ok) {
        throw new Error(`Failed to refresh access token: ${result.statusText}`);
    }
    const { access_token } = await result.json();
    if( !access_token) {
        throw new Error("No access token with refresh received from Spotify.");
    }
    console.log("Access token refreshed.");
    await chrome.storage.local.set({ "access_token": access_token });
    return { access_token, refresh_token };
}

async function getRecentTrack() {
    try {
        const tokenData = await chrome.storage.local.get("access_token");
        const accessToken = tokenData.access_token;
        if (!accessToken) {
            throw new Error("No access token found");
        }
        let currentTrackResponse = await fetch(
            "https://api.spotify.com/v1/me/player/currently-playing",
            {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${accessToken}`
                }
            }
        );
        if (currentTrackResponse.status === 200) {
            const currentTrack = await currentTrackResponse.json();
            if (!currentTrack.item) {
                throw new Error("No track currently playing");
            }
            console.log("Current playing track data:", currentTrack);
            return {
                name: currentTrack.item.name,
                artist: currentTrack.item.artists[0].name,
                small_image: currentTrack.item.album.images[currentTrack.item.album.images.length - 1].url,
                wide_image: currentTrack.item.album.images[0].url,
                uri: currentTrack.item.uri,
                is_playing: currentTrack.is_playing
            };
        } 
        const recentTrackResponse = await fetch(
            "https://api.spotify.com/v1/me/player/recently-played?limit=1",
            {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${accessToken}`
                }
            }
        );
        if (!recentTrackResponse.ok) {
            if (recentTrackResponse.status === 401) {
                throw new Error("Invalid access token");
            }
            throw new Error(`Error fetching recent track: ${recentTrackResponse.status}`);
        }
        const recentTrack = await recentTrackResponse.json();
        console.log("Recently playing track data:", recentTrack);
        if (!recentTrack.items || recentTrack.items.length === 0) {
            throw new Error("No recently played tracks found");
        }
        return {
            name: recentTrack.items[0].track.name,
            artist: recentTrack.items[0].track.artists[0].name,
            small_image: recentTrack.items[0].track.album.images[recentTrack.items[0].track.album.images.length - 1].url,
            wide_image: recentTrack.items[0].track.album.images[0].url,
            uri: recentTrack.items[0].track.uri,
            is_playing: false
        };
    } catch (error) {
        console.error("Error in getRecentTrack:", error);
        throw error;
    }
}
async function initializePlayer() {
    return new Promise((resolve, reject) => {
        window.onSpotifyWebPlaybackSDKReady = async () => {
            try {
                const tokenData = await chrome.storage.local.get("access_token");
                const accessToken = tokenData.access_token;
                if (!accessToken) {
                    reject(new Error("No access token found"));
                    return;
                }
                const player = new window.Spotify.Player({
                    name: 'Pomovibes Web Player',
                    getOAuthToken: cb => { cb(accessToken); },
                    volume: 0.5
                });
                player.addListener('initialization_error', ({ message }) => {
                    console.error('Failed to initialize player:', message);
                    reject(new Error(`Failed to initialize player: ${message}`));
                });
                player.addListener('authentication_error', ({ message }) => {
                    console.error('Failed to authenticate player:', message);
                    reject(new Error(`Failed to authenticate player: ${message}`));
                });
                player.addListener('account_error', ({ message }) => {
                    console.error('Premium required:', message);
                    reject(new Error(`Premium account required: ${message}`));
                });
                player.addListener('playback_error', ({ message }) => {
                    console.error('Failed to perform playback:', message);
                });
                player.addListener('ready', ({ device_id }) => {
                    console.log('Web Playback SDK ready with Device ID:', device_id);
                    chrome.storage.local.set({ "device_id": device_id });
                    resolve(player);
                });
                player.addListener('not_ready', ({ device_id }) => {
                    console.log('Device ID is not ready for playback:', device_id);
                });
                player.connect();
            } catch (error) {
                console.error('Error initializing Spotify player:', error);
                reject(error);
            }
        };
        
        // For Chrome extensions, we need to ensure the script has been loaded
        // This works because we've added the domain to content_security_policy in manifest.json
        if (!window.Spotify) {
            console.log("Loading Spotify Web Player SDK script...");
            // Create a script element with the proper permissions
            const script = document.createElement('script');
            script.id = 'spotify-player';
            script.src = 'https://sdk.scdn.co/spotify-player.js';
            script.async = true;
            document.body.appendChild(script);
        } else {
            console.log("Spotify Web Player SDK already loaded.");
            // If SDK is already loaded, trigger the callback manually
            if (typeof window.onSpotifyWebPlaybackSDKReady === 'function') {
                window.onSpotifyWebPlaybackSDKReady();
            }
        }
    });
}

// Function to play a track using Spotify Web Playback SDK
async function playTrack(uri, deviceId) {
    try {
        const tokenData = await chrome.storage.local.get("access_token");
        const accessToken = tokenData.access_token;
        
        if (!deviceId) {
            const deviceData = await chrome.storage.local.get("device_id");
            deviceId = deviceData.device_id;
        }
        
        if (!deviceId) {
            throw new Error("No device ID available");
        }
        
        // Play the track on the device
        await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
            method: 'PUT',
            body: JSON.stringify({ uris: [uri] }),
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        return true;
    } catch (error) {
        console.error("Error playing track:", error);
        throw error;
    }
}

// Export functions and client_id for use in UI
export {
  redirectToAuthCodeFlow,
  client_id,
  isLoggedIn,
  refreshAccessToken,
  getRecentTrack,
  initializePlayer,
  playTrack
};


