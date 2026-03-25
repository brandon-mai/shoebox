import crypto from 'crypto';

const CLIENT_ID = 'd8a5ed958d274c2e8ee717e6a4b0971d';
const SEARCH_HASH = 'dea90d34a7ee20d54354f1bf3171a65c36b9f242401494d56451d468d516125e';

/**
 * Simple Base32 decoder for Spotify TOTP secret.
 */
function base32Decode(str: string): Buffer {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    let index = 0;
    const output = Buffer.alloc((str.length * 5) / 8);

    for (const char of str.toUpperCase()) {
        const val = alphabet.indexOf(char);
        if (val === -1) continue;
        value = (value << 5) | val;
        bits += 5;
        if (bits >= 8) {
            output[index++] = (value >> (bits - 8)) & 0xff;
            bits -= 8;
        }
    }
    return output;
}

/**
 * Generates a TOTP code for Spotify authentication.
 */
function generateTOTP(secret: string): string {
    const key = base32Decode(secret);
    const counter = Math.floor(Date.now() / 30000);
    const b = Buffer.alloc(8);
    b.writeBigInt64BE(BigInt(counter), 0);

    const hmac = crypto.createHmac('sha1', key).update(b).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000;
    return code.toString().padStart(6, '0');
}

/**
 * Fetches and transforms the Spotify TOTP secret.
 */
async function getSpotifySecret(): Promise<string> {
    const url = 'https://code.thetadev.de/ThetaDev/spotify-secrets/raw/branch/main/secrets/secretDict.json';
    const res = await fetch(url);
    const secretsDict = await res.json();
    const secretBytes: number[] = secretsDict['61'];

    // XOR Transformation
    const transformed = secretBytes.map((e, t) => e ^ ((t % 33) + 9));
    const joined = transformed.join('');
    const hexStr = Buffer.from(joined).toString('hex');

    // Final Base32 secret
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let output = '';
    let bits = 0;
    let value = 0;
    const input = Buffer.from(hexStr, 'hex');

    for (const byte of input) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            output += alphabet[(value >> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) {
        output += alphabet[(value << (5 - bits)) & 31];
    }
    return output;
}

/**
 * Fetches an anonymous access token.
 */
async function getGuestToken(totp: string): Promise<string> {
    const url = `https://open.spotify.com/api/token?reason=init&productType=web-player&totp=${totp}&totpVer=61`;
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Referer': 'https://open.spotify.com/',
        },
    });
    const data = await res.json();
    return data.accessToken;
}

/**
 * Fetches a client token.
 */
async function getClientToken(): Promise<string> {
    const url = 'https://clienttoken.spotify.com/v1/clienttoken';
    const deviceId = crypto.randomUUID();

    const payload = {
        client_data: {
            client_version: '1.2.87.30.gc764ebf1',
            client_id: CLIENT_ID,
            js_sdk_data: {
                device_id: deviceId,
                device_brand: 'unknown',
                device_model: 'unknown',
                os: 'windows',
                os_version: 'NT 10.0',
                device_type: 'computer',
            },
        },
    };

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Origin': 'https://open.spotify.com',
            'Referer': 'https://open.spotify.com/',
        },
        body: JSON.stringify(payload),
    });
    const data = await res.json();
    return data.granted_token.token;
}

export interface SpotifyTrack {
    name: string;
    artist: string;
    album: string;
    duration_ms: number;
    url: string;
    image: string | null;
    original_rank: number;
    score?: number;
}

/**
 * Searches for a track on Spotify using anonymous tokens.
 */
export async function searchTrack(query: string): Promise<SpotifyTrack[]> {
    try {
        const secret = await getSpotifySecret();
        const totp = generateTOTP(secret);
        const accessToken = await getGuestToken(totp);
        const clientToken = await getClientToken();

        const res = await fetch('https://api-partner.spotify.com/pathfinder/v2/query', {
            method: 'POST',
            headers: {
                'authorization': `Bearer ${accessToken}`,
                'client-token': clientToken,
                'content-type': 'application/json',
                'app-platform': 'WebPlayer',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Origin': 'https://open.spotify.com',
                'Referer': 'https://open.spotify.com/',
                'accept-language': 'ja-JP,ja;q=0.9,en;q=0.8',
            },
            body: JSON.stringify({
                variables: {
                    searchTerm: query,
                    limit: 50,
                    numberOfTopResults: 20,
                    offset: 0,
                    includeAudiobooks: true,
                    includeAuthors: false,
                    includePreReleases: false,
                    market: 'JP'
                },
                operationName: 'searchTracks',
                extensions: {
                    persistedQuery: {
                        version: 1,
                        sha256Hash: '59ee4a659c32e9ad894a71308207594a65ba67bb6b632b183abe97303a51fa55',
                    },
                },
            }),
        });

        const results = await res.json();
        const items = results.data?.searchV2?.tracksV2?.items || [];
        const tracks: SpotifyTrack[] = [];
        let rank = 1;

        for (const item of items) {
            const data = item.item?.data;
            if (data) {
                const trackId = data.uri.split(':').pop();
                // Join multiple artists for more complete metadata
                const artistList = data.artists?.items?.map((a: any) => a.profile?.name).filter(Boolean) || [];
                const artistName = artistList.length > 0 ? artistList.join(', ') : 'Unknown Artist';
                
                tracks.push({
                    name: data.name,
                    artist: artistName,
                    album: data.albumOfTrack?.name || 'Unknown Album',
                    duration_ms: data.duration?.totalMilliseconds || 0,
                    url: `https://open.spotify.com/track/${trackId}`,
                    image: data.albumOfTrack?.coverArt?.sources?.[0]?.url || null,
                    original_rank: rank++,
                });
            }
        }
        return tracks;
    } catch (error) {
        console.error('Error searching track on Spotify:', error);
        return [];
    }
}
