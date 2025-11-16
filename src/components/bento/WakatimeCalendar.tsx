'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { type FunctionComponent, useCallback, useEffect, useState } from 'react'
import Calendar from 'react-activity-calendar'

interface WakatimeActivity {
  date: string
  count: number // total_seconds
  level: 0 | 1 | 2 | 3 | 4
}

interface WakatimeDay {
  grand_total: {
    total_seconds: number
  }
  range: {
    date: string // 'YYYY-MM-DD'
  }
}

interface WakatimeApiResponse {
  data: WakatimeDay[]
}

const getThemeColors = () => [
  'var(--background)',
  'var(--chart-5)',
  'var(--chart-4)',
  'var(--chart-3)',
  'var(--chart-2)',
]


function convertToWakatimeActivityData(days: WakatimeDay[]): WakatimeActivity[] {
  return days.map(day => {
    const count = Math.round(day.grand_total.total_seconds)
    
    let level: 0 | 1 | 2 | 3 | 4 = 0
    if (count > 0) {
      if (count <= 1800) level = 1       // 30 mins
      else if (count <= 5400) level = 2  // 1.5 hours
      else if (count <= 10800) level = 3 // 3 hours
      else level = 4                     // > 3 hours
    }

    return {
      date: day.range.date,
      count: count,
      level: level
    }
  })
}


async function fetchCalendarData(): Promise<WakatimeActivity[]> {
  const response = await fetch('https://wakatime.com/share/@brandonmai/f86b4920-1f23-4e1f-bd55-f423de2aa91f.json') 
  const data: WakatimeApiResponse = await response.json()

  if (!response.ok) {
    throw Error('Failed to fetch Wakatime activity data')
  }

  const allActivities = convertToWakatimeActivityData(data.data)

  // Calculate the n-month window
  const today = new Date()
  const startDate = new Date(today.getFullYear(), today.getMonth() - 3, 1)
  const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 1)

  // Format dates to 'YYYY-MM-DD' for simple string comparison
  const startDateString = startDate.toISOString().split('T')[0]
  const endDateString = endDate.toISOString().split('T')[0]

  // Filter activities to match the desired date range
  const filteredActivities = allActivities.filter(activity => {
    return activity.date >= startDateString
  })

  let todayDateString = today.toISOString().split('T')[0]
  while (todayDateString <= endDateString) {
    filteredActivities.push({
      date: todayDateString,
      count: 0,
      level: 0
    })
    
    today.setDate(today.getDate() + 1)
    todayDateString = today.toISOString().split('T')[0]
  }

  return filteredActivities
}


const WakatimeCalendar: FunctionComponent = () => {
  const [data, setData] = useState<WakatimeActivity[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchData = useCallback(() => {
    setLoading(true)
    setError(null)
    fetchCalendarData()
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false))
  }, [])

  useEffect(fetchData, [fetchData])

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4">
        <p className="text-center text-sm text-muted-foreground">
          Failed to load Wakatime activity
        </p>
      </div>
    )
  }

  if (loading || !data) {
    return <Skeleton className="h-[70%] w-[85%] rounded-3xl" />
  }

  return (
    <>
      <div className="m-4 hidden sm:block">
        <Calendar
          data={data}
          theme={{
            light: getThemeColors(),
            dark: getThemeColors(),
          }}
          blockSize={20}
          blockMargin={6}
          blockRadius={7}
          maxLevel={4}
          hideTotalCount
          hideColorLegend
        />
      </div>
      <div className="m-4 scale-110 sm:hidden">
        <Calendar
          data={data.slice(-60)}
          theme={{
            light: getThemeColors(),
            dark: getThemeColors(),
          }}
          blockSize={20}
          blockMargin={6}
          blockRadius={7}
          maxLevel={4}
          hideTotalCount
          hideColorLegend
        />
      </div>
    </>
  )
}

export default WakatimeCalendar