import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Play, Pause, Radio, Music } from 'lucide-react'
import { cn } from '@/lib/utils'
import * as lastfm from '@/lib/lastfm-utils'

const DEFAULT_COVER = 'https://static.photos/abstract/200x200/2.webp'
const MIN_SCROBBLE_TIME_MS = 30000 // 30 seconds
const NP_REFRESH_INTERVAL_SECONDS = 120 // 2 minutes
const LASTFM_AUTH_URL = `https://www.last.fm/api/auth/?api_key=${import.meta.env.PUBLIC_LASTFM_API_KEY}`

interface Artist {
  name: string
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

export function RadioPlayer({ className }: RadioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [song, setSong] = useState<Song | null>(null)
  const [listeners, setListeners] = useState<number>(0)
  const [isConnected, setIsConnected] = useState(false)
  const [lastfmSession, setLastfmSession] = useState<string | null>(null)
  const [isScrobbling, setIsScrobbling] = useState(false)
  
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

  // Sync refs with state
  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])
  useEffect(() => { isScrobblingRef.current = isScrobbling }, [isScrobbling])
  useEffect(() => { lastfmSessionRef.current = lastfmSession }, [lastfmSession])

  const getArtistNames = (s: Song | null) => s?.artists.map(a => a.name).join(', ') || 'Unknown Artist'

  // Initialize and check Last.fm session
  useEffect(() => {
    const session = localStorage.getItem('lastfm_session')
    const scrobbleEnabled = localStorage.getItem('is_scrobbling') === 'true'
    setLastfmSession(session)
    setIsScrobbling(scrobbleEnabled)

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
          if (isScrobblingRef.current && lastfmSessionRef.current && currentSongRef.current) {
            console.log('[Last.fm] Periodic NP update')
            lastfm.updateNowPlaying({
              artist: getArtistNames(currentSongRef.current),
              track: currentSongRef.current.title
            }, lastfmSessionRef.current.toString()).catch(() => {})
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
              if (isScrobblingRef.current && lastfmSessionRef.current) {
                const threshold = Math.min(MIN_SCROBBLE_TIME_MS, (currentSongRef.current.duration || 60) * 500)
                if (listenTimeMsRef.current >= threshold) {
                  console.log(`[Last.fm] Scrobbling: ${currentSongRef.current.title} (${listenTimeMsRef.current}ms)`)
                  lastfm.scrobble({
                    artist: getArtistNames(currentSongRef.current),
                    track: currentSongRef.current.title,
                    timestamp: Math.floor(songStartTimeRef.current / 1000)
                  }, lastfmSessionRef.current).catch(err => console.error(err))
                }
              }
            }

            // RESET FOR NEW SONG
            setSong(newSong)
            setListeners(payload.d.listeners || 0)
            currentSongRef.current = newSong
            listenTimeMsRef.current = 0
            lastNpUpdateRef.current = 0
            songStartTimeRef.current = Date.now()

            // Immediate Now Playing
            if (isScrobblingRef.current && lastfmSessionRef.current && isPlayingRef.current) {
              lastfm.updateNowPlaying({
                artist: getArtistNames(newSong),
                track: newSong.title
              }, lastfmSessionRef.current).catch(() => {})
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
    if (newVal && song && isPlaying) {
      lastfm.updateNowPlaying({ artist: getArtistNames(song), track: song.title }, lastfmSession).catch(() => {})
    }
  }

  const togglePlay = () => {
    if (!audioRef.current) return
    if (isPlaying) { audioRef.current.pause() } else {
      if (audioRef.current.paused) audioRef.current.load()
      audioRef.current.play().catch(() => {})
      if (isScrobbling && lastfmSession && song) {
        lastfm.updateNowPlaying({ artist: getArtistNames(song), track: song.title }, lastfmSession).catch(() => {})
      }
    }
    setIsPlaying(!isPlaying)
  }

  const coverUrl = song?.albums?.[0]?.image ? `https://cdn.listen.moe/covers/${song.albums[0].image}` : null

  return (
    <div className={cn("flex max-w-2xl flex-col sm:flex-row items-center gap-6 sm:gap-10 rounded-3xl border bg-card p-6 sm:p-8 shadow-sm", className)}>
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
        <div className="flex items-center justify-center sm:justify-start gap-4 pt-1">
          <Button variant="default" size="icon" className="h-14 w-14 rounded-full shadow-lg transition-all active:scale-90 hover:scale-105 bg-primary text-primary-foreground"
            onClick={togglePlay} aria-label={isPlaying ? "Pause" : "Play"}>
            {isPlaying ? (<Pause className="h-6 w-6" />) : (<Play className="h-6 w-6 ml-1" fill="currentColor" />)}
          </Button>
          <Button variant="ghost" size="icon" onClick={toggleScrobbling} title={lastfmSession ? "Scrobbling" : "Connect Last.fm"}
            className={cn("h-14 w-14 rounded-full transition-all border border-transparent", isScrobbling && lastfmSession ? "text-red-500 bg-red-500/10 border-red-500/20" : "text-muted-foreground hover:bg-muted")}>
            <Music className="h-6 w-6" />
          </Button>
        </div>
      </div>
    </div>
  )
}
