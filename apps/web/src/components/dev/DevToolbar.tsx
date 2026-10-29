'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { Activity, Database, Inbox, LogIn, RefreshCw, Server, Sparkles, Wifi, X, Zap } from 'lucide-react'
import { API_ORIGIN, get, post, setToken } from '@/lib/http'
import { homeFor, useSession, type SessionUser } from '@/lib/session'

interface DevStatus {
  env: string
  uptimeSec: number
  db: { ok: boolean; ms?: number; error?: string }
  agent: { ok: boolean; circuitOpen: boolean; detail?: { vision?: Record<string, boolean>; llm?: boolean } | string }
  sockets: number
  smtp: 'smtp' | 'outbox'
  reseeding: boolean
  counts: { exams: number; candidates: number; liveSessions: number; violations: number; emails: number }
  demo: Record<'admin' | 'mentor', { email: string; password: string }> & Record<'candidate' | 'candidate2', { examId: string; userId: string; password: string }>
}
interface OutboxMail { id: string; at: string; to: string; kind: string; subject: string; status: string; error: string | null; html: string | null }

const CODES = ['MULTIPLE_FACES', 'NO_FACE', 'GAZE_AWAY', 'AI_SITE_OPENED', 'AI_QUERY_DETECTED', 'WINDOW_BLUR', 'CLIPBOARD_USE', 'MULTI_MONITOR', 'VM_DETECTED', 'VOICE_DETECTED', 'MIC_BLOCKED', 'PHONE_DETECTED', 'NOTES_DETECTED'] as const
type Tab = 'status' | 'pages' | 'actions' | 'outbox'

