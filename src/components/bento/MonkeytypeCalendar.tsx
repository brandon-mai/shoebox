'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { type FunctionComponent, useCallback, useEffect, useState } from 'react'
import Calendar from 'react-activity-calendar'

interface MonkeyTypeActivity {
  date: string
  count: number
  level: 0 | 1 | 2 | 3 | 4
}

interface ApiResponse {
  message: string
  data: {
    testsByDays: (number | null)[]
    lastDay: number
  }
}

const getThemeColors = () => [
  'hsl(var(--chart-0))',
  'hsl(var(--chart-1))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-5))',
  'hsl(var(--chart-7))',
]

async function fetchCalendarData(): Promise<MonkeyTypeActivity[]> {
  const response = await fetch('/monkeytype.json')
  const data: ApiResponse = await response.json()

  if (!response.ok) {
    throw Error('Failed to fetch Monkeytype activity data')
  }

  // Convert the testsByDays array into the format needed for the calendar
  return convertToActivityData(data.data.testsByDays, data.data.lastDay)
}

function convertToActivityData(tests: (number | null)[], lastDay: number): MonkeyTypeActivity[] {
  const activities: MonkeyTypeActivity[] = []
  const lastDate = new Date(lastDay)
  
  tests.forEach((count, index) => {
    const date = new Date(lastDate)
    date.setDate(date.getDate() - (tests.length - 1 - index))
    
    // Convert count to level (0-4)
    let level: 0 | 1 | 2 | 3 | 4 = 0
    if (count) {
      if (count <= 2) level = 1
      else if (count <= 5) level = 2
      else if (count <= 10) level = 3
      else level = 4
    }

    activities.push({
      date: date.toISOString().split('T')[0],
      count: count || 0,
      level
    })
  })

  return activities
}

const MonkeytypeCalendar: FunctionComponent = () => {
  const [data, setData] = useState<MonkeyTypeActivity[] | null>(null)
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
          Failed to load Monkeytype activity
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
          data={data.slice(-133)} // Last 133 days for larger screens
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
          data={data.slice(-60)} // Last 60 days for mobile
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

export default MonkeytypeCalendar