/**
 * Metadata matching utilities for comparing radio tracks with Spotify results.
 * Implements strict scoring to handle language mismatches (JP/Romaji).
 */

import { token_set_ratio, token_sort_ratio } from 'fuzzball';

/**
 * Calculates a fuzzy similarity score using fuzzball.js.
 * Blends token_set_ratio (ignores extra words) and token_sort_ratio (penalizes length missing) 
 * to handle subsets like "Alice" vs "Alice Syndrome" gracefully.
 */
export function fuzzySimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  
  const setRatio = token_set_ratio(str1, str2);
  const sortRatio = token_sort_ratio(str1, str2);
  
  // Average the two algorithms and normalize to 0-1
  return ((setRatio + sortRatio) / 2) / 100;
}

/**
 * Calculates similarity based on duration difference.
 * Returns 1 for exact match, decays with distance.
 */
export function durationSimilarity(radioSec: number, spotifyMs: number): number {
  const diff = Math.abs(radioSec - (spotifyMs / 1000));
  // Gaussian decay: exp(-(x^2) / (2 * sigma^2))
  // sigma = 3 seconds means 3s diff is ~60% similarity
  const sigma = 3;
  return Math.exp(-Math.pow(diff, 2) / (2 * Math.pow(sigma, 2)));
}

/**
 * Calculates a score based on the original Spotify rank.
 * Used solely as a tie-breaker (e.g., multiplier from 1.0 to 0.98).
 */
export function rankTieBreaker(rank: number): number {
  return Math.max(0.95, 1 - (rank - 1) * 0.005);
}

export interface RadioMetadata {
  title: string;
  titleRomaji?: string;
  artist: string;
  artistRomaji?: string;
  album: string;
  albumRomaji?: string;
  duration: number;
}

export interface SpotifyMetadata {
  name: string;
  nameRomaji?: string;
  artist: string;
  artistRomaji?: string;
  album: string;
  albumRomaji?: string;
  duration_ms: number;
  original_rank: number;
}

/**
 * Combined matching score.
 */
export function calculateMatchScore(radio: RadioMetadata, spotify: SpotifyMetadata): number {
  // 1. Duration Binary Gate (>20s diff = automatic rejection)
  let durScore = 0.5; // Neutral score if unknown
  if (radio.duration > 0) {
    // const diffSec = Math.abs(radio.duration - (spotify.duration_ms / 1000));
    // if (diffSec > 20) {
    //   return 0; // Strict binary gate
    // }
    durScore = durationSimilarity(radio.duration, spotify.duration_ms);
  }

  // 2. Title Similarity (40% weight)
  const originalTitleScore = fuzzySimilarity(radio.title, spotify.name);
  let romajiTitleScore = 0;
  if (radio.titleRomaji && spotify.nameRomaji) {
    romajiTitleScore = fuzzySimilarity(radio.titleRomaji, spotify.nameRomaji);
  }
  const titleScore = Math.max(originalTitleScore, romajiTitleScore);
  
  // 3. Artist Similarity (30% weight)
  const originalArtistScore = fuzzySimilarity(radio.artist, spotify.artist);
  let romajiArtistScore = 0;
  if (radio.artistRomaji && spotify.artistRomaji) {
    romajiArtistScore = fuzzySimilarity(radio.artistRomaji, spotify.artistRomaji);
  }
  const artistScore = Math.max(originalArtistScore, romajiArtistScore);

  // 4. Album Similarity (15% weight)
  let albumScore = 0.5; // Neutral default
  const radioHasAlbum = radio.album && radio.album.toLowerCase() !== 'unknown' && radio.album !== '';
  const spotifyHasAlbum = spotify.album && spotify.album.toLowerCase() !== 'unknown album' && spotify.album !== '';
  
  if (radioHasAlbum && spotifyHasAlbum) {
    const originalAlbumScore = fuzzySimilarity(radio.album, spotify.album);
    let romajiAlbumScore = 0;
    if (radio.albumRomaji && spotify.albumRomaji) {
      romajiAlbumScore = fuzzySimilarity(radio.albumRomaji, spotify.albumRomaji);
    }
    albumScore = Math.max(originalAlbumScore, romajiAlbumScore);
  }

  // 5. Generalized Relaxation System (Confidence Anchors)
  const scores = [
    { key: 'title', val: titleScore, weight: 0.40 },
    { key: 'artist', val: artistScore, weight: 0.30 },
    { key: 'album', val: albumScore, weight: 0.15 },
    { key: 'duration', val: durScore, weight: 0.15 }
  ];
  
  const anchorCount = scores.filter(s => s.val > 0.9).length;
  const boostFloor = anchorCount >= 3 ? 0.85 : (anchorCount === 2 ? 0.70 : 0);
  
  // Calculate Base Score with boosted floor
  const baseScore = scores.reduce((total, s) => {
    // Optimization: Don't boost title if it's a complete phonetic mismatch (< 0.2)
    // This prevents short unrelated songs (like "Fps") from winning via rank tie-break
    // when a longer phonetically similar song (like "Fiction Call") is available.
    let finalScore = s.val;
    if (s.key === 'title' && s.val < 0.20) {
      // Keep low score
    } else {
      finalScore = Math.max(s.val, boostFloor);
    }
    return total + (finalScore * s.weight);
  }, 0);

  // 6. Search Rank (Tie-Breaker Only)
  return baseScore * rankTieBreaker(spotify.original_rank);
}
