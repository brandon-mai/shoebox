export const LASTFM_API_KEY = import.meta.env.PUBLIC_LASTFM_API_KEY;

export interface LastFMTrack {
  artist: string;
  track: string;
  album?: string;
  albumArtist?: string;
  trackNumber?: number;
  duration?: number; // in seconds
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
  const params: Record<string, string> = {
    artist: track.artist,
    track: track.track,
    sk,
  };
  if (track.album) params.album = track.album;
  if (track.albumArtist) params.albumArtist = track.albumArtist;
  if (track.trackNumber) params.trackNumber = track.trackNumber.toString();
  if (track.duration) params.duration = Math.round(track.duration).toString();

  return lastfmRequest('track.updateNowPlaying', params);
}

export async function scrobble(track: LastFMTrack, sk: string) {
  const params: Record<string, string> = {
    artist: track.artist,
    track: track.track,
    timestamp: Math.floor(track.timestamp || Date.now() / 1000).toString(),
    sk,
  };
  if (track.album) params.album = track.album;
  if (track.albumArtist) params.albumArtist = track.albumArtist;
  if (track.trackNumber) params.trackNumber = track.trackNumber.toString();
  if (track.duration) params.duration = Math.round(track.duration).toString();

  return lastfmRequest('track.scrobble', params);
}

export async function getSession(token: string) {
  return lastfmRequest('auth.getSession', { token });
}
