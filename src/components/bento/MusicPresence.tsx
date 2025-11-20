import { useEffect, useState, useRef } from 'react'
import { SiSpotify, SiYoutubemusic } from 'react-icons/si'
import { PiWaveformBold } from "react-icons/pi";
import { Skeleton } from '@/components/ui/skeleton'
import { MoveUpRight } from 'lucide-react'

interface Track {
  name: string
  artist: { '#text': string }
  album: { '#text': string }
  image: { '#text': string }[]
  url: string
  '@attr'?: { nowplaying: string }
}

interface CachedData {
  track: Track
  timestamp: number
}

const CACHE_KEY = 'music-presence-cache'
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes
const RETRY_DELAY = 2000 // 2 seconds
const MAX_RETRIES = 3

const getValidImageUrl = (images: { '#text': string }[]) => {
  const imageUrl = images[3]['#text']
  if (!imageUrl || imageUrl === '' || imageUrl.includes('2a96cbd8b46e442fc41c2b86b821562f')) {
    return '/static/bento/album-placeholder.webp'
  }
  return imageUrl.replace('.jpg', '.webp')
}

const MusicPresence = () => {
  const [displayData, setDisplayData] = useState<Track | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const retryCountRef = useRef(0)
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const getCachedData = (): Track | null => {
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) {
        const parsedCache: CachedData = JSON.parse(cached)
        const isExpired = Date.now() - parsedCache.timestamp > CACHE_DURATION
        if (!isExpired) {
          return parsedCache.track
        }
      }
    } catch (error) {
      console.warn('Failed to parse cached data:', error)
      localStorage.removeItem(CACHE_KEY)
    }
    return null
  }

  const setCachedData = (track: Track) => {
    try {
      const cacheData: CachedData = {
        track,
        timestamp: Date.now(),
      }
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData))
    } catch (error) {
      console.warn('Failed to cache data:', error)
    }
  }

  const fetchWithRetry = async (retryCount = 0): Promise<void> => {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)

      const response = await fetch(
        'https://lastfm-last-played.biancarosa.com.br/brandonmai/latest-song',
        {
          signal: controller.signal,
          headers: {
            'Cache-Control': 'no-cache',
          },
        },
      )

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      if (data.track) {
        setDisplayData(data.track)
        setCachedData(data.track)
        setError(null)
        retryCountRef.current = 0
      } else {
        throw new Error('No track data received')
      }
    } catch (fetchError) {
      console.error(`Fetch attempt ${retryCount + 1} failed:`, fetchError)

      if (retryCount < MAX_RETRIES) {
        retryCountRef.current = retryCount + 1

        fetchTimeoutRef.current = setTimeout(
          () => {
            fetchWithRetry(retryCount + 1)
          },
          RETRY_DELAY * (retryCount + 1),
        )
      } else {
        setError('Failed to load music data')
        retryCountRef.current = 0
      }
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const cachedTrack = getCachedData()
    if (cachedTrack) {
      setDisplayData(cachedTrack)
      setIsLoading(false)
      setError(null)

      fetchWithRetry().catch(() => {})
    } else {
      fetchWithRetry()
    }

    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current)
      }
    }
  }, [])

  if (isLoading && !displayData) {
    return (
      <div className="relative flex h-full w-full flex-col justify-between rounded-3xl p-6">
        <Skeleton className="mb-2 h-[55%] w-[55%] rounded-xl" />
        <div className="flex min-w-0 flex-1 flex-col justify-end overflow-hidden">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
        <div className="absolute right-0 top-0 m-3 text-primary">
          <SiSpotify size={56} />
        </div>
        <Skeleton className="absolute bottom-0 right-0 m-3 h-10 w-10 rounded-full" />
      </div>
    )
  }

  if (!displayData) {
    return (
      <div className="relative flex h-full w-full flex-col justify-between p-6">
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <SiSpotify
              size={48}
              className="text-muted-foreground mx-auto mb-4"
            />
            <p className="text-muted-foreground text-sm">
              No music data available
            </p>
          </div>
        </div>
        <div className="text-primary absolute top-0 right-0 m-3">
          <SiSpotify size={56} />
        </div>
      </div>
    )
  }

  const { name: song, artist, album, image, url } = displayData

  return (
    <>
      <div className="relative flex h-full w-full flex-col justify-between p-6">
        <img
          src={getValidImageUrl(image)}
          alt={`Album art for ${song}`}
          width={128}
          height={128}
          className="mb-2 w-[55%] rounded-xl border border-border"
        />
        <div className="flex min-w-0 flex-1 flex-col justify-end overflow-hidden">
          <div className="flex flex-col">
            <span className="mb-2 flex gap-2 text-primary">
              <PiWaveformBold size={22} />
              <span className="text-sm">
                {displayData['@attr']?.nowplaying === 'true'
                  ? 'Now playing...'
                  : 'Last played...'}
              </span>
            </span>
            <span className="text-md mb-2 truncate font-bold leading-none">
              {song}
            </span>
            <span className="w-[85%] truncate text-xs text-muted-foreground">
              <span className="font-semibold text-secondary-foreground">
                by
              </span>{' '}
              {artist['#text']}
            </span>
            <span className="w-[85%] truncate text-xs text-muted-foreground">
              <span className="font-semibold text-secondary-foreground">
                on
              </span>{' '}
              {album['#text']}
            </span>
          </div>
        </div>
      </div>
      <div className="absolute right-0 top-0 m-3 text-primary">
        <SiSpotify size={56} />
      </div>
      <a
        href={url}
        aria-label="View on last.fm"
        title="View on last.fm"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-0 right-0 m-3 flex w-fit items-end rounded-full border bg-secondary/50 p-3 text-primary transition-all duration-300 hover:rotate-12 hover:ring-1 hover:ring-primary"
      >
        <MoveUpRight size={16} />
      </a>
    </>
  )
}

export default MusicPresence