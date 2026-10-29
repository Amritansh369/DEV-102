'use client'

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'

export interface ViolationEvent {
  type: string
  /** Hour of day, 0-23. */
  hour: number
}

interface ViolationChartProps {
  events: ViolationEvent[]
  /** 'type' = bars by violation type, 'time' = heatmap by hour, 'both' = stacked. */
  view?: 'type' | 'time' | 'both'
}

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const fmtHour = (h: number) => `${String(h).padStart(2, '0')}:00`

export default function ViolationChart({ events, view = 'both' }: ViolationChartProps) {
  const [hover, setHover] = useState<{ type: string; hour: number; n: number } | null>(null)

  const { types, matrix, byHour, max, maxType, total } = useMemo(() => {
    const m = new Map<string, number[]>()
    events.forEach((e) => {
      if (!m.has(e.type)) m.set(e.type, Array(24).fill(0))
      const h = Math.min(23, Math.max(0, Math.floor(e.hour)))
      m.get(e.type)![h]++
    })
    const rows = [...m.entries()]
      .map(([type, hours]) => ({ type, hours, sum: hours.reduce((a, c) => a + c, 0) }))
      .sort((a, b) => b.sum - a.sum)
    const hourTotals = HOURS.map((h) => rows.reduce((a, r) => a + r.hours[h], 0))
    return {
      types: rows,
      matrix: rows,
      byHour: hourTotals,
      max: Math.max(1, ...rows.flatMap((r) => r.hours)),
      maxType: Math.max(1, ...rows.map((r) => r.sum)),
      total: events.length,
    }
  }, [events])

  if (total === 0) return <p className="rounded-xl bg-soft px-4 py-8 text-center text-sm text-muted">No violations were recorded.</p>

  const maxHourTotal = Math.max(1, ...byHour)

  return (
    <div className="space-y-6">
      {(view === 'type' || view === 'both') && (
        <section aria-label="Violations by type">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">By type · {total} total</h4>
          <ul className="space-y-2">
            {types.map((t, i) => (
              <li key={t.type} className="grid grid-cols-[130px_1fr_32px] items-center gap-3 text-xs">
                <span className="truncate text-ink" title={t.type}>{t.type}</span>
                <div className="h-2.5 overflow-hidden rounded-full bg-soft">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-accent to-primary-600"
                    initial={{ width: 0 }}
                    animate={{ width: `${(t.sum / maxType) * 100}%` }}
                    transition={{ type: 'spring', stiffness: 90, damping: 20, delay: i * 0.05 }}
                  />
                </div>
                <span className="text-right font-medium tabular-nums text-ink">{t.sum}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(view === 'time' || view === 'both') && (
        <section aria-label="Violations by hour of day">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">By hour of day</h4>
            <p className="min-h-4 text-[11px] text-muted" aria-live="polite">
              {hover ? `${hover.type} at ${fmtHour(hover.hour)}: ${hover.n}` : 'Hover a cell for details'}
            </p>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="grid items-end gap-0.5" style={{ gridTemplateColumns: '120px repeat(24, minmax(0, 1fr))' }}>
                <span className="text-[10px] text-muted">All types</span>
                {byHour.map((n, h) => (
                  <div key={h} className="flex h-8 items-end" title={`${fmtHour(h)}: ${n} violation${n === 1 ? '' : 's'}`}>
                    <motion.div className="w-full rounded-t-sm bg-primary/70" initial={{ height: 0 }} animate={{ height: `${(n / maxHourTotal) * 100}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
                  </div>
                ))}
              </div>
              <div className="mt-1 grid gap-0.5" style={{ gridTemplateColumns: '120px repeat(24, minmax(0, 1fr))' }}>
                {matrix.map((row) => (
                  <Row key={row.type} type={row.type} hours={row.hours} max={max} onHover={setHover} />
                ))}
                <span />
                {HOURS.map((h) => (
                  <span key={h} className="text-center text-[9px] text-muted">
                    {h % 3 === 0 ? h : ''}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2 text-[10px] text-muted">
            Fewer
            {[0.1, 0.3, 0.5, 0.75, 1].map((a) => (
              <span key={a} className="h-3 w-5 rounded-sm" style={{ background: `rgba(30,111,240,${a})` }} aria-hidden />
            ))}
            More
          </div>
        </section>
      )}
    </div>
  )
}

function Row({ type, hours, max, onHover }: { type: string; hours: number[]; max: number; onHover: (v: { type: string; hour: number; n: number } | null) => void }) {
  return (
    <>
      <span className="truncate pr-2 text-[11px] text-ink" title={type}>{type}</span>
      {hours.map((n, h) => (
        <button
          key={h}
          type="button"
          tabIndex={-1}
          onMouseEnter={() => onHover({ type, hour: h, n })}
          onMouseLeave={() => onHover(null)}
          onFocus={() => onHover({ type, hour: h, n })}
          aria-label={`${type}, ${fmtHour(h)}: ${n}`}
          className={`h-6 rounded-sm transition-transform hover:scale-110 ${n === 0 ? 'bg-soft' : ''}`}
          style={n > 0 ? { background: `rgba(30,111,240,${0.12 + 0.88 * (n / max)})` } : undefined}
        />
      ))}
    </>
  )
}
