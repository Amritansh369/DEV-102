import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Info, Loader2, MonitorX, RefreshCw, Search, Send, X } from 'lucide-react'
import type { Exam, Severity } from '../lib/types'
import { monitorApi, type FeedViolation, type MonitorSession } from '../lib/api'
import { watchExam } from '../lib/live'
import { STATUS_LABEL, formatClock, useNow } from '../lib/monitorUtils'
import { riskLevel, SEVERITY_STYLES } from '../components/RiskBadge'
import { StatsStrip } from '../components/StatsStrip'
import { StudentTile } from '../components/StudentTile'
import { ViolationFeed } from '../components/ViolationFeed'
import { SessionDrawer, WarnDialog } from '../components/SessionDrawer'

type ToastKind = 'success' | 'error' | 'info'
type Notify = (kind: ToastKind, message: string) => void
type LoadState = 'loading' | 'ready' | 'error'
type RiskFilter = 'ALL' | Severity
type StatusFilter = 'ALL' | MonitorSession['status']
type SortKey = 'risk' | 'recent' | 'name' | 'progress' | 'warnings'

interface MentorMonitorProps {
  /** Wire to the app toast store; a local toast stack is used when omitted. */
  notify?: Notify
  onExit?: () => void
}

const PAGE = 12
const RISKS: RiskFilter[] = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
const SORTS: { id: SortKey; label: string }[] = [
  { id: 'risk', label: 'Highest risk' },
  { id: 'recent', label: 'Latest violation' },
  { id: 'warnings', label: 'Most warnings' },
  { id: 'progress', label: 'Progress' },
  { id: 'name', label: 'Name (A–Z)' },
]
const TOAST_ICON = { success: CheckCircle2, error: AlertTriangle, info: Info }
const TOAST_TONE = { success: 'text-success', error: 'text-danger', info: 'text-accent' }

