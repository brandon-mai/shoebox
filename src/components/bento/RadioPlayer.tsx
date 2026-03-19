import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Play, Pause, Radio } from 'lucide-react'
import { cn } from '@/lib/utils'

// const DEFAULT_COVER = '/static/bento/album-placeholder.webp'
const DEFAULT_COVER = 'https://static.photos/abstract/200x200/2.webp'

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
  
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // const metadataTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Setup media session handlers if available
  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => {
        audioRef.current?.play()
        setIsPlaying(true)
      })
      navigator.mediaSession.setActionHandler('pause', () => {
        audioRef.current?.pause()
        setIsPlaying(false)
      })
    }
  }, [])

  // WebSocket connection & Heartbeat
  useEffect(() => {
    const connectWS = () => {
      const ws = new WebSocket('wss://listen.moe/gateway_v2')
      wsRef.current = ws

      ws.onopen = () => {
        setIsConnected(true)
      }

      ws.onmessage = (event) => {
        try {
          const payload: ListenMoePayload = JSON.parse(event.data)
          
          if (payload.op === 0) {
            // Hello -> setup heartbeat
            const interval = payload.d.heartbeat
            if (heartbeatRef.current) clearInterval(heartbeatRef.current)
            heartbeatRef.current = setInterval(() => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ op: 9 }))
              }
            }, interval)
          } else if (payload.op === 1) {
            // Event
            if (payload.t === 'TRACK_UPDATE' || payload.t === 'TRACK_UPDATE_REQUEST') {
              const currentSong = payload.d.song as Song
              setSong(currentSong)
              setListeners(payload.d.listeners || 0)
              
              // Debounce Media Session update slightly to prevent iOS stream stalling
              // Sometimes Safari dislikes metadata updates happening exactly at codec boundary
              // if (metadataTimeoutRef.current) clearTimeout(metadataTimeoutRef.current)
              // metadataTimeoutRef.current = setTimeout(() => {
                if ('mediaSession' in navigator) {
                  const artistNames = currentSong.artists.map(a => a.name).join(', ')
                  const albumImages = currentSong.albums?.[0]?.image 
                    ? [{ src: `https://cdn.listen.moe/covers/${currentSong.albums[0].image}`, sizes: '512x512', type: 'image/jpeg' }]
                    : [{ src: DEFAULT_COVER, sizes: '512x512', type: 'image/webp' }]
                    
                  navigator.mediaSession.metadata = new MediaMetadata({
                    title: currentSong.title,
                    artist: artistNames,
                    album: currentSong.albums?.[0]?.name || 'LISTEN.moe',
                    artwork: albumImages
                  })

                  if ('setPositionState' in navigator.mediaSession) {
                    navigator.mediaSession.setPositionState({
                      duration: Infinity,
                      playbackRate: 1,
                      position: 0
                    });
                  }
                }
              // }, 500)
            }
          }
        } catch (err) {
          console.error('Failed to parse WS message', err)
        }
      }

      ws.onclose = () => {
        setIsConnected(false)
        if (heartbeatRef.current) clearInterval(heartbeatRef.current)
        // Reconnect after 5s
        setTimeout(connectWS, 5000)
      }
      
      ws.onerror = (err) => {
        console.error('Listen.MOE WS Error:', err)
        ws.close()
      }
    }

    connectWS()

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      // if (metadataTimeoutRef.current) clearTimeout(metadataTimeoutRef.current)
      if (wsRef.current) wsRef.current.close()
    }
  }, [])

  const togglePlay = () => {
    if (!audioRef.current) return
    
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      const isPaused = audioRef.current.paused
      if (isPaused) {
        audioRef.current.load() 
      }
      audioRef.current.play().catch(e => console.error("Playback failed:", e))
    }
    setIsPlaying(!isPlaying)
  }

  const artistNames = song?.artists.map(a => a.name).join(', ') || 'Unknown Artist'
  const coverUrl = song?.albums?.[0]?.image ? `https://cdn.listen.moe/covers/${song.albums[0].image}` : null

  return (
    <div className={cn("flex max-w-2xl flex-col sm:flex-row items-center sm:items-center gap-6 sm:gap-10 rounded-3xl border bg-card p-6 sm:p-8 shadow-sm", className)}>
      <audio 
        ref={audioRef} 
        src="https://listen.moe/stream"
        preload="metadata" 
      />
      
      {/* Album Art (Bento Style Layout) */}
      <div className="relative aspect-square w-full max-w-sm sm:w-40 sm:h-40 sm:shrink-0 overflow-hidden rounded-xl shadow-md border bg-muted">
        <img 
          src={coverUrl || DEFAULT_COVER} 
          alt={song?.title || "Album Art"} 
          className="h-full w-full object-cover transition-transform duration-700 hover:scale-105" 
        />
      </div>

      {/* Info & Controls */}
      <div className="flex flex-1 flex-col justify-center gap-4 sm:gap-6 text-center sm:text-left min-w-0 w-full">
        {/* Status / Listeners */}
        <div className="flex items-center justify-center sm:justify-between text-xs font-medium text-muted-foreground/70 uppercase tracking-wider">
          <div className="flex items-center gap-2">
            <Radio className={cn("h-4 w-4", isConnected ? "text-green-500 animate-pulse" : "text-destructive")} />
            <span>{isConnected ? "Live broadcast" : "Connecting..."}</span>
          </div>
          {listeners > 0 && <span className="hidden sm:inline-block">{listeners.toLocaleString()} listeners</span>}
        </div>

        {/* Metadata */}
        <div className="flex flex-col gap-1">
          <h3 className="line-clamp-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl leading-tight">
            {song?.title || "Waiting for track data..."}
          </h3>
          <p className="line-clamp-1 text-base sm:text-lg text-muted-foreground/80 font-medium italic">
            {song ? artistNames : "LISTEN.moe"}
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center sm:justify-start pt-1">
          <Button 
            variant="default" 
            size="icon" 
            className="h-14 w-14 shrink-0 rounded-full shadow-lg transition-all active:scale-90 hover:scale-105 bg-primary text-primary-foreground"
            onClick={togglePlay}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <Pause className="h-6 w-6" />
            ) : (
              <Play className="h-6 w-6 ml-1" fill="currentColor" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
