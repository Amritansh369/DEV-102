import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Pause, Play, Radio, Trash2 } from 'lucide-react'
import type { Severity, ViolationCode } from '../lib/types'
import type { FeedViolation } from '../lib/api'
import { VIOLATION_META, formatClock, timeAgo, useNow } from '../lib/monitorUtils'
import { SEVERITY_STYLES, SeverityBadge } from './RiskBadge'

interface ViolationFeedProps {
  items: FeedViolation[]
  loading?: boolean
  onClear: () => void
  onOpenSession: (sessionId: string) => void
  className?: string
}

const SEVERITIES: ('ALL' | Severity)[] = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
const CODES = (Object.keys(VIOLATION_META) as ViolationCode[]).sort((a, b) => VIOLATION_META[a].label.localeCompare(VIOLATION_META[b].label))

export function ViolationFeed({ items, loading = false, onClear, onOpenSession, className = '' }: ViolationFeedProps) {
  const now = useNow(5000)
  const [paused, setPaused] = useState(false)
  const [frozen, setFrozen] = useState<FeedViolation[]>([])
  const [sev, setSev] = useState<'ALL' | Severity>('ALL')
  const [code, setCode] = useState<'ALL' | ViolationCode>('ALL')

  const shown = paused ? frozen : items
  const frozenIds = useMemo(() => new Set(frozen.map((f) => f.id)), [frozen])
  const pending = paused ? items.filter((i) => !frozenIds.has(i.id)).length : 0
  const filtered = useMemo(() => shown.filter((v) => (sev === 'ALL' || v.severity === sev) && (code === 'ALL' || v.code === code)), [shown, sev, code])
  const filtering = sev !== 'ALL' || code !== 'ALL'

  const togglePause = () => {
    if (!paused) setFrozen(items)
    setPaused(!paused)
  }
  const clear = () => {
    onClear()
    setFrozen([])
  }

  return (
    <section aria-label="Live violation feed" className={`flex min-h-0 flex-col rounded-2xl border border-border bg-white shadow-sm ${className}`}>
      <header className="space-y-3 border-b border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-text">
            <Radio className={`h-4 w-4 ${paused ? 'text-muted' : 'animate-pulse text-danger'}`} aria-hidden="true" />Violation feed
          </h2>
          <div className="flex gap-1.5">
            <button onClick={togglePause} aria-pressed={paused} className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-semibold text-text hover:bg-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              {paused ? <Play className="h-3.5 w-3.5" aria-hidden="true" /> : <Pause className="h-3.5 w-3.5" aria-hidden="true" />}{paused ? (pending ? `Resume (${pending})` : 'Resume') : 'Pause'}
            </button>
            <button onClick={clear} disabled={items.length === 0 && frozen.length === 0} className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-semibold text-text hover:bg-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40">
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />Clear
            </button>
          </div>
        </div>
        <div role="radiogroup" aria-label="Filter by severity" className="flex flex-wrap gap-1">
          {SEVERITIES.map((s) => (
            <button key={s} role="radio" aria-checked={sev === s} onClick={() => setSev(s)} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${sev === s ? 'bg-primary-600 text-white' : 'bg-soft text-muted hover:text-text'}`}>
              {s === 'ALL' ? 'All' : SEVERITY_STYLES[s].label}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="sr-only">Filter by violation type</span>
          <select value={code} onChange={(e) => setCode(e.target.value as 'ALL' | ViolationCode)} className="w-full rounded-lg border border-border bg-white px-2 py-1.5 text-xs text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <option value="ALL">All violation types</option>
            {CODES.map((c) => <option key={c} value={c}>{VIOLATION_META[c].label}</option>)}
          </select>
        </label>
      </header>

      <div role="log" aria-live="off" aria-label="Violations, newest first" className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <ul className="space-y-2 p-3" aria-busy="true">{Array.from({ length: 6 }, (_, i) => <li key={i} className="h-16 animate-pulse rounded-xl bg-soft" />)}</ul>
        ) : filtered.length === 0 ? (
          <div className="grid h-full place-items-center p-8 text-center text-sm text-muted">
            <div className="space-y-2">
              <p className="font-semibold text-text">{filtering ? 'No events match these filters' : 'No violations yet'}</p>
              <p>{filtering ? 'Try a different severity or type.' : 'New events will appear here the moment they are detected.'}</p>
              {filtering && <button onClick={() => { setSev('ALL'); setCode('ALL') }} className="rounded font-semibold text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">Reset filters</button>}
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            <AnimatePresence initial={false}>
              {filtered.slice(0, 60).map((v) => (
                <motion.li key={v.id} layout initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="relative">
                  <span className={`absolute inset-y-0 left-0 w-1 ${SEVERITY_STYLES[v.severity].bar}`} aria-hidden="true" />
                  <div className="space-y-1 py-3 pl-4 pr-3">
                    <div className="flex items-center justify-between gap-2">
                      <button onClick={() => onOpenSession(v.sessionId)} className="truncate rounded text-sm font-semibold text-text hover:text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">{v.candidateName}</button>
                      <SeverityBadge severity={v.severity} />
                    </div>
                    <p className="text-xs font-medium text-text">{VIOLATION_META[v.code].label}</p>
                    <p className="line-clamp-2 text-xs text-muted">{v.message}</p>
                    <p className="text-[11px] tabular-nums text-muted"><time dateTime={v.at}>{formatClock(v.at)}</time> · {timeAgo(v.at, now)}</p>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
      <footer className="border-t border-border px-4 py-2 text-[11px] text-muted">{filtered.length} event{filtered.length === 1 ? '' : 's'}{paused ? ' · paused' : ' · live'}</footer>
    </section>
  )
}
