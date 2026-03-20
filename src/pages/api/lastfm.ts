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
    
    const queryParams = new URLSearchParams({
      ...authParams,
      api_sig,
      format: 'json',
    });

    const response = await fetch('https://ws.audioscrobbler.com/2.0/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: queryParams.toString(),
    });

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
