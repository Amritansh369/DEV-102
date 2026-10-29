import { useEffect, useId, useRef, useState } from 'react'
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
 * Candidate camera tile: the candidate's photo with the agent's latest flag drawn over it
 * (an illustrated stand-in is used when no photo is on file).
 */
export function FakeWebcam({ hue, frame, photo, liveImage, className = '' }: { hue: number; frame: MonitorSession['frame']; photo?: string; liveImage?: string; className?: string }) {
  const gid = useId()
  const badge = FRAME_BADGE[frame]
  if (liveImage) {
    return (
      <div className={`relative overflow-hidden bg-slate-900 ${className}`}>
        <img src={liveImage} alt="Live webcam snapshot" className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent" />
        {badge && <span className={`absolute left-1.5 top-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-white ${badge.cls}`}>{badge.text}</span>}
        <span className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-md bg-black/50 px-1.5 py-0.5 text-[9px] font-bold text-white"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />LIVE</span>
      </div>
    )
  }
  if (photo) {
    return (
      <div className={`relative overflow-hidden bg-slate-900 ${className}`}>
        <img src={photo} alt="" className={`h-full w-full object-cover transition ${frame === 'NO_FACE' ? 'opacity-0' : frame === 'AWAY' ? 'scale-105 -translate-x-2' : ''}`} />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent" />
        {frame !== 'NO_FACE' && <div className={`pointer-events-none absolute left-1/2 top-[18%] h-[58%] w-[46%] -translate-x-1/2 rounded-xl border-2 ${frame === 'NORMAL' ? 'border-emerald-400/80' : 'border-amber-400'}`} />}
        {frame === 'MULTI' && <div className="pointer-events-none absolute right-[6%] top-[26%] h-[44%] w-[30%] rounded-xl border-2 border-danger bg-slate-800/50" />}
        {badge && <span className={`absolute left-1.5 top-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-white ${badge.cls}`}>{badge.text}</span>}
        <span className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-md bg-black/50 px-1.5 py-0.5 text-[9px] font-bold text-white"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />REC</span>
      </div>
    )
  }
  const skin = `hsl(${22 + (hue % 18)} 48% ${42 + (hue % 22)}%)`
  const shirt = `hsl(${hue} 38% 34%)`
  const person = (x: number, s: number, turn: number) => (
    <g transform={`translate(${x} 18) scale(${s})`}>
      <path d="M-44 102 C-44 78 -24 70 0 70 C24 70 44 78 44 102 Z" fill={shirt} />
      <rect x="-7" y="56" width="14" height="18" rx="5" fill={skin} />
      <g transform={`rotate(${turn} 0 50)`}>
        <ellipse cx="0" cy="40" rx="19" ry="23" fill={skin} />
        <path d="M-20 38 C-22 12 22 12 20 38 C13 26 -13 26 -20 38 Z" fill="#1F1A17" />
        <circle cx={-7 + turn * 0.5} cy="42" r="2" fill="#1F1A17" />
        <circle cx={7 + turn * 0.5} cy="42" r="2" fill="#1F1A17" />
      </g>
    </g>
  )
  const label = { NORMAL: 'Candidate in frame', NO_FACE: 'No face in frame', MULTI: 'Two people in frame', AWAY: 'Candidate looking away' }[frame]
  return (
    <svg viewBox="0 0 160 120" preserveAspectRatio="xMidYMid slice" role="img" aria-label={`Simulated webcam snapshot: ${label}`} className={className}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={`hsl(${hue} 28% 84%)`} />
          <stop offset="1" stopColor={`hsl(${hue} 22% 62%)`} />
        </linearGradient>
      </defs>
      <rect width="160" height="120" fill={`url(#${gid})`} />
      <rect y="96" width="160" height="24" fill={`hsl(${hue} 20% 40% / 0.35)`} />
      {frame === 'NORMAL' && person(80, 1, 0)}
      {frame === 'AWAY' && person(84, 1, 14)}
      {frame === 'MULTI' && <>{person(54, 0.92, 0)}{person(112, 0.78, -6)}</>}
    </svg>
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
        <FakeWebcam hue={s.hue} frame={s.frame} photo={s.photoUrl} liveImage={live ? liveImage : undefined} className={`h-full w-full ${live ? '' : 'opacity-50 grayscale'}`} />
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
