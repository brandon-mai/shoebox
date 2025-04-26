import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = ({ request }) => {
  const url = new URL(request.url)
  const params = new URLSearchParams(url.search)
  const data = {
    mode: params.get('mode') === 'light' ? 'light' : 'dark',
    mobile: params.get('mobile') === 'true' ? true : false,
  };

  

  return new Response(JSON.stringify(data), {
    status: 200
  });
};