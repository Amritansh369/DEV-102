'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle, ArrowRight, Award, BookOpenCheck, Camera, CheckCircle2, Clock, Cpu, Download, Eye, FileCheck2, Globe2, Keyboard, Laptop, ListChecks,
  Loader2, Lock, Mic, Monitor, RefreshCw, ScanFace, ShieldCheck, Timer, Wifi, XCircle, type LucideIcon } from 'lucide-react'
import { getLobby, type Lobby, type ResultRelease, type ResultSummary } from '@/lib/api'
import { API_ORIGIN } from '@/lib/http'
import { useRequireRole } from '@/lib/session'

/* ------------------------------------------------------------------ helpers */

const pad = (n: number) => String(Math.max(0, Math.floor(n))).padStart(2, '0')
function split(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 }
}
const fmt = (iso: string) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })

type Phase = 'upcoming' | 'open' | 'in-progress' | 'done' | 'closed' | 'blocked'
function phaseOf(l: Lobby): Phase {
  if (l.candidate.status === 'DISQUALIFIED') return 'blocked'
  if (l.result || l.candidate.status === 'SUBMITTED') return 'done'
  if (l.session?.status === 'LIVE') return 'in-progress'
  if (l.exam.status === 'COMPLETED') return 'closed'
  return l.canEnter ? 'open' : 'upcoming'
}

const PHASE_META: Record<Phase, { label: string; tone: string; text: string }> = {
  upcoming: { label: 'Scheduled', tone: 'bg-sky-400/20 text-sky-100 ring-sky-300/40', text: 'Your exam has not started yet. Finish the checks below while you wait.' },
  open: { label: 'Open now', tone: 'bg-emerald-400/20 text-emerald-100 ring-emerald-300/40', text: 'The exam window is open. Launch the desktop app to begin.' },
  'in-progress': { label: 'In progress', tone: 'bg-amber-400/20 text-amber-100 ring-amber-300/40', text: 'You have an exam in progress. Return to the desktop app to continue where you left off.' },
  done: { label: 'Submitted', tone: 'bg-white/20 text-white ring-white/40', text: 'Your answers are submitted. Results are released after review.' },
  closed: { label: 'Closed', tone: 'bg-slate-400/20 text-slate-100 ring-slate-300/40', text: 'The exam window has closed.' },
  blocked: { label: 'Disqualified', tone: 'bg-rose-400/20 text-rose-100 ring-rose-300/40', text: 'This attempt was ended under the exam policy. Contact your exam organization if you think this is a mistake.' },
}

/* ------------------------------------------------------------------ device checks (run in the browser) */

type CheckState = 'idle' | 'running' | 'pass' | 'warn' | 'fail'
interface Check { id: string; label: string; icon: LucideIcon; state: CheckState; detail: string }

const INITIAL_CHECKS: Check[] = [
  { id: 'os', label: 'Operating system', icon: Laptop, state: 'idle', detail: 'Windows 10/11 or macOS 12+' },
  { id: 'camera', label: 'Webcam', icon: Camera, state: 'idle', detail: 'Needed for identity and proctoring' },
  { id: 'mic', label: 'Microphone', icon: Mic, state: 'idle', detail: 'Needed for audio monitoring' },
  { id: 'network', label: 'Connection to exam server', icon: Wifi, state: 'idle', detail: 'Latency under 400 ms' },
  { id: 'display', label: 'Screen share', icon: Monitor, state: 'idle', detail: 'Your entire screen is shared with your proctor' },
  { id: 'cpu', label: 'Processor and memory', icon: Cpu, state: 'idle', detail: '4 logical cores recommended' },
]