function Dot({ ok }: { ok: boolean }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${ok ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-rose-500 shadow-[0_0_8px_#f43f5e]'}`} aria-hidden />
}

/**
 * Floating developer toolbar (development builds only): service health, one-click demo sign-in,
 * violation injection, database reseed and the email outbox. Toggle with Ctrl+Shift+D.
 */
export default function DevToolbar() {
  const router = useRouter()
  const setUser = useSession((s) => s.setUser)
  const user = useSession((s) => s.user)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('status')
  const [status, setStatus] = useState<DevStatus | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [outbox, setOutbox] = useState<OutboxMail[]>([])
  const [preview, setPreview] = useState<OutboxMail | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setStatus(await get<DevStatus>('/dev/status'))
      setStatusError(null)
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : 'API unreachable')
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!open) return
    void refresh()
    const id = window.setInterval(() => void refresh(), 5000)
    return () => window.clearInterval(id)
  }, [open, refresh])

  useEffect(() => {
    if (open && tab === 'outbox') void get<OutboxMail[]>('/dev/outbox').then(setOutbox).catch(() => setOutbox([]))
  }, [open, tab])

  const [ids, setIds] = useState<{ exam?: string; session?: string }>({})
  useEffect(() => {
    if (!open || tab !== 'pages' || ids.exam) return
    // Staff-only lookups: fill real ids when the current account may read them.
    void get<{ items: { id: string }[] }>('/exams?pageSize=1&status=LIVE').then((r) => setIds((x) => ({ ...x, exam: r.items[0]?.id }))).catch(() => undefined)
    void get<{ id: string }[]>('/sessions?status=LIVE').then((r) => setIds((x) => ({ ...x, session: r[0]?.id }))).catch(() => undefined)
  }, [open, tab, ids.exam])

  const signOut = () => {
    void post('/auth/logout').catch(() => undefined)
    useSession.getState().logout()
    router.push('/login')
  }

  const run = async (label: string, fn: () => Promise<string | void>) => {
    setBusy(label)
    setNote(null)
    try {
      const msg = await fn()
      setNote(typeof msg === "string" ? msg : `${label}: done`)
    } catch (e) {
      setNote(`${label}: ${e instanceof Error ? e.message : 'failed'}`)
    } finally {
      setBusy(null)
      void refresh()
    }
  }

  const signInAs = (role: 'admin' | 'mentor' | 'candidate') =>
    run(`Sign in as ${role}`, async () => {
      const demo = status?.demo
      if (!demo) throw new Error('Status not loaded yet')
      const r = role === 'candidate'
        ? await post<{ token: string; user: SessionUser }>('/auth/login', { examId: demo.candidate.examId, userId: demo.candidate.userId, password: demo.candidate.password, channel: 'web' })
        : await post<{ token: string; user: SessionUser }>('/auth/staff/login', { email: demo[role].email, password: demo[role].password })
      setToken(r.token)
      setUser(r.user)
      router.push(homeFor(r.user.role))
      return `Signed in as ${r.user.name}`
    })

  const agentVision = status && typeof status.agent.detail === 'object' ? status.agent.detail.vision : undefined

  return (
    <div className="fixed bottom-4 left-20 z-[150] font-sans text-[13px]">
      <AnimatePresence>
        {open && (
          <motion.section
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            aria-label="Developer toolbar"
            className="mb-3 w-[380px] overflow-hidden rounded-2xl border border-white/10 bg-[#071634]/95 text-slate-100 shadow-[0_24px_60px_-12px_rgba(3,10,30,.7)] backdrop-blur-xl"
          >
            <header className="flex items-center justify-between bg-gradient-to-r from-[#0b2a6f] via-[#1d4ed8] to-[#38bdf8] px-4 py-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" aria-hidden />
                <span className="font-semibold tracking-wide">DEV102 dev toolbar</span>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close dev toolbar" className="rounded-lg p-1 hover:bg-white/15"><X className="h-4 w-4" /></button>
            </header>

            <nav className="flex gap-1 border-b border-white/10 px-3 pt-2" role="tablist">
              {(['status', 'pages', 'actions', 'outbox'] as Tab[]).map((t) => (
                <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)} className={`rounded-t-lg px-3 py-1.5 text-xs font-medium capitalize ${tab === t ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`}>{t}</button>
              ))}
            </nav>

            <div className="max-h-[60vh] overflow-y-auto p-4">

              {tab === 'status' && (
                <div className="space-y-3">
                  {statusError && <p className="rounded-xl bg-rose-500/15 p-3 text-rose-200">API at {API_ORIGIN}: {statusError}</p>}
                  <ul className="grid grid-cols-2 gap-2">
                    {[
                      { icon: Server, label: 'API', ok: Boolean(status), detail: status ? `${status.env} · up ${Math.round(status.uptimeSec / 60)}m` : '…' },
                      { icon: Database, label: 'Postgres', ok: Boolean(status?.db.ok), detail: status?.db.ok ? `${status.db.ms} ms` : status?.db.error ?? '…' },
                      { icon: Activity, label: 'AI agent', ok: Boolean(status?.agent.ok), detail: status?.agent.ok ? (agentVision ? Object.entries(agentVision).filter(([, v]) => v).map(([k]) => k).join(', ') || 'no models' : 'online') : status?.agent.circuitOpen ? 'circuit open' : 'offline' },
                      { icon: Wifi, label: 'Sockets', ok: true, detail: `${status?.sockets ?? 0} connected` },
                    ].map(({ icon: Icon, label, ok, detail }) => (
                      <li key={label} className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
                        <div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-slate-300"><Icon className="h-3.5 w-3.5" aria-hidden />{label}</span><Dot ok={ok} /></div>
                        <p className="mt-1 truncate text-xs text-slate-400" title={detail}>{detail}</p>
                      </li>
                    ))}
                  </ul>
                  {status && (
                    <div className="grid grid-cols-5 gap-1 rounded-xl bg-white/5 p-2 text-center ring-1 ring-white/10">
                      {Object.entries(status.counts).map(([k, v]) => (
                        <div key={k}><p className="text-base font-semibold text-white">{v}</p><p className="text-[10px] uppercase tracking-wide text-slate-400">{k.replace('liveSessions', 'live')}</p></div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-slate-400">Mail: <strong className="text-slate-200">{status?.smtp === 'smtp' ? 'SMTP' : 'dev outbox (no SMTP set)'}</strong> · Signed in: <strong className="text-slate-200">{user ? `${user.name} (${user.role})` : 'nobody'}</strong></p>
                </div>
              )}

              {tab === 'actions' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Quick sign-in</h3>
                    <div className="grid grid-cols-3 gap-2">
                      {(['admin', 'mentor', 'candidate'] as const).map((r) => (
                        <button key={r} type="button" disabled={busy !== null || !status} onClick={() => void signInAs(r)} className="inline-flex items-center justify-center gap-1 rounded-xl bg-white/10 px-2 py-2 text-xs font-medium capitalize hover:bg-white/20 disabled:opacity-50"><LogIn className="h-3.5 w-3.5" aria-hidden />{r}</button>
                      ))}
                    </div>
                    {status && <p className="mt-2 text-[11px] leading-5 text-slate-400">Desktop candidate: exam <code className="text-sky-300">{status.demo.candidate.examId}</code> · user <code className="text-sky-300">{status.demo.candidate.userId}</code> · <code className="text-sky-300">{status.demo.candidate.password}</code></p>}
                  </div>
                  <div>
                    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Inject a violation into the newest live session</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {CODES.map((c) => (
                        <button key={c} type="button" disabled={busy !== null} onClick={() => void run(c, async () => { const r = await post<{ outcome: string; status: string }>('/dev/simulate-violation', { code: c }); return `${c}: ${r.outcome} (session ${r.status})` })} className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-slate-200 hover:border-sky-400 hover:text-sky-300 disabled:opacity-50">
                          {c.toLowerCase().replace(/_/g, ' ')}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" disabled={busy !== null} onClick={() => void run('Reset demo candidate', async () => { await post('/dev/reset-candidate', {}); return 'Demo candidate reset: session, device binding and verification cleared' })} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-xs font-medium hover:bg-white/20 disabled:opacity-50"><RefreshCw className="h-3.5 w-3.5" aria-hidden />Reset candidate</button>
                    <button type="button" disabled={busy !== null || status?.reseeding} onClick={() => { if (window.confirm('Wipe the database and reseed the demo data?')) void run('Reseed', async () => { const r = await post<{ ms: number }>('/dev/reseed'); return `Database reseeded in ${(r.ms / 1000).toFixed(1)} s` }) }} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-500/80 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50"><Zap className="h-3.5 w-3.5" aria-hidden />{status?.reseeding ? 'Reseeding…' : 'Reseed DB'}</button>
                  </div>
                  <p className="text-[11px] text-slate-500">Reseed needs an organization sign-in. Violations need a live session (start one from the desktop app).</p>
                </div>
              )}

              {tab === 'pages' && (
                <div className="space-y-3">
                  {[
                    { group: 'Public', role: null, links: [['/', 'Home'], ['/features', 'Features'], ['/security', 'Security'], ['/download', 'Download'], ['/login', 'Login']] },
                    { group: 'Candidate', role: 'candidate', links: [['/lobby', 'Exam lobby'], ['http://localhost:5173', 'Desktop exam app (renderer)']] },
                    { group: 'Proctor', role: 'mentor', links: [['/proctor', 'Review queue'], ...(ids.session ? [[`/proctor/sessions/${ids.session}`, 'A live session review']] : [])] },
                    {
                      group: 'Organization', role: 'admin', links: [['/organization', 'Dashboard'], ['/organization/exams', 'Exams'], ['/organization/exams/new', 'Create exam'], ['/organization/questions', 'Question bank'], ['/organization/candidates', 'Candidates'], ['/organization/results', 'Results'],
                        ...(ids.exam ? [[`/organization/exams/${ids.exam}`, 'Live exam overview'], [`/organization/exams/${ids.exam}/questions`, 'Live exam questions'], [`/organization/exams/${ids.exam}/credentials`, 'Live exam credentials'], [`/organization/exams/${ids.exam}/reports`, 'Live exam report']] : [])],
                    },
                  ].map((g) => (
                    <div key={g.group}>
                      <div className="mb-1.5 flex items-center justify-between">
                        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{g.group}</h3>
                        {g.role && <button type="button" disabled={busy !== null || !status} onClick={() => void signInAs(g.role as 'admin' | 'mentor' | 'candidate')} className="text-[11px] text-sky-300 hover:underline disabled:opacity-50">sign in as {g.role}</button>}
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {g.links.map(([href, label]) => (
                          <a key={href} href={href} className="truncate rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-slate-200 ring-1 ring-white/10 hover:bg-white/15 hover:text-white">{label}</a>
                        ))}
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={signOut} className="w-full rounded-xl bg-white/10 px-3 py-2 text-xs font-medium hover:bg-white/20">Sign out ({user ? user.name : 'nobody signed in'})</button>
                </div>
              )}

              {tab === 'outbox' && (
                <div className="space-y-2">
                  {outbox.length === 0 && <p className="flex items-center gap-2 text-slate-400"><Inbox className="h-4 w-4" aria-hidden />No emails yet. Send credentials from an exam.</p>}
                  {outbox.map((m) => (
                    <button key={m.id} type="button" onClick={() => setPreview(m)} disabled={!m.html} className="block w-full rounded-xl bg-white/5 p-3 text-left ring-1 ring-white/10 hover:bg-white/10 disabled:cursor-default">
                      <div className="flex items-center justify-between gap-2"><span className="truncate font-medium text-white">{m.subject}</span><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.status === 'SENT' ? 'bg-emerald-400/20 text-emerald-300' : 'bg-rose-400/20 text-rose-300'}`}>{m.status}</span></div>
                      <p className="mt-0.5 truncate text-xs text-slate-400">{m.kind} → {m.to} · {new Date(m.at).toLocaleTimeString()}{m.kind === 'otp' ? ' · code hidden' : ''}</p>
                    </button>
                  ))}
                </div>
              )}

              {note && <p role="status" className="mt-3 rounded-xl bg-sky-400/10 p-2.5 text-xs text-sky-200">{busy ? '…' : note}</p>}
            </div>
          </motion.section>
        )}
      </AnimatePresence>


      {preview?.html && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && setPreview(null)}>
          <div className="flex h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-4 py-2 text-sm text-slate-700"><span className="truncate">{preview.subject} → {preview.to}</span><button type="button" onClick={() => setPreview(null)} aria-label="Close preview"><X className="h-4 w-4" /></button></div>
            {/* sandbox with no permissions: outbox HTML is rendered, never executed */}
            <iframe title="Email preview" sandbox="" srcDoc={preview.html} className="flex-1" />
          </div>
        </div>
      )}
    </div>
  )
}
