import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Play, Pause, Radio, Music } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import * as lastfm from '@/lib/lastfm-utils'
import type { SpotifyTrack } from '@/lib/spotify-utils'

const DEFAULT_COVER = 'https://static.photos/abstract/200x200/2.webp'
const MIN_SCROBBLE_TIME_MS = 30000 // 30 seconds
const NP_REFRESH_INTERVAL_SECONDS = 120 // 2 minutes
const MATCH_THRESHOLD = 0.65 // 65% similarity required
const LASTFM_AUTH_URL = `https://www.last.fm/api/auth/?api_key=${import.meta.env.PUBLIC_LASTFM_API_KEY}`

interface Artist {
  name: string
  nameRomaji?: string | null
}

interface Album {
  name: string
  image?: string
}

interface Song {
  title: string
  artists: Artist[]
  albums?: Album[]
  duration?: number
}

interface ListenMoePayload {
  op: number
  t?: string
  d?: any
}

interface RadioPlayerProps {
  className?: string
}

/**
 * Skeleton component for RadioPlayer to provide a stable layout during loading/SSR.
 */
export function RadioPlayerSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex max-w-3xl flex-col sm:flex-row items-center gap-6 sm:gap-10 rounded-3xl border bg-card p-6 sm:p-8 shadow-sm", className)}>
      <Skeleton className="aspect-square w-full max-w-sm sm:w-40 sm:h-40 sm:shrink-0 rounded-xl" />
      <div className="flex flex-1 flex-col justify-center gap-4 sm:gap-6 text-center sm:text-left min-w-0 w-full">
        <div className="flex items-center justify-center sm:justify-between pt-1">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded-full" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="hidden sm:block h-4 w-20" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-3/4 mx-auto sm:mx-0" />
          <Skeleton className="h-5 w-1/2 mx-auto sm:mx-0" />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-1">
          <div className="flex items-center justify-center sm:justify-start">
            <Skeleton className="h-14 w-14 rounded-full" />
          </div>
          <div className="flex items-center justify-center sm:justify-start">
            <Skeleton className="h-14 w-14 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function RadioPlayer({ className }: RadioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [song, setSong] = useState<Song | null>(null)
  const [listeners, setListeners] = useState<number>(0)
  const [isConnected, setIsConnected] = useState(false)
  const [lastfmSession, setLastfmSession] = useState<string | null>(null)
  const [isScrobbling, setIsScrobbling] = useState(false)
  const [useSpotifyMetadata, setUseSpotifyMetadata] = useState(true)
  const [spotifyTrack, setSpotifyTrack] = useState<SpotifyTrack[] | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  
  // Ref-based state to avoid WebSocket closures/reconnections
  const isPlayingRef = useRef(isPlaying)
  const isScrobblingRef = useRef(isScrobbling)
  const lastfmSessionRef = useRef(lastfmSession)
  const listenTimeMsRef = useRef(0)
  const lastNpUpdateRef = useRef(0)
  const currentSongRef = useRef<Song | null>(null)
  const songStartTimeRef = useRef<number>(0)
  const spotifyTrackRef = useRef<SpotifyTrack[] | null>(null)
  const useSpotifyMetadataRef = useRef(useSpotifyMetadata)

  // Sync refs with state
  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])
  useEffect(() => { isScrobblingRef.current = isScrobbling }, [isScrobbling])
  useEffect(() => { lastfmSessionRef.current = lastfmSession }, [lastfmSession])
  useEffect(() => { useSpotifyMetadataRef.current = useSpotifyMetadata }, [useSpotifyMetadata])
  useEffect(() => { spotifyTrackRef.current = spotifyTrack }, [spotifyTrack])

  const getArtistNames = (s: Song | null) => s?.artists.map(a => a.name).join(', ') || 'Unknown Artist'
  const getArtistRomaji = (s: Song | null) => s?.artists.map(a => a.nameRomaji || a.name).join(', ') || ''

  // Unified metadata selector for scrobbling
  const getScrobbleMetadata = (s: Song | null, st: SpotifyTrack[] | null, useSpotify: boolean) => {
    if (!s) return null
    let artist = getArtistNames(s)
    let track = s.title
    let album = s.albums?.[0]?.name || ''
    let duration = s.duration ? s.duration : undefined

    if (useSpotify && st && st.length > 0 && (st[0].score || 0) >= MATCH_THRESHOLD) {
      artist = st[0].artist
      track = st[0].name
      album = st[0].album
      duration = st[0].duration_ms / 1000
    }
    return { artist, track, album, duration }
  }

  // Unified Scrobbling Helpers
  const handleUpdateNowPlaying = (s: Song | null) => {
    if (!isScrobblingRef.current || !lastfmSessionRef.current) return
    const meta = getScrobbleMetadata(s, spotifyTrackRef.current, useSpotifyMetadataRef.current)
    if (meta) {
      lastfm.updateNowPlaying(meta, lastfmSessionRef.current).catch(() => {})
    }
  }

  const handleScrobble = (s: Song | null, timestamp: number) => {
    if (!isScrobblingRef.current || !lastfmSessionRef.current || !s) return
    const meta = getScrobbleMetadata(s, spotifyTrackRef.current, useSpotifyMetadataRef.current)
    if (meta) {
      console.log(`[Last.fm] Scrobbling: ${meta.track} by ${meta.artist}`)
      lastfm.scrobble({ ...meta, timestamp }, lastfmSessionRef.current).catch(err => console.error(err))
    }
  }

  // Initialize and check Last.fm session
  useEffect(() => {
    setIsMounted(true)
    const session = localStorage.getItem('lastfm_session')
    const scrobbleEnabled = localStorage.getItem('is_scrobbling') === 'true'
    const useSpotifyRaw = localStorage.getItem('use_spotify_metadata')
    const useSpotifyEnabled = useSpotifyRaw === null ? true : useSpotifyRaw === 'true'
    
    setLastfmSession(session)
    setIsScrobbling(scrobbleEnabled)
    setUseSpotifyMetadata(useSpotifyEnabled)

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      if (event.data.type === 'lastfm_auth_success') {
        const { sessionKey } = event.data
        setLastfmSession(sessionKey)
        setIsScrobbling(true)
        localStorage.setItem('is_scrobbling', 'true')
      }
    }

    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => { audioRef.current?.play(); setIsPlaying(true) })
      navigator.mediaSession.setActionHandler('pause', () => { audioRef.current?.pause(); setIsPlaying(false) })
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  // Single Background Timer (1s ticks)
  useEffect(() => {
    const timer = setInterval(() => {
      if (isPlayingRef.current && isConnected) {
        listenTimeMsRef.current += 1000
        
        // Periodic Now Playing refresh (every 2 minutes)
        lastNpUpdateRef.current += 1
        if (lastNpUpdateRef.current >= NP_REFRESH_INTERVAL_SECONDS) {
          if (currentSongRef.current) {
            console.log('[Last.fm] Periodic NP update')
            handleUpdateNowPlaying(currentSongRef.current)
          }
          lastNpUpdateRef.current = 0
        }
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [isConnected])

  // WebSocket Connection (Single Stable Connection)
  useEffect(() => {
    const connectWS = () => {
      const ws = new WebSocket('wss://listen.moe/gateway_v2')
      wsRef.current = ws

      ws.onopen = () => setIsConnected(true)
      ws.onclose = () => {
        setIsConnected(false)
        if (heartbeatRef.current) clearInterval(heartbeatRef.current)
        setTimeout(connectWS, 5000) // Reconnect
      }

      ws.onmessage = (event) => {
        try {
          const payload: ListenMoePayload = JSON.parse(event.data)
          if (payload.op === 0) {
            const interval = payload.d.heartbeat
            if (heartbeatRef.current) clearInterval(heartbeatRef.current)
            heartbeatRef.current = setInterval(() => {
              if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 9 }))
            }, interval / 2)
          } else if (payload.op === 1 && (payload.t === 'TRACK_UPDATE' || payload.t === 'TRACK_UPDATE_REQUEST')) {
            const newSong = payload.d.song as Song
            
            // CONCLUDE PREVIOUS SONG if different
            if (currentSongRef.current && (currentSongRef.current.title !== newSong.title)) {
              const threshold = Math.min(MIN_SCROBBLE_TIME_MS, (currentSongRef.current.duration || 60) * 500)
              if (listenTimeMsRef.current >= threshold) {
                handleScrobble(currentSongRef.current, Math.floor(songStartTimeRef.current / 1000))
              }
            }

            // RESET FOR NEW SONG
            setSong(newSong)
            setSpotifyTrack(null)
            setListeners(payload.d.listeners || 0)
            currentSongRef.current = newSong
            listenTimeMsRef.current = 0
            lastNpUpdateRef.current = 0
            songStartTimeRef.current = Date.now()

            // Spotify Match (Anonymous Search via Backend Scoring Proxy)
            const artistNames = getArtistNames(newSong)
            const artistRomaji = getArtistRomaji(newSong)
            const albumName = newSong.albums?.[0]?.name || ''
            const query = `${newSong.title} ${artistNames}`
            const params = new URLSearchParams({
              q: query,
              title: newSong.title,
              artist: artistNames,
              artistRomaji: artistRomaji,
              album: albumName,
              duration: (newSong.duration || 0).toString()
            })

            setIsSearching(true)
            fetch(`/api/spotify-search?${params.toString()}`)
              .then(res => res.json())
              .then(data => {
                // if (data.debug) {
                //   console.log('[Spotify Match Debug]', data.debug);
                // }
                const tracks = Array.isArray(data) ? data : (data.results || []);
                if (tracks.length > 0) {
                  setSpotifyTrack(tracks)
                } else {
                  setSpotifyTrack(null)
                }
              })
              .catch(() => setSpotifyTrack(null))
              .finally(() => setIsSearching(false))

            // Immediate Now Playing (Radio metadata by default, updated on match)
            if (isPlayingRef.current) {
              // Use Radio metadata for immediate NP update on new song
              const meta = getScrobbleMetadata(newSong, null, false)
              if (meta && lastfmSessionRef.current && isScrobblingRef.current) {
                lastfm.updateNowPlaying(meta, lastfmSessionRef.current).catch(() => {})
              }
            }

            // Update Media Session
            if ('mediaSession' in navigator) {
              const artistNames = getArtistNames(newSong)
              const albumImages = newSong.albums?.[0]?.image 
                ? [{ src: `https://cdn.listen.moe/covers/${newSong.albums[0].image}`, sizes: '512x512', type: 'image/jpeg' }]
                : [{ src: DEFAULT_COVER, sizes: '512x512', type: 'image/webp' }]
              navigator.mediaSession.metadata = new MediaMetadata({
                title: newSong.title, artist: artistNames,
                album: newSong.albums?.[0]?.name || 'LISTEN.moe', artwork: albumImages
              })
              if ('setPositionState' in navigator.mediaSession) {
                navigator.mediaSession.setPositionState({ duration: Infinity, playbackRate: 1, position: 0 });
              }
            }
          }
        } catch (err) { console.error('[Radio] WS parse error', err) }
      }
    }

    connectWS()
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      if (wsRef.current) wsRef.current.close()
    }
  }, [])

  const toggleScrobbling = () => {
    if (!lastfmSession) {
      window.open(`${LASTFM_AUTH_URL}&cb=${encodeURIComponent(window.location.origin + '/lastfm-callback')}`, '_blank')
      return
    }
    const newVal = !isScrobbling
    setIsScrobbling(newVal)
    localStorage.setItem('is_scrobbling', String(newVal))
    // Update NP immediately if toggling ON
    if (newVal && song && isPlaying) {
      handleUpdateNowPlaying(song)
    }
  }

  const toggleSpotifyMetadata = () => {
    const newVal = !useSpotifyMetadata
    setUseSpotifyMetadata(newVal)
    localStorage.setItem('use_spotify_metadata', String(newVal))
    if (song && isPlaying) {
      handleUpdateNowPlaying(song)
    }
  }

  const togglePlay = () => {
    if (!audioRef.current) return
    if (isPlaying) { audioRef.current.pause() } else {
      if (audioRef.current.paused) audioRef.current.load()
      audioRef.current.volume = 0.5
      audioRef.current.play().catch(() => {})
      if (song) {
        handleUpdateNowPlaying(song)
      }
    }
    setIsPlaying(!isPlaying)
  }

  // Show skeleton if not mounted (SSR) or still connecting without initial metadata
  if (!isMounted || (!isConnected && !song)) {
    return <RadioPlayerSkeleton className={className} />
  }

  const coverUrl = song?.albums?.[0]?.image ? `https://cdn.listen.moe/covers/${song.albums[0].image}` : null

  return (
    <div className={cn("flex max-w-3xl flex-col sm:flex-row items-center gap-6 sm:gap-10 rounded-3xl border bg-card p-6 sm:p-8 shadow-sm", className)}>
      <audio ref={audioRef} src="https://listen.moe/stream" preload="metadata" />
      <div className="relative aspect-square w-full max-w-sm sm:w-40 sm:h-40 sm:shrink-0 overflow-hidden rounded-xl shadow-md border bg-muted">
        <img src={coverUrl || DEFAULT_COVER} alt={song?.title || "Album Art"} 
          className="h-full w-full object-cover transition-transform duration-700 hover:scale-105" />
      </div>
      <div className="flex flex-1 flex-col justify-center gap-4 sm:gap-6 text-center sm:text-left min-w-0 w-full">
        <div className="flex items-center justify-center sm:justify-between text-xs font-medium text-muted-foreground/70 uppercase tracking-wider">
          <div className="flex items-center gap-2">
            <Radio className={cn("h-4 w-4", isConnected ? "text-green-500 animate-pulse" : "text-destructive")} />
            <span>{isConnected ? "Live broadcast" : "Connecting..."}</span>
          </div>
          {listeners > 0 && <span className="hidden sm:inline-block">{listeners.toLocaleString()} listeners</span>}
        </div>
        <div className="flex flex-col gap-1">
          <h3 className="line-clamp-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl leading-tight">
            {song?.title || "Waiting for track data..."}
          </h3>
          <p className="line-clamp-1 text-base sm:text-lg text-muted-foreground/80 font-medium italic">
            {song ? getArtistNames(song) : "LISTEN.moe"}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-6 sm:gap-4 pt-1">
          <div className="flex items-center justify-center sm:justify-start">
            <Button variant="default" size="icon" className="h-14 w-14 rounded-full shadow-lg transition-all active:scale-90 hover:scale-105 bg-primary text-primary-foreground"
              onClick={togglePlay} aria-label={isPlaying ? "Pause" : "Play"}>
              {isPlaying ? (<Pause className="h-6 w-6" />) : (<Play className="h-6 w-6 ml-1" fill="currentColor" />)}
            </Button>
          </div>

          <div className="flex items-center justify-center sm:justify-start gap-0 w-full sm:w-auto min-h-[56px] overflow-visible">
            <Button variant="ghost" size="icon" onClick={toggleScrobbling} title={lastfmSession ? "Scrobbling" : "Connect Last.fm"}
              className={cn("h-14 w-14 rounded-full transition-all border border-transparent shrink-0 z-20", isScrobbling && lastfmSession ? "text-red-500 bg-red-500/10 border-red-500/20" : "text-muted-foreground hover:bg-muted")}>
              <Music className="h-6 w-6" />
            </Button>
            
            {/* Connecting Bridge - Always occupies space, faint when inactive */}
            <div className={cn(
               "relative flex items-center h-14 px-0 transition-all duration-700 w-12 sm:w-16 shrink-0",
               (!isSearching && spotifyTrack === null) 
                 ? "opacity-0 pointer-events-none" 
                 : (isScrobbling && spotifyTrack && spotifyTrack.length > 0 && (spotifyTrack[0].score ?? 0) >= MATCH_THRESHOLD) 
                   ? "opacity-100" 
                   : "opacity-40"
            )}>
              <div className={cn(
                "w-full h-px transition-all duration-500",
                (isScrobbling && spotifyTrack && spotifyTrack.length > 0 && (spotifyTrack[0].score ?? 0) >= MATCH_THRESHOLD && useSpotifyMetadata) 
                  ? "border-t-2 border-dotted border-red-500/60" 
                  : "border-t border-muted-foreground/20"
              )} />
              <button 
                onClick={toggleSpotifyMetadata}
                disabled={!(isScrobbling && spotifyTrack && spotifyTrack.length > 0 && (spotifyTrack[0].score ?? 0) >= MATCH_THRESHOLD)}
                title="Use Spotify Metadata for Scrobbling"
                className={cn(
                  "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center z-30 transition-all",
                  (isScrobbling && spotifyTrack && spotifyTrack.length > 0 && (spotifyTrack[0].score ?? 0) >= MATCH_THRESHOLD) 
                    ? "cursor-pointer group/toggle" 
                    : "cursor-default pointer-events-none"
                )}
              >
                <div className={cn(
                  "h-3 w-3 rounded-full border-2 transition-all duration-500",
                  (isScrobbling && spotifyTrack && spotifyTrack.length > 0 && (spotifyTrack[0].score ?? 0) >= MATCH_THRESHOLD) 
                    ? (useSpotifyMetadata 
                        ? "bg-red-500 border-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)] group-hover/toggle:scale-125" 
                        : "bg-background border-muted-foreground/30 group-hover/toggle:border-muted-foreground/60 group-hover/toggle:scale-125")
                    : "bg-muted border-muted-foreground/10"
                )} />
              </button>
            </div>

            {isSearching && (
               <div className="flex items-center gap-3 rounded-2xl bg-muted/30 p-2.5 pr-4 border border-dashed border-muted-foreground/20 animate-pulse w-full max-w-[180px] sm:max-w-[240px] shrink min-w-0">
                 <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted border border-muted-foreground/10">
                   <Music className="h-5 w-5 text-muted-foreground/40" />
                 </div>
                 <div className="flex flex-1 flex-col gap-1.5 min-w-0">
                   <Skeleton className="h-2 w-16" />
                   <Skeleton className="h-3 w-24" />
                 </div>
               </div>
            )}

            {!isSearching && spotifyTrack !== null && (
              spotifyTrack.length > 0 && spotifyTrack[0].score !== undefined && spotifyTrack[0].score >= MATCH_THRESHOLD ? (
                <div className={cn(
                  "flex items-center gap-2 sm:gap-3 rounded-2xl p-2 sm:p-2.5 sm:pr-4 border transition-colors duration-500 animate-in fade-in slide-in-from-bottom-2 max-w-[180px] sm:max-w-[240px] shrink min-w-0",
                  useSpotifyMetadata && isScrobbling 
                    ? "bg-emerald-500/8 border-red-500/50 ring-1 ring-red-500/20" 
                    : "bg-emerald-500/10 border-emerald-500/10"
                )}>
                  <div className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg overflow-hidden border transition-colors duration-500",
                    useSpotifyMetadata && isScrobbling ? "bg-emerald-500/20 border-red-500/20" : "bg-emerald-500/20 border-emerald-500/10"
                  )}>
                    {spotifyTrack[0].image ? (
                      <img src={spotifyTrack[0].image} alt={spotifyTrack[0].name} className="h-full w-full object-cover" />
                    ) : (
                      <Music className="h-5 w-5 text-emerald-500" />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col min-w-0 text-left overflow-hidden">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[9px] font-black uppercase tracking-widest leading-none truncate text-emerald-500">Spotify</span>
                      <span className="text-[8px] font-bold tabular-nums whitespace-nowrap text-emerald-500/60">
                        ({Math.round(spotifyTrack[0].score * 100)}%)
                      </span>
                    </div>
                    <a href={spotifyTrack[0].url} target="_blank" rel="noopener noreferrer" 
                      className="line-clamp-1 text-sm font-bold text-foreground hover:underline decoration-emerald-500/50 underline-offset-2 leading-tight">
                      {spotifyTrack[0].name}
                    </a>
                    <p className="line-clamp-1 text-[11px] text-muted-foreground/70 font-medium leading-tight">{spotifyTrack[0].artist}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-2xl bg-muted/30 p-2.5 px-4 border border-muted-foreground/5 animate-in fade-in duration-500 max-w-[240px] sm:max-w-[240px] opacity-60 shrink min-w-0 overflow-hidden">
                  <Music className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                  <span className="text-[11px] font-medium text-muted-foreground leading-tight whitespace-nowrap">
                    No matching track on Spotify
                  </span>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
