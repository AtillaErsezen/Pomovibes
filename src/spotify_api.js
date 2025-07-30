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
    scope: "user-read-private user-read-email",
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
    const track_data = await fetch(
        "https://api.spotify.com/v1/me/player/recently-played",
        {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${await chrome.storage.local.get("access_token")}`,
                "limit": 1,
            }
        }
    );
    const track = await track_data.json();
    return {
        name: track.items[0].track.name,
        artist: track.items[0].track.artists[0].name,
        small_image: track.items[0].track.album.images[track.items[0].track.album.images.length - 1].url, //widest to smallest
        wide_image: track.items[0].track.album.images[0].url,
    };
}
// Export functions and client_id for use in UI
export {
  redirectToAuthCodeFlow,
  client_id,
  isLoggedIn,
  refreshAccessToken,
  getRecentTrack
};


