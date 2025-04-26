import type { APIRoute } from 'astro'

const DEV = false
const CACHE_KEY = 'monkeytype_activity'
const CACHE_DURATION = 3600

const mockMonkeytypeData = {
    message: "Current test activity data retrieved",
    data: {
        testsByDays: Array(372).fill(null).map(() => 
        Math.random() > 0.5 ? Math.floor(Math.random() * 15) : null
        ),
        lastDay: Date.now()
    }
}

export const GET: APIRoute = async () => {
  try {
    if (DEV) {
      return new Response(JSON.stringify(mockMonkeytypeData), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, s-maxage=${CACHE_DURATION}`,
        },
      })
    }

    // Production code remains commented until deployment
    const response = await fetch('https://api.monkeytype.com/users/currentTestActivity', {
      headers: {
        'Authorization': `ApeKey ${process.env.MONKEYTYPE_API_KEY}`,
      }
    })

    if (!response.ok) {
      throw new Error('Failed to fetch from Monkeytype')
    }

    const data = await response.json()
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, s-maxage=${CACHE_DURATION}`,
      },
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to fetch data' }), {
      status: 500,
    })
  }
}