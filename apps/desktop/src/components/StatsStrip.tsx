import { useEffect, useRef, useState } from 'react'
import { animate } from 'framer-motion'
import { Activity, Ban, CheckCircle2, Gauge, Hourglass, Radio, ShieldAlert, type LucideIcon } from 'lucide-react'
import type { MonitorSession } from '../lib/api'

function AnimatedNumber({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const controls = animate(from.current, value, {
      duration: 0.6,
      ease: 'easeOut',
      onUpdate: (v) => { from.current = v; setShown(v) },
    })
    return () => controls.stop()
  }, [value])
  return <span className="tabular-nums">{shown.toFixed(decimals)}</span>
}

interface Tile { label: string; value: number; decimals?: number; suffix?: string; Icon: LucideIcon; tone: string }

interface StatsStripProps {
  sessions: MonitorSession[]
  violationsPerMin: number
  loading?: boolean
}

export function StatsStrip({ sessions, violationsPerMin, loading = false }: StatsStripProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7" aria-busy="true" aria-label="Loading statistics">
        {Array.from({ length: 7 }, (_, i) => <div key={i} className="h-[76px] animate-pulse rounded-2xl bg-white shadow-sm ring-1 ring-border" />)}
      </div>
    )
  }
  const live = sessions.filter((s) => s.status === 'LIVE')
  const avg = live.length ? live.reduce((a, s) => a + s.riskScore, 0) / live.length : 0
  const tiles: Tile[] = [
    { label: 'Live now', value: live.length, Icon: Radio, tone: 'bg-soft text-accent' },
    { label: 'Waiting', value: sessions.filter((s) => s.status === 'WAITING').length, Icon: Hourglass, tone: 'bg-slate-100 text-muted' },
    { label: 'Submitted', value: sessions.filter((s) => s.status === 'SUBMITTED').length, Icon: CheckCircle2, tone: 'bg-success/10 text-success' },
    { label: 'Terminated', value: sessions.filter((s) => s.status === 'TERMINATED').length, Icon: Ban, tone: 'bg-danger/10 text-danger' },
    { label: 'High risk (60+)', value: live.filter((s) => s.riskScore >= 60).length, Icon: ShieldAlert, tone: 'bg-danger/10 text-danger' },
    { label: 'Avg. risk (live)', value: avg, decimals: 1, Icon: Gauge, tone: 'bg-warning/15 text-amber-700' },
    { label: 'Violations / min', value: violationsPerMin, Icon: Activity, tone: 'bg-soft text-primary-600' },
  ]
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
      {tiles.map((t) => (
        <div key={t.label} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-border">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${t.tone}`}><t.Icon className="h-5 w-5" aria-hidden="true" /></span>
          <div className="min-w-0">
            <dd className="font-heading text-2xl font-semibold leading-none text-text"><AnimatedNumber value={t.value} decimals={t.decimals} /></dd>
            <dt className="mt-1 truncate text-xs text-muted">{t.label}</dt>
          </div>
        </div>
      ))}
    </dl>
  )
}
