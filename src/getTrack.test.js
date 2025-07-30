const { getRecentTrack } = require('./spotify_api');

global.fetch = jest.fn();
global.chrome = {
  storage: {
    local: {
      get: jest.fn(),
    },
  },
};

describe('getRecentTrack', () => {
  const mockAccessToken = 'mock-access-token';
  const mockTrackData = {
    items: [
      {
        track: {
          name: 'Shape of You',
          artists: [{ name: 'Ed Sheeran' }],
          album: {
            images: [
              { url: 'https://i.scdn.co/image/wide' },
              { url: 'https://i.scdn.co/image/medium' },
              { url: 'https://i.scdn.co/image/small' },
            ],
          },
        },
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    chrome.storage.local.get.mockImplementation((keys, callback) => {
      callback({ access_token: mockAccessToken });
    });
  });

  it('should return the most recent track details', async () => {
    fetch.mockResolvedValue({
      status: 200,
      json: () => Promise.resolve(mockTrackData),
    });

    const result = await getRecentTrack();

    expect(chrome.storage.local.get).toHaveBeenCalledWith(['access_token']);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.spotify.com/v1/me/player/recently-played?limit=1',
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${mockAccessToken}`,
        },
      }
    );
    expect(result).toEqual({
      name: 'Shape of You',
      artist: 'Ed Sheeran',
      small_image: 'https://i.scdn.co/image/small',
      wide_image: 'https://i.scdn.co/image/wide',
    });
  });

  it('should throw an error if the API request fails', async () => {
    fetch.mockResolvedValue({
      status: 401,
      json: () => Promise.resolve({ error: { message: 'Invalid access token' } }),
    });

    await expect(getRecentTrack()).rejects.toThrow('Invalid access token');
    expect(fetch).toHaveBeenCalled();
  });

  it('should handle empty track data gracefully', async () => {
    fetch.mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({ items: [] }),
    });

    await expect(getRecentTrack()).rejects.toThrow();
    expect(fetch).toHaveBeenCalled();
  });
});