'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Ban, CheckCircle2, Mail, MessageSquareWarning, Pause, Play, Radio, Rocket, ShieldAlert, type LucideIcon } from 'lucide-react'
import { getRecentActivity, type ActivityItem, type ActivityKind } from '@/lib/api'
import { cx, timeAgo, useNow } from '@/lib/adminHooks'
import type { Severity } from '@/lib/types'
import { EmptyState } from './States'

const KIND_META: Record<ActivityKind, { icon: LucideIcon; tone: string }> = {
  VIOLATION: { icon: ShieldAlert, tone: 'bg-danger/10 text-danger' },
  SESSION_STARTED: { icon: Play, tone: 'bg-accent/10 text-primary-600' },
  SESSION_SUBMITTED: { icon: CheckCircle2, tone: 'bg-success/10 text-success' },
  WARNING_SENT: { icon: MessageSquareWarning, tone: 'bg-warning/15 text-warning' },
  TERMINATED: { icon: Ban, tone: 'bg-danger/10 text-danger' },
  EMAIL_SENT: { icon: Mail, tone: 'bg-primary/10 text-primary' },
  EXAM_PUBLISHED: { icon: Rocket, tone: 'bg-primary/10 text-primary' },
}

const SEVERITY_CHIP: Record<Severity, string> = {
  LOW: 'bg-slate-100 text-slate-600',
  MEDIUM: 'bg-warning/15 text-amber-800',
  HIGH: 'bg-orange-100 text-orange-700',
  CRITICAL: 'bg-danger text-white',
}

type Filter = 'ALL' | 'VIOLATION'

interface ActivityFeedProps {
  initialItems: ActivityItem[]
  onNewItem?: (item: ActivityItem) => void
  maxItems?: number
  className?: string
}

export function ActivityFeed({ initialItems, onNewItem, maxItems = 40, className }: ActivityFeedProps) {
  const [items, setItems] = useState<ActivityItem[]>(() => initialItems.slice(0, maxItems))
  const [paused, setPaused] = useState(false)
  const [filter, setFilter] = useState<Filter>('ALL')
  const now = useNow(10_000)
  const callback = useRef(onNewItem)

  useEffect(() => {
    callback.current = onNewItem
  }, [onNewItem])

  // Live mode: poll the activity endpoint and stream in anything not shown yet.
  useEffect(() => {
    if (paused) return
    const tick = async () => {
      try {
        const latest = await getRecentActivity()
        setItems((prev) => {
          const known = new Set(prev.map((i) => i.id))
          const fresh = latest.filter((i) => !known.has(i.id))
          fresh.forEach((i) => callback.current?.(i))
          return fresh.length ? [...fresh, ...prev].slice(0, maxItems) : prev
        })
      } catch {
        /* keep the current list; the next poll retries */
      }
    }
    const id = window.setInterval(() => void tick(), 6000)
    return () => window.clearInterval(id)
  }, [paused, maxItems])

  const visible = filter === 'ALL' ? items : items.filter((i) => i.kind === 'VIOLATION')

  return (
    <section
      aria-label="Live activity"
      className={cx('flex flex-col rounded-2xl border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(10,77,166,0.12)]', className)}
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-text">
            Live activity
            <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', paused ? 'bg-slate-100 text-slate-600' : 'bg-success/10 text-success')}>
              <Radio className="h-3 w-3" aria-hidden="true" /> {paused ? 'Paused' : 'Streaming'}
            </span>
          </h2>
          <p className="mt-0.5 text-xs text-muted">Sessions, violations and system events across all exams</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl bg-soft p-1" role="group" aria-label="Filter activity">
            {(['ALL', 'VIOLATION'] as const).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={cx(
                  'rounded-lg px-3 py-1 text-xs font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-accent',
                  filter === f ? 'bg-surface text-primary shadow-sm' : 'text-muted hover:text-text',
                )}
              >
                {f === 'ALL' ? 'All' : 'Violations'}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-pressed={paused}
            aria-label={paused ? 'Resume live feed' : 'Pause live feed'}
            className="grid h-8 w-8 place-items-center rounded-lg border border-border text-slate-600 outline-none transition hover:bg-soft focus-visible:ring-2 focus-visible:ring-accent"
          >
            {paused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
      </header>

      {visible.length === 0 ? (
        <EmptyState icon={ShieldAlert} title="No violations yet" message="New proctoring events will appear here the moment they are detected." />
      ) : (
        <ul role="log" aria-live="off" className="-mr-2 max-h-[420px] space-y-1 overflow-y-auto pr-2">
          <AnimatePresence initial={false}>
            {visible.map((item) => {
              const meta = KIND_META[item.kind]
              const Icon = meta.icon
              return (
                <motion.li
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: -12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.22 }}
                  className="flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-soft"
                >
                  <span className={cx('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg', meta.tone)}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-700">
                      {item.candidateName && <span className="font-semibold text-text">{item.candidateName} </span>}
                      {item.text}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px]">{item.examCode}</code>
                      {item.severity && (
                        <span className={cx('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', SEVERITY_CHIP[item.severity])}>{item.severity}</span>
                      )}
                      <time dateTime={item.at}>{timeAgo(item.at, now)}</time>
                    </p>
                  </div>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
      )}
    </section>
  )
}
