export const LASTFM_API_KEY = import.meta.env.PUBLIC_LASTFM_API_KEY;

export interface LastFMTrack {
  artist: string;
  track: string;
  album?: string;
  timestamp?: number;
}

export async function lastfmRequest(method: string, params: Record<string, string>) {
  const response = await fetch('/api/lastfm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, params }),
  });
  return response.json();
}

export async function updateNowPlaying(track: LastFMTrack, sk: string) {
  return lastfmRequest('track.updateNowPlaying', {
    artist: track.artist,
    track: track.track,
    sk,
  });
}

export async function scrobble(track: LastFMTrack, sk: string) {
  return lastfmRequest('track.scrobble', {
    artist: track.artist,
    track: track.track,
    timestamp: Math.floor(track.timestamp || Date.now() / 1000).toString(),
    sk,
  });
}

export async function getSession(token: string) {
  return lastfmRequest('auth.getSession', { token });
}
