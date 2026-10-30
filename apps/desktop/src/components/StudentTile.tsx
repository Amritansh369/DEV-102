import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Bot, Eye, Send } from 'lucide-react'
import type { MonitorSession } from '../lib/api'
import { STATUS_LABEL, VIOLATION_META, timeAgo } from '../lib/monitorUtils'
import { RiskBadge, SEVERITY_STYLES, riskLevel } from './RiskBadge'

const FRAME_BADGE: Record<MonitorSession['frame'], { text: string; cls: string } | null> = {
  NORMAL: null,
  NO_FACE: { text: 'No face', cls: 'bg-amber-500' },
  MULTI: { text: '2 faces', cls: 'bg-danger' },
  AWAY: { text: 'Looking away', cls: 'bg-amber-500' },
}

/**
 * Candidate picture: the live webcam frame when there is one, else the verified photo taken with open eyes,
 * else an open-eye icon. The agent's latest flag is drawn over it.
 */
export function CandidatePicture({ frame, photo, liveImage, className = '' }: { frame: MonitorSession['frame']; photo?: string; liveImage?: string; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null)
  const badge = FRAME_BADGE[frame]
  const usable = photo && photo !== failed ? photo : undefined
  const src = liveImage ?? usable
  return (
    <div className={`relative overflow-hidden bg-slate-900 ${className}`}>
      {src ? (
        <img src={src} alt={liveImage ? 'Live webcam snapshot' : 'Candidate photo'} onError={() => setFailed(src)} className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center text-slate-400"><Eye className="h-1/3 max-h-16 min-h-5 w-auto" aria-label="No picture yet" /></div>
      )}
      {src && <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent" />}
      {badge && <span className={`absolute left-1.5 top-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-white ${badge.cls}`}>{badge.text}</span>}
      {liveImage && <span className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-md bg-black/50 px-1.5 py-0.5 text-[9px] font-bold text-white"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />LIVE</span>}
    </div>
  )
}

interface StudentTileProps {
  session: MonitorSession
  /** Latest webcam frame pushed over the monitor socket, shown over the photo while the session is live. */
  liveImage?: string
  selected: boolean
  now: number
  onToggle: (id: string) => void
  onWarn: (s: MonitorSession) => void
  onOpen: (s: MonitorSession) => void
}

export function StudentTile({ session: s, liveImage, selected, now, onToggle, onWarn, onOpen }: StudentTileProps) {
  const live = s.status === 'LIVE'
  const ring = live ? SEVERITY_STYLES[riskLevel(s.riskScore)].ring : s.status === 'WAITING' ? 'ring-slate-200' : s.status === 'SUBMITTED' ? 'ring-accent/40' : 'ring-danger'
  const lv = s.lastViolation
  const lvId = lv?.id
  const [flash, setFlash] = useState(false)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    setFlash(true)
    const t = window.setTimeout(() => setFlash(false), 1200)
    return () => window.clearTimeout(t)
  }, [lvId])

  return (
    <article aria-label={`${s.candidateName}, ${STATUS_LABEL[s.status]}, risk ${Math.round(s.riskScore)}`} onDoubleClick={() => onOpen(s)} className={`relative overflow-hidden rounded-2xl border bg-white shadow-sm ring-2 transition hover:shadow-md ${ring} ${selected ? 'border-accent' : 'border-border'}`}>
      <div className="relative aspect-[4/3] bg-slate-900">
        <CandidatePicture frame={s.frame} photo={s.photoUrl} liveImage={live ? liveImage : undefined} className={`h-full w-full ${live ? '' : 'opacity-50 grayscale'}`} />
        {flash && <motion.span initial={{ opacity: 0.7 }} animate={{ opacity: 0 }} transition={{ duration: 1.2 }} className="pointer-events-none absolute inset-0 bg-danger/30" />}
        <label className="absolute left-2 top-2 grid h-7 w-7 cursor-pointer place-items-center rounded-lg bg-white/90 shadow-sm focus-within:ring-2 focus-within:ring-accent">
          <input type="checkbox" checked={selected} onChange={() => onToggle(s.id)} aria-label={`Select ${s.candidateName}`} className="h-4 w-4 accent-primary-600 focus:outline-none" />
        </label>
        {s.status !== 'WAITING' && <div className="absolute right-2 top-2"><RiskBadge score={s.riskScore} compact /></div>}
        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-full bg-slate-900/75 px-2 py-0.5 text-[11px] font-medium text-white">
          {live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" aria-hidden="true" />}
          {s.status === 'WAITING' ? 'Waiting in lobby' : STATUS_LABEL[s.status]}
        </span>
        {s.aiOpen && live && <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-danger px-2 py-0.5 text-[11px] font-semibold text-white"><Bot className="h-3 w-3" aria-hidden="true" />AI tab</span>}
      </div>
      <div className="space-y-2.5 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-text">{s.candidateName}</h3>
            <p className="font-mono text-[11px] text-muted">{s.userId}</p>
          </div>
          {s.warnings > 0 && <span className="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700">{s.warnings} warn</span>}
        </div>
        <div className="flex items-center gap-2" title={`${Math.round(s.progress)}% answered`}>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(s.progress)} aria-label="Exam progress">
            <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${s.progress}%` }} />
          </div>
          <span className="w-8 text-right text-[11px] tabular-nums text-muted">{Math.round(s.progress)}%</span>
        </div>
        <p className="flex min-h-[18px] items-center gap-1.5 text-xs text-muted">
          {lv ? (
            <>
              <span className={`h-2 w-2 shrink-0 rounded-full ${SEVERITY_STYLES[lv.severity].bar}`} aria-hidden="true" />
              <span className="truncate text-text">{VIOLATION_META[lv.code].label}</span>
              <span className="ml-auto shrink-0">{timeAgo(lv.at, now)}</span>
            </>
          ) : 'No violations'}
        </p>
        <div className="flex gap-2">
          <button onClick={() => onWarn(s)} disabled={!live} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-xs font-semibold text-text transition hover:bg-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40">
            <Send className="h-3.5 w-3.5" aria-hidden="true" />Warn<span className="sr-only"> {s.candidateName}</span>
          </button>
          <button onClick={() => onOpen(s)} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary-600 px-2 py-1.5 text-xs font-semibold text-white transition hover:bg-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1">
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />Open<span className="sr-only"> {s.candidateName}</span>
          </button>
        </div>
      </div>
    </article>
  )
}