export default function MentorMonitor({ notify, onExit }: MentorMonitorProps) {
  const now = useNow(3000)
  const [exams, setExams] = useState<Exam[]>([])
  const [examsState, setExamsState] = useState<LoadState>('loading')
  const [examId, setExamId] = useState('')
  const [sessions, setSessions] = useState<MonitorSession[]>([])
  const [feed, setFeed] = useState<FeedViolation[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [liveError, setLiveError] = useState(false)
  const [auto, setAuto] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [updatedAt, setUpdatedAt] = useState(0)
  const [q, setQ] = useState('')
  const [risk, setRisk] = useState<RiskFilter>('ALL')
  const [status, setStatus] = useState<StatusFilter>('ALL')
  const [sort, setSort] = useState<SortKey>('risk')
  const [limit, setLimit] = useState(PAGE)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [snapshots, setSnapshots] = useState<Record<string, string>>({})
  const [drawerId, setDrawerId] = useState<string | null>(null)
  const [warnTargets, setWarnTargets] = useState<MonitorSession[] | null>(null)
  const [toasts, setToasts] = useState<{ id: number; kind: ToastKind; message: string }[]>([])
  const searchRef = useRef<HTMLInputElement>(null)
  const toastSeq = useRef(0)
  const reqRef = useRef(0)
  const busyRef = useRef(false)

  const say = useCallback<Notify>((kind, message) => {
    if (notify) { notify(kind, message); return }
    const id = ++toastSeq.current
    setToasts((t) => [...t.slice(-3), { id, kind, message }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
  }, [notify])

  const loadExams = useCallback(async () => {
    setExamsState('loading')
    try {
      const list = await monitorApi.listExams()
      setExams(list)
      setExamId((prev) => prev || list[0]?.id || '')
      setExamsState('ready')
    } catch {
      setExamsState('error')
    }
  }, [])
  useEffect(() => { void loadExams() }, [loadExams])

  const loadSnapshot = useCallback(async (id: string) => {
    const req = ++reqRef.current
    setLoadState('loading')
    setSelected(new Set())
    setDrawerId(null)
    setLiveError(false)
    try {
      const snap = await monitorApi.getSnapshot(id)
      if (req !== reqRef.current) return
      setSessions(snap.sessions)
      setFeed(snap.feed)
      setUpdatedAt(Date.now())
      setLoadState('ready')
    } catch {
      if (req === reqRef.current) setLoadState('error')
    }
  }, [])
  useEffect(() => { if (examId) void loadSnapshot(examId) }, [examId, loadSnapshot])

  const refresh = useCallback(async (manual: boolean) => {
    if (!examId || busyRef.current) return
    busyRef.current = true
    if (manual) setRefreshing(true)
    const req = reqRef.current
    try {
      const r = await monitorApi.tick(examId)
      if (req !== reqRef.current) return
      setSessions(r.sessions)
      if (r.newViolations.length) setFeed((f) => [...r.newViolations.slice().reverse(), ...f].slice(0, 200))
      setUpdatedAt(Date.now())
      setLiveError(false)
    } catch {
      setLiveError(true)
      if (manual) say('error', 'Could not refresh. Live updates will keep retrying.')
    } finally {
      busyRef.current = false
      setRefreshing(false)
    }
  }, [examId, say])

  useEffect(() => { setSnapshots({}) }, [examId])

  // Socket pushes replace polling: each change schedules one refresh, coalescing bursts of events.
  useEffect(() => {
    if (!auto || loadState !== 'ready' || !examId) return
    let timer = 0
    const schedule = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void refresh(false), 300)
    }
    const stop = watchExam(examId, {
      onChange: schedule,
      onSnapshot: (e) => setSnapshots((cur) => ({ ...cur, [e.sessionId]: e.image })),
      onConnection: (connected) => setLiveError(!connected),
    })
    return () => {
      window.clearTimeout(timer)
      stop()
    }
  }, [auto, loadState, examId, refresh])

  useEffect(() => { setLimit(PAGE) }, [q, risk, status, sort, examId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input,textarea,select,[role="dialog"]') || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus() }
      if (e.key.toLowerCase() === 'r') void refresh(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [refresh])

  const exam = exams.find((e) => e.id === examId)
  const visible = useMemo(() => {
    const term = q.trim().toLowerCase()
    const list = sessions.filter((s) => (risk === 'ALL' || riskLevel(s.riskScore) === risk) && (status === 'ALL' || s.status === status) && (!term || s.candidateName.toLowerCase().includes(term) || s.userId.toLowerCase().includes(term)))
    const lastAt = (s: MonitorSession) => (s.lastViolation ? Date.parse(s.lastViolation.at) : 0)
    return list.sort((a, b) => {
      switch (sort) {
        case 'name': return a.candidateName.localeCompare(b.candidateName)
        case 'progress': return b.progress - a.progress
        case 'warnings': return b.warnings - a.warnings || b.riskScore - a.riskScore
        case 'recent': return lastAt(b) - lastAt(a)
        default: return b.riskScore - a.riskScore
      }
    })
  }, [sessions, q, risk, status, sort])

  const violationsPerMin = feed.filter((v) => now - Date.parse(v.at) < 60000).length
  const drawerSession = sessions.find((s) => s.id === drawerId) ?? null
  const selectedLive = sessions.filter((s) => selected.has(s.id) && s.status === 'LIVE')
  const filtersActive = q !== '' || risk !== 'ALL' || status !== 'ALL'
  const clearFilters = () => { setQ(''); setRisk('ALL'); setStatus('ALL') }

  const toggle = (id: string) => setSelected((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const patchSession = (p: MonitorSession) => setSessions((prev) => prev.map((s) => (s.id === p.id ? p : s)))

  const warn = async (targets: MonitorSession[], message: string) => {
    const ids = new Set(targets.map((t) => t.id))
    const { sent } = await monitorApi.sendWarning([...ids], message)
    setSessions((prev) => prev.map((s) => (ids.has(s.id) && s.status === 'LIVE' ? { ...s, warnings: s.warnings + 1 } : s)))
    setSelected(new Set())
    say('success', `Warning sent to ${sent} candidate${sent === 1 ? '' : 's'}`)
  }
  const terminate = async (s: MonitorSession, reason: string) => {
    const done = await monitorApi.terminateSession(s.id, reason)
    patchSession(done)
    say('success', `${s.candidateName}'s session was terminated`)
  }

  if (examsState === 'error') {
    return (
      <div className="grid h-full place-items-center bg-soft p-8">
        <div role="alert" className="max-w-sm space-y-3 rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-border">
          <AlertTriangle className="mx-auto h-10 w-10 text-danger" />
          <h1 className="font-heading text-lg font-semibold text-text">Could not load your exams</h1>
          <p className="text-sm text-muted">Check your connection and try again.</p>
          <button onClick={() => void loadExams()} className="inline-flex items-center gap-2 rounded-xl bg-cta px-5 py-2 text-sm font-semibold text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-cta/40"><RefreshCw className="h-4 w-4" />Retry</button>
        </div>
      </div>
    )
  }

  const loading = loadState === 'loading'
  const minsLeft = exam ? Math.max(0, Math.round((Date.parse(exam.endsAt) - now) / 60000)) : 0

  return (
    <div className="flex h-full min-h-0 flex-col bg-soft">
      <header className="flex flex-wrap items-center gap-4 border-b border-border bg-white px-6 py-4">
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-xl font-semibold text-text">Live monitoring</h1>
          {examsState === 'loading' ? <div className="mt-2 h-4 w-64 animate-pulse rounded bg-soft" /> : exam && <p className="truncate text-sm text-muted">{exam.code} · {exam.candidateCount} candidates · {minsLeft} min left · ends {formatClock(exam.endsAt).slice(0, 5)}</p>}
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-text">
          <span className="sr-only sm:not-sr-only">Exam</span>
          <select value={examId} onChange={(e) => setExamId(e.target.value)} disabled={examsState === 'loading'} className="max-w-[320px] rounded-xl border border-border bg-white px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20 disabled:opacity-60">
            {exams.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <button role="switch" aria-checked={auto} aria-label="Auto-refresh" onClick={() => setAuto(!auto)} className={`relative h-6 w-11 rounded-full transition focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/30 ${auto ? 'bg-success' : 'bg-slate-300'}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${auto ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
          <span className="text-sm text-text">Auto-refresh</span>
        </div>
        <button onClick={() => void refresh(true)} disabled={loading || refreshing} title="Refresh (R)" className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold text-text hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/30 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />Refresh
        </button>
        {onExit && <button onClick={onExit} className="rounded-xl border border-border px-3 py-2 text-sm font-semibold text-text hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/30">Exit</button>}
      </header>

      <main className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
        {liveError && (
          <div role="status" className="flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-2 text-sm text-text"><AlertTriangle className="h-4 w-4 text-amber-700" aria-hidden="true" />Live updates were interrupted. Retrying automatically{auto ? '' : '; turn on Auto-refresh or press Refresh'}.</div>
        )}
        <StatsStrip sessions={sessions} violationsPerMin={violationsPerMin} loading={loading} />

        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-border">
          <label className="relative min-w-[200px] flex-1">
            <span className="sr-only">Search candidates</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or user ID  ( / )" className="w-full rounded-xl border border-border py-2 pl-9 pr-8 text-sm focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20" />
            {q && <button onClick={() => setQ('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"><X className="h-3.5 w-3.5" /></button>}
          </label>
          <div role="radiogroup" aria-label="Filter by risk level" className="flex gap-1 rounded-xl bg-soft p-1">
            {RISKS.map((r) => (
              <button key={r} role="radio" aria-checked={risk === r} onClick={() => setRisk(r)} className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${risk === r ? 'bg-white text-text shadow-sm' : 'text-muted hover:text-text'}`}>
                {r !== 'ALL' && <span className={`h-2 w-2 rounded-full ${SEVERITY_STYLES[r].bar}`} aria-hidden="true" />}{r === 'ALL' ? 'All risk' : SEVERITY_STYLES[r].label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-muted">Status
            <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className="rounded-lg border border-border bg-white px-2 py-1.5 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              <option value="ALL">All</option>
              {(Object.keys(STATUS_LABEL) as MonitorSession['status'][]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-muted">Sort
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="rounded-lg border border-border bg-white px-2 py-1.5 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
        </div>

        <AnimatePresence>
          {selected.size > 0 && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="region" aria-label="Bulk actions" className="flex flex-wrap items-center gap-3 rounded-2xl bg-primary px-4 py-3 text-sm text-white shadow-md">
              <span className="font-semibold">{selected.size} selected</span>
              {selectedLive.length !== selected.size && <span className="text-white/70">({selectedLive.length} live can be warned)</span>}
              <button onClick={() => setWarnTargets(selectedLive)} disabled={selectedLive.length === 0} className="ml-auto flex items-center gap-1.5 rounded-lg bg-cta px-3 py-1.5 font-semibold text-slate-900 hover:brightness-95 focus:outline-none focus-visible:ring-4 focus-visible:ring-cta/40 disabled:opacity-50"><Send className="h-4 w-4" aria-hidden="true" />Warn selected</button>
              <button onClick={() => setSelected(new Set())} className="rounded-lg px-3 py-1.5 font-semibold hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white">Clear</button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section aria-label="Candidates">
            <div className="mb-2 flex items-center justify-between text-xs text-muted">
              <span aria-live="polite">{loading ? 'Loading candidates…' : `${visible.length} of ${sessions.length} candidates`}</span>
              <span className="flex items-center gap-3">
                {!loading && visible.some((s) => s.status === 'LIVE') && <button onClick={() => setSelected(new Set(visible.filter((s) => s.status === 'LIVE').map((s) => s.id)))} className="rounded font-semibold text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">Select all live</button>}
                {updatedAt > 0 && <span>Updated {formatClock(new Date(updatedAt).toISOString())}</span>}
              </span>
            </div>
            {loadState === 'error' ? (
              <div role="alert" className="grid place-items-center rounded-2xl border border-danger/30 bg-white py-16 text-center">
                <div className="space-y-3"><AlertTriangle className="mx-auto h-9 w-9 text-danger" /><p className="font-semibold text-text">Could not load candidates</p>
                  <button onClick={() => void loadSnapshot(examId)} className="inline-flex items-center gap-2 rounded-xl bg-cta px-5 py-2 text-sm font-semibold text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-cta/40"><RefreshCw className="h-4 w-4" />Retry</button></div>
              </div>
            ) : loading ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4" aria-busy="true">
                {Array.from({ length: 8 }, (_, i) => <div key={i} className="h-[330px] animate-pulse rounded-2xl bg-white ring-1 ring-border" />)}
              </div>
            ) : visible.length === 0 ? (
              <div className="grid place-items-center rounded-2xl border border-dashed border-border bg-white py-20 text-center">
                <div className="space-y-2"><MonitorX className="mx-auto h-9 w-9 text-muted" /><p className="font-semibold text-text">{sessions.length === 0 ? 'No candidates have joined yet' : 'No candidates match these filters'}</p>
                  {filtersActive && <button onClick={clearFilters} className="rounded text-sm font-semibold text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">Clear filters</button>}</div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
                  {visible.slice(0, limit).map((s) => (
                    <StudentTile key={s.id} session={s} liveImage={snapshots[s.id]} now={now} selected={selected.has(s.id)} onToggle={toggle} onWarn={(t) => setWarnTargets([t])} onOpen={(t) => setDrawerId(t.id)} />
                  ))}
                </div>
                {visible.length > limit && (
                  <div className="mt-4 text-center">
                    <button onClick={() => setLimit((l) => l + PAGE)} className="rounded-xl border border-border bg-white px-5 py-2 text-sm font-semibold text-text shadow-sm hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/30">Show {Math.min(PAGE, visible.length - limit)} more</button>
                  </div>
                )}
              </>
            )}
          </section>
          <ViolationFeed items={feed} loading={loading} onClear={() => setFeed([])} onOpenSession={setDrawerId} className="lg:sticky lg:top-0 lg:h-[calc(100vh-190px)] lg:min-h-[420px]" />
        </div>
      </main>

      <SessionDrawer session={drawerSession} onClose={() => setDrawerId(null)} onSendWarning={(s, m) => warn([s], m)} onTerminate={terminate} onSessionPatch={patchSession} notify={say} />
      {warnTargets && <WarnDialog targets={warnTargets} onSend={(m) => warn(warnTargets, m)} onClose={() => setWarnTargets(null)} />}

      {!notify && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-[80] flex -translate-x-1/2 flex-col gap-2" role="status" aria-live="polite">
          <AnimatePresence>
            {toasts.map((t) => {
              const Icon = TOAST_ICON[t.kind]
              return (
                <motion.div key={t.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="pointer-events-auto flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm text-text shadow-lg ring-1 ring-border">
                  <Icon className={`h-4 w-4 ${TOAST_TONE[t.kind]}`} aria-hidden="true" />{t.message}
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}
      {refreshing && <span className="sr-only"><Loader2 />Refreshing</span>}
    </div>
  )
}
