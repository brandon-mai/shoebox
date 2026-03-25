import type { APIRoute } from 'astro';
import crypto from 'node:crypto';

export const prerender = false;

const API_KEY = import.meta.env.LASTFM_API_KEY;
const API_SECRET = import.meta.env.LASTFM_API_SECRET;

function generateSignature(params: Record<string, string>): string {
  const sortedKeys = Object.keys(params).sort();
  let sigString = '';
  for (const key of sortedKeys) {
    if (key !== 'format' && key !== 'api_sig') {
      sigString += key + params[key];
    }
  }
  sigString += API_SECRET;
  return crypto.createHash('md5').update(sigString, 'utf8').digest('hex');
}

export const POST: APIRoute = async ({ request }) => {
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

  if (!API_KEY || !API_SECRET) {
    return new Response(JSON.stringify({ error: 'Server missing API credentials' }), { status: 500 });
  }

  try {
    const body = await request.json();
    const { method, params } = body;

    const authParams = {
      ...params,
      api_key: API_KEY,
      method,
    };

    const api_sig = generateSignature(authParams);
    
    const bodyParams = new URLSearchParams({
      ...authParams,
      api_sig,
    });

    const response = await fetch('https://ws.audioscrobbler.com/2.0/?format=json', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
        'Accept': 'application/json'
      },
      body: bodyParams.toString(),
    });

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      const text = await response.text();
      console.error('Last.fm Error Response:', text);
      return new Response(JSON.stringify({ 
        error: 'Last.fm returned non-JSON response', 
        status: response.status,
        raw: text.substring(0, 500) 
      }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (err: any) {
    console.error('Scrobble Proxy Error:', err);
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