async function runCheck(id: string): Promise<Pick<Check, 'state' | 'detail'>> {
  switch (id) {
    case 'os': {
      const ua = navigator.userAgent
      const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown'
      return os === 'Unknown' ? { state: 'warn', detail: 'Could not identify your OS' } : { state: os === 'Linux' ? 'warn' : 'pass', detail: os === 'Linux' ? 'Linux: use the AppImage build' : `${os} detected` }
    }
    case 'camera':
    case 'mic': {
      if (!navigator.mediaDevices?.enumerateDevices) return { state: 'fail', detail: 'Media devices are not available in this browser' }
      const devices = await navigator.mediaDevices.enumerateDevices()
      const kind = id === 'camera' ? 'videoinput' : 'audioinput'
      const n = devices.filter((d) => d.kind === kind).length
      return n ? { state: 'pass', detail: `${n} device${n > 1 ? 's' : ''} found` } : { state: 'fail', detail: `No ${id === 'camera' ? 'webcam' : 'microphone'} found` }
    }
    case 'network': {
      const t = performance.now()
      const r = await fetch(`${API_ORIGIN}/health`, { cache: 'no-store' }).catch(() => null)
      const ms = Math.round(performance.now() - t)
      if (!r?.ok) return { state: 'fail', detail: 'Exam server unreachable' }
      return { state: ms > 400 ? 'warn' : 'pass', detail: `${ms} ms round trip` }
    }
    case 'display': {
      const extended = (window.screen as Screen & { isExtended?: boolean }).isExtended
      return extended ? { state: 'fail', detail: 'More than one display is connected' } : { state: 'pass', detail: `${window.screen.width}×${window.screen.height}` }
    }
    case 'cpu': {
      const cores = navigator.hardwareConcurrency ?? 0
      const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
      return { state: cores >= 4 ? 'pass' : 'warn', detail: `${cores || '?'} cores${mem ? ` · ${mem} GB+ memory` : ''}` }
    }
    default:
      return { state: 'warn', detail: 'Unknown check' }
  }
}

/* ------------------------------------------------------------------ pieces */

function Ring({ value, total, children }: { value: number; total: number; children: ReactNode }) {
  const r = 86
  const c = 2 * Math.PI * r
  const frac = total > 0 ? Math.min(1, Math.max(0, value / total)) : 1
  return (
    <div className="relative grid h-56 w-56 place-items-center">
      <svg viewBox="0 0 200 200" className="absolute inset-0 -rotate-90" aria-hidden>
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffb020" />
            <stop offset="1" stopColor="#38bdf8" />
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r={r} fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="12" />
        <motion.circle cx="100" cy="100" r={r} fill="none" stroke="url(#ringGrad)" strokeWidth="12" strokeLinecap="round" strokeDasharray={c} animate={{ strokeDashoffset: c * (1 - frac) }} transition={{ type: 'spring', stiffness: 40, damping: 16 }} />
      </svg>
      <div className="text-center">{children}</div>
    </div>
  )
}

