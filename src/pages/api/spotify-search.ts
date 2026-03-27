import type { APIRoute } from 'astro';
import { searchTrack } from '@/lib/spotify-utils';
import { calculateMatchScore } from '@/lib/matching-utils';
import path from 'node:path';
// @ts-ignore
import Kuroshiro from 'kuroshiro';
// @ts-ignore
import KuromojiAnalyzer from 'kuroshiro-analyzer-kuromoji';

let kuroshiroInstance: Kuroshiro | null = null;
let kuroshiroInitializing: Promise<Kuroshiro | null> | null = null;

/**
 * Singleton getter for Kuroshiro.
 */
async function getKuroshiro(): Promise<Kuroshiro | null> {
  if (kuroshiroInstance) return kuroshiroInstance;
  if (kuroshiroInitializing) return kuroshiroInitializing;

  kuroshiroInitializing = (async () => {
    try {
      // Vite SSR sometimes imports these as a default object rather than a constructor.
      // We check for .default to maintain compatibility.
      const KuroshiroClass = typeof Kuroshiro === 'function' ? Kuroshiro : (Kuroshiro as any).default || Kuroshiro;
      const AnalyzerClass = typeof KuromojiAnalyzer === 'function' ? KuromojiAnalyzer : (KuromojiAnalyzer as any).default || KuromojiAnalyzer;

      const kuroshiro = new KuroshiroClass();
      // Use absolute path to ensure Vercel finds the bundled dictionary
      const dictPath = path.resolve('node_modules/kuromoji/dict');
      
      await kuroshiro.init(new AnalyzerClass({
        dictPath: dictPath
      }));
      
      kuroshiroInstance = kuroshiro;
      return kuroshiro;
    } catch (e) {
      console.error("Failed to initialize kuroshiro:", e);
      return null;
    }
  })();
  return kuroshiroInitializing;
}

function hasJapaneseCharacters(text: string): boolean {
  return /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/.test(text);
}

export const prerender = false;

/**
 * Spotify Search API Route
 * Orchestrates fuzzy matching with Romaji double-queries and backend scoring.
 */
export const GET: APIRoute = async ({ request, url }) => {
  const query = url.searchParams.get('q');
  const title = url.searchParams.get('title');
  const artist = url.searchParams.get('artist');
  const duration = url.searchParams.get('duration');
  const artistRomajiParam = url.searchParams.get('artistRomaji');
  const album = url.searchParams.get('album');
  
  const host = request.headers.get('host') || '';
  const referer = request.headers.get('referer') || '';
  const origin = request.headers.get('origin') || '';
  
  // Basic same-origin check to prevent external site abuse
  const isTrusted = referer.includes(host) || origin.includes(host);
  if (!isTrusted) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Requests must originate from the same domain.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!query) {
    return new Response(JSON.stringify({ error: 'Missing query parameter "q"' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const kuroshiro = await getKuroshiro();
    
    // 1. Prepare Transliteration Helper
    const translit = async (text: string | null) => {
      if (!text || !kuroshiro || !hasJapaneseCharacters(text)) return text || '';
      try {
        return await kuroshiro.convert(text, { to: 'romaji', mode: 'spaced' });
      } catch {
        return text;
      }
    };

    // 2. Process Radio Metadata
    // Check if any part of the metadata is in Japanese
    const hasJp = hasJapaneseCharacters(`${title || ''} ${artist || ''} ${album || ''}`);
    const tTitle = await translit(title);
    const tArtist = artistRomajiParam || await translit(artist);
    const tAlbum = await translit(album);
    
    const radioData = (title && artist && duration) ? {
      title, titleRomaji: tTitle, 
      artist, artistRomaji: tArtist,
      album: album || '', albumRomaji: tAlbum,
      duration: parseFloat(duration)
    } : null;

    // 3. Execute Searches (Double-Query Strategy)
    const searchWithMeta = async (q: string) => {
      const tracks = await searchTrack(q);
      return tracks.map(t => ({ ...t, queryUsed: q }));
    };

    const searchPromises = [searchWithMeta(query)];
    const debugInfo: any = { 
      kuroshiroStatus: kuroshiro ? 'Initialized' : 'Failed', 
      originalQuery: query, 
      hasJapanese: hasJp 
    };

    const romajiQuery = `${tTitle} ${tArtist}`.trim();
    // Execute second query if we have a different search string (either via Kuroshiro or via frontend params)
    if (romajiQuery.toLowerCase() !== query.toLowerCase()) {
      searchPromises.push(searchWithMeta(romajiQuery));
      debugInfo.romajiQuery = romajiQuery;
      debugInfo.doubleQueryExecuted = true;
    }
    
    // 4. Merge Results & Deduplicate by URL
    const tracksArrays = await Promise.all(searchPromises);
    const uniqueTracks = new Map<string, any>();
    for (const arr of tracksArrays) {
      for (const t of arr) {
        if (uniqueTracks.has(t.url)) {
          // If already found, mark as 'both'
          const existing = uniqueTracks.get(t.url);
          existing.queryUsed = 'both';
        } else {
          uniqueTracks.set(t.url, t);
        }
      }
    }
    
    let results = Array.from(uniqueTracks.values());
    
    // 5. Backend Scoring
    if (radioData) {
      const scoredTracks = await Promise.all(results.map(async (track) => {
        // Transliterate Spotify metadata for language-agnostic comparison
        const spotifyData = {
          ...track,
          nameRomaji: await translit(track.name),
          artistRomaji: await translit(track.artist),
          albumRomaji: await translit(track.album)
        };
        
        return {
          ...spotifyData,
          score: calculateMatchScore(radioData, spotifyData)
        };
      }));
      
      // Sort by best score
      results = scoredTracks.sort((a, b) => (b.score || 0) - (a.score || 0));
    }
    
    return new Response(JSON.stringify({ results, debug: debugInfo }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
      }
    });
  } catch (error: any) {
    console.error('[Spotify API Route] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
