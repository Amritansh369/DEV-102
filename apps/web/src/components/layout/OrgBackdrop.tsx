'use client'

import { useEffect, useState } from 'react'

type TimeTheme = 'morning' | 'day' | 'night'

const timeTheme = (hour: number): TimeTheme => (hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 18 ? 'day' : 'night')

const OVERLAY: Record<TimeTheme, string> = {
  morning: 'linear-gradient(120deg, rgba(10,77,166,.82), rgba(30,111,240,.45) 55%, rgba(255,176,32,.2))',
  day: 'linear-gradient(120deg, rgba(10,77,166,.85), rgba(30,111,240,.5) 55%, rgba(30,111,240,.15))',
  night: 'linear-gradient(120deg, rgba(2,8,23,.92), rgba(10,31,77,.75) 55%, rgba(10,77,166,.4))',
}

/** Full-bleed organisation background that follows the visitor's local time (morning, day, night). */
export function OrgBackdrop() {
  // Rendered on the server as night, then corrected on the client, so hydration never mismatches.
  const [time, setTime] = useState<TimeTheme>('night')
  useEffect(() => {
    const update = () => setTime(timeTheme(new Date().getHours()))
    update()
    const id = window.setInterval(update, 60_000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <div className="absolute inset-0 bg-cover bg-center transition-[background-image] duration-700" style={{ backgroundImage: `url('/images/bg/org-${time}.webp'), url('/images/backgrounds/data-rain.svg')` }} />
      <div className="absolute inset-0 transition-[background] duration-700" style={{ background: OVERLAY[time] }} />
    </div>
  )
}