/** Released score with a link to the answer review, or when that review opens. */
function ResultCard({ summary, release }: { summary: ResultSummary; release?: ResultRelease }) {
  const counts = [
    { label: 'Correct', value: summary.correct, cls: 'text-success' },
    { label: 'Wrong', value: summary.wrong, cls: 'text-danger' },
    { label: 'Unanswered', value: summary.unanswered, cls: 'text-muted' },
  ]
  return (
    <section aria-labelledby="result-h" className="rounded-3xl border border-border bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <h2 id="result-h" className="flex items-center gap-2 font-heading text-lg font-semibold"><Award className="h-5 w-5 text-primary" aria-hidden /> Your result</h2>
          <p className="mt-3 font-heading text-4xl font-bold tabular-nums text-ink">
            {summary.score}<span className="text-xl font-semibold text-muted"> / {summary.totalMarks} marks</span>
          </p>
          <p className="mt-1 text-sm text-muted">{summary.percent}%{summary.negativeMarking.enabled ? ` · includes −${summary.negativeMarking.value} of a question's marks per wrong answer` : ''}{summary.penaltyMarks ? ` · ${summary.penaltyMarks} marks deducted after proctor review` : ''}</p>
        </div>
        <dl className="grid grid-cols-3 gap-3 text-center">
          {counts.map((c) => (
            <div key={c.label} className="min-w-20 rounded-2xl bg-soft px-3 py-2">
              <dt className="text-xs text-muted">{c.label}</dt>
              <dd className={`font-heading text-xl font-semibold tabular-nums ${c.cls}`}>{c.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-soft" role="img" aria-label={`${summary.percent} percent`}>
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, summary.percent)}%` }} />
      </div>
      <div className="mt-5">
        {release?.reviewReleased ? (
          <Link href="/lobby/results" className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110">
            <BookOpenCheck className="h-4 w-4" aria-hidden /> Review your answers
          </Link>
        ) : (
          <p className="text-sm text-muted">The answer review opens when the exam window closes{release?.reviewOpensAt ? `, at ${fmt(release.reviewOpensAt)}` : ''}.</p>
        )}
      </div>
    </section>
  )
}

function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary"><Icon className="h-5 w-5" aria-hidden /></span>
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className="truncate font-heading text-base font-semibold text-ink">{value}</p>
      </div>
    </div>
  )
}

const CHECK_STYLE: Record<CheckState, { icon: LucideIcon; cls: string }> = {
  idle: { icon: Clock, cls: 'text-slate-400' },
  running: { icon: Loader2, cls: 'animate-spin text-accent' },
  pass: { icon: CheckCircle2, cls: 'text-success' },
  warn: { icon: AlertTriangle, cls: 'text-warning' },
  fail: { icon: XCircle, cls: 'text-danger' },
}

const JOURNEY: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Download, title: 'Install the exam app', body: 'One-time install of the Smart Proctor desktop app.' },
  { icon: ListChecks, title: 'System check', body: 'Camera, microphone and network.' },
  { icon: ScanFace, title: 'Verify identity', body: 'Face match plus a one-time code sent to your email.' },
  { icon: FileCheck2, title: 'Consent and screen share', body: 'Review exactly what is monitored, then share your screen.' },
  { icon: Lock, title: 'Take the exam', body: 'Full-screen exam with autosave and a server-synced timer.' },
]

const MONITORED = [
  { icon: Camera, text: 'Webcam frames, analysed for faces, gaze and identity' },
  { icon: Monitor, text: 'Your entire screen while the exam is open' },
  { icon: Globe2, text: 'AI tools and searches, read from window titles and your shared screen' },
  { icon: Keyboard, text: 'Typing rhythm and mouse movement summaries (never the keys themselves)' },
]

/* ------------------------------------------------------------------ page */

export default function LobbyPage() {
  useRequireRole(['CANDIDATE'])
  const [lobby, setLobby] = useState<Lobby | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [loadedAt, setLoadedAt] = useState(() => Date.now())
  const [checks, setChecks] = useState<Check[]>(INITIAL_CHECKS)

  const load = useCallback(async () => {
    setError(null)
    try {
      setLobby(await getLobby())
      setLoadedAt(Date.now())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your exam.')
    }
  }, [])

  const runChecks = useCallback(async () => {
    for (const c of INITIAL_CHECKS) {
      setChecks((prev) => prev.map((x) => (x.id === c.id ? { ...x, state: 'running' } : x)))
      const r = await runCheck(c.id).catch(() => ({ state: 'fail' as const, detail: 'Check failed' }))
      await new Promise((res) => setTimeout(res, 250))
      setChecks((prev) => prev.map((x) => (x.id === c.id ? { ...x, ...r } : x)))
    }
  }, [])

  useEffect(() => {
    void load()
    void runChecks()
    const tick = window.setInterval(() => setNow(Date.now()), 1000)
    const refresh = window.setInterval(() => void load(), 30_000)
    return () => {
      window.clearInterval(tick)
      window.clearInterval(refresh)
    }
  }, [load, runChecks])

  const msLeft = lobby ? lobby.msToStart - (now - loadedAt) : 0
  const t = split(msLeft)
  const phase = lobby ? phaseOf(lobby) : 'upcoming'
  const passed = checks.filter((c) => c.state === 'pass').length
  const deepLink = lobby ? `dev102://exam?code=${encodeURIComponent(lobby.exam.code)}&user=${encodeURIComponent(lobby.candidate.userId)}` : '#'
  const firstName = lobby?.candidate.name.split(' ')[0] ?? ''
  const step = useMemo(() => (phase === 'done' ? 5 : phase === 'in-progress' ? 4 : lobby?.faceRegistered ? 2 : 0), [phase, lobby])

  if (error && !lobby) {
    return (
      <main className="mx-auto grid min-h-[60vh] max-w-lg place-items-center px-6 text-center">
        <div>
          <AlertTriangle className="mx-auto h-10 w-10 text-danger" aria-hidden />
          <h1 className="mt-3 font-heading text-xl font-semibold">We could not load your exam</h1>
          <p className="mt-1 text-sm text-muted">{error}</p>
          <button type="button" onClick={() => void load()} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white"><RefreshCw className="h-4 w-4" aria-hidden /> Try again</button>
        </div>
      </main>
    )
  }

  return (
    <main className="bg-soft pb-16">
      {/* Hero */}
      <section className="relative overflow-hidden bg-[radial-gradient(120%_120%_at_0%_0%,#1d4ed8_0%,#0b2a6f_45%,#071634_100%)] text-white">
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.18]" aria-hidden>
          <defs>
            <pattern id="grid" width="36" height="36" patternUnits="userSpaceOnUse"><path d="M36 0H0V36" fill="none" stroke="white" strokeWidth="0.6" /></pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
        <motion.div aria-hidden className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-sky-400/30 blur-3xl" animate={{ scale: [1, 1.15, 1] }} transition={{ repeat: Infinity, duration: 9 }} />
        <motion.div aria-hidden className="absolute -bottom-32 left-1/3 h-80 w-80 rounded-full bg-amber-400/20 blur-3xl" animate={{ scale: [1.1, 0.95, 1.1] }} transition={{ repeat: Infinity, duration: 11 }} />

        <div className="relative mx-auto grid max-w-6xl gap-10 px-6 py-14 lg:grid-cols-[1.3fr_1fr] lg:items-center">
          <div>
            {!lobby ? (
              <div className="space-y-4" aria-busy="true">
                <div className="h-6 w-40 animate-pulse rounded-full bg-white/20" />
                <div className="h-10 w-3/4 animate-pulse rounded-xl bg-white/20" />
                <div className="h-5 w-2/3 animate-pulse rounded-lg bg-white/15" />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  {lobby.candidate.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed API URL
                    <img src={lobby.candidate.photoUrl} alt="" className="h-14 w-14 rounded-2xl object-cover ring-2 ring-white/60" />
                  ) : (
                    <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/15 font-heading text-lg font-semibold ring-2 ring-white/30">{firstName.slice(0, 1)}</span>
                  )}
                  <div>
                    <p className="text-sm text-white/70">Welcome back</p>
                    <p className="font-heading text-lg font-semibold">{lobby.candidate.name}</p>
                  </div>
                  <span className={`ml-auto rounded-full px-3 py-1 text-xs font-semibold ring-1 lg:ml-4 ${PHASE_META[phase].tone}`}>{PHASE_META[phase].label}</span>
                </div>
                <h1 className="mt-6 font-heading text-3xl font-bold leading-tight sm:text-4xl">{lobby.exam.title}</h1>
                <p className="mt-3 max-w-xl text-white/80">
                  {phase === 'done' && lobby.result?.summary ? 'Your results are ready.' : phase === 'done' && lobby.result?.message ? lobby.result.message : PHASE_META[phase].text}
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  {(phase === 'open' || phase === 'in-progress' || phase === 'upcoming') && (
                    <a href={deepLink} className="group inline-flex items-center gap-2 rounded-xl bg-cta px-5 py-3 text-sm font-bold text-slate-900 shadow-lg shadow-black/20 transition hover:brightness-105">
                      <Laptop className="h-4 w-4" aria-hidden /> {phase === 'in-progress' ? 'Resume in the exam app' : 'Open the exam app'}
                      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
                    </a>
                  )}
                  <Link href="/download" className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold ring-1 ring-white/30 backdrop-blur transition hover:bg-white/20">
                    <Download className="h-4 w-4" aria-hidden /> Download the app
                  </Link>
                </div>
                <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/75">
                  <div><dt className="inline">Exam ID </dt><dd className="inline font-mono font-semibold text-white">{lobby.exam.code}</dd></div>
                  <div><dt className="inline">Candidate ID </dt><dd className="inline font-mono font-semibold text-white">{lobby.candidate.userId}</dd></div>
                  <div><dt className="inline">Opens </dt><dd className="inline font-semibold text-white">{fmt(lobby.exam.startsAt)}</dd></div>
                </dl>
              </>
            )}
          </div>

          <div className="justify-self-center">
            <Ring value={phase === 'upcoming' ? Math.max(0, 86_400_000 - msLeft) : 1} total={phase === 'upcoming' ? 86_400_000 : 1}>
              <AnimatePresence mode="wait">
                {phase === 'upcoming' ? (
                  <motion.div key="cd" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <p className="text-xs uppercase tracking-[0.2em] text-white/60">Starts in</p>
                    <p className="mt-1 font-mono text-3xl font-bold tabular-nums">{t.d > 0 ? `${t.d}d ${pad(t.h)}h` : `${pad(t.h)}:${pad(t.m)}:${pad(t.s)}`}</p>
                  </motion.div>
                ) : phase === 'done' ? (
                  <motion.div key="done" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                    {lobby?.result?.summary ? (
                      <p className="font-heading text-4xl font-bold tabular-nums">{Math.round(lobby.result.summary.percent)}%</p>
                    ) : (
                      <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-300" aria-hidden />
                    )}
                    <p className="mt-2 text-sm font-semibold">{lobby?.result?.summary ? 'Score' : 'Submitted'}</p>
                    {lobby?.result?.receiptId && <p className="mt-1 font-mono text-xs text-white/70">{lobby.result.receiptId}</p>}
                  </motion.div>
                ) : (
                  <motion.div key="live" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <span className="relative mx-auto flex h-4 w-4">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-70" />
                      <span className="relative inline-flex h-4 w-4 rounded-full bg-emerald-400" />
                    </span>
                    <p className="mt-3 font-heading text-2xl font-bold">{phase === 'in-progress' ? 'In progress' : phase === 'blocked' ? 'Ended' : phase === 'closed' ? 'Closed' : 'Live'}</p>
                    {lobby && <p className="mt-1 text-xs text-white/70">{lobby.exam.durationMin} min · {lobby.exam.questionCount} questions</p>}
                  </motion.div>
                )}
              </AnimatePresence>
            </Ring>
          </div>
        </div>
      </section>

      <div className="mx-auto -mt-8 max-w-6xl space-y-8 px-6">
        {/* Exam facts */}
        {lobby && (
          <div className="relative grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon={Timer} label="Duration" value={`${lobby.exam.durationMin} minutes`} />
            <Stat icon={ListChecks} label="Questions" value={`${lobby.exam.questionCount} · ${lobby.exam.totalMarks} marks`} />
            <Stat icon={ShieldCheck} label="Warnings allowed" value={`${lobby.exam.settings.maxWarnings} before auto-submit`} />
            <Stat icon={Clock} label="Late entry" value={lobby.lateEntryMin ? `Up to ${lobby.lateEntryMin} min after start` : 'Not allowed'} />
          </div>
        )}

        {lobby?.result?.summary && <ResultCard summary={lobby.result.summary} release={lobby.result.release} />}

        <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
          {/* Journey */}
          <section className="rounded-3xl border border-border bg-white p-6 shadow-sm">
            <h2 className="font-heading text-lg font-semibold">Your exam journey</h2>
            <p className="text-sm text-muted">Everything after step 1 happens inside the desktop app.</p>
            <ol className="relative mt-6 space-y-5 before:absolute before:left-5 before:top-2 before:h-[calc(100%-1rem)] before:w-0.5 before:bg-border">
              {JOURNEY.map((j, i) => {
                const done = i < step
                const current = i === step
                return (
                  <motion.li key={j.title} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }} className="relative flex gap-4">
                    <span className={`relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full ring-4 ring-white ${done ? 'bg-success text-white' : current ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'bg-soft text-muted'}`}>
                      {done ? <CheckCircle2 className="h-5 w-5" aria-hidden /> : <j.icon className="h-5 w-5" aria-hidden />}
                    </span>
                    <div className="pt-1">
                      <p className={`font-semibold ${current ? 'text-primary' : 'text-ink'}`}>{j.title}{current && <span className="ml-2 rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary">Next</span>}</p>
                      <p className="text-sm text-muted">{j.body}</p>
                    </div>
                  </motion.li>
                )
              })}
            </ol>
          </section>

          {/* Device readiness */}
          <section className="rounded-3xl border border-border bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-heading text-lg font-semibold">Device readiness</h2>
                <p className="text-sm text-muted">A quick preview. The exam app runs the full check.</p>
              </div>
              <button type="button" onClick={() => { setChecks(INITIAL_CHECKS); void runChecks() }} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-primary hover:bg-soft">
                <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Re-run
              </button>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-soft">
              <motion.div className="h-full rounded-full bg-gradient-to-r from-primary to-sky-400" animate={{ width: `${(passed / checks.length) * 100}%` }} />
            </div>
            <ul className="mt-4 divide-y divide-border">
              {checks.map((c) => {
                const S = CHECK_STYLE[c.state]
                return (
                  <li key={c.id} className="flex items-center gap-3 py-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-soft text-primary"><c.icon className="h-4 w-4" aria-hidden /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{c.label}</p>
                      <p className="truncate text-xs text-muted">{c.detail}</p>
                    </div>
                    <S.icon className={`h-5 w-5 ${S.cls}`} aria-label={c.state} />
                  </li>
                )
              })}
            </ul>
          </section>
        </div>

        {/* Instructions and transparency */}
        <div className="grid gap-8 lg:grid-cols-2">
          <section className="rounded-3xl border border-border bg-white p-6 shadow-sm">
            <h2 className="flex items-center gap-2 font-heading text-lg font-semibold"><FileCheck2 className="h-5 w-5 text-primary" aria-hidden /> Instructions</h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink/80">{lobby?.instructions ?? 'Loading…'}</p>
            {lobby && lobby.exam.settings.allowedSites.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Reference sites you may open</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {lobby.exam.settings.allowedSites.map((s) => <span key={s} className="rounded-full bg-primary-50 px-3 py-1 font-mono text-xs text-primary">{s}</span>)}
                </div>
              </div>
            )}
          </section>
          <section className="rounded-3xl bg-gradient-to-br from-[#0b2a6f] to-[#1d4ed8] p-6 text-white shadow-lg">
            <h2 className="flex items-center gap-2 font-heading text-lg font-semibold"><Eye className="h-5 w-5 text-cta" aria-hidden /> What is monitored</h2>
            <ul className="mt-4 space-y-3">
              {MONITORED.map((m) => (
                <li key={m.text} className="flex gap-3 text-sm text-white/85"><m.icon className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" aria-hidden />{m.text}</li>
              ))}
            </ul>
            <p className="mt-5 rounded-xl bg-white/10 p-3 text-xs text-white/75">Monitoring runs only while your exam is open. Every flag is reviewed by a person before any penalty is final.</p>
          </section>
        </div>
      </div>
    </main>
  )
}
