import { FormEvent, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Ban, Globe, History, Home, Loader2, Lock, Plus, RotateCw, Search, ShieldCheck, ShieldX, X } from 'lucide-react'
import type { BrowsingLog } from '../lib/types'

type LogEntry = Omit<BrowsingLog, 'id' | 'sessionId'>
type TabKind = 'home' | 'search' | 'page' | 'blocked' | 'ai'

interface Tab {
  id: string
  kind: TabKind
  url: string
  title: string
  host?: string
  query?: string
  loading: boolean
}

interface BrowserTabsProps {
  allowedSites: string[]
  /** Newest first. Shown back to the candidate so logging is transparent. */
  log: BrowsingLog[]
  onLog: (entry: LogEntry) => void
  onAiSite: (url: string) => void
  onAiQuery: (query: string) => void
}

const MAX_TABS = 6

export const AI_HOSTS = [
  'chatgpt.com', 'chat.openai.com', 'openai.com', 'gemini.google.com', 'bard.google.com', 'claude.ai', 'copilot.microsoft.com',
  'perplexity.ai', 'deepseek.com', 'poe.com', 'you.com', 'character.ai', 'grok.com', 'meta.ai', 'phind.com',
]

const SITE_TITLES: Record<string, string> = {
  'docs.python.org': 'Python 3 Documentation',
  'developer.mozilla.org': 'MDN Web Docs',
  'en.wikipedia.org': 'Wikipedia',
  'w3schools.com': 'W3Schools',
  'geeksforgeeks.org': 'GeeksforGeeks',
  'cppreference.com': 'cppreference.com',
  'docs.oracle.com': 'Java SE Documentation',
}

/** Inside the desktop app tabs are real isolated webviews; in a plain browser they are previews. */
const NATIVE = typeof window !== 'undefined' && Boolean(window.proctor)
const SANDBOX_PARTITION = 'sandbox-exam'

const URL_RE = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?(\/\S*)?$/i
const AI_QUERY_RE = /\b(chat\s?gpt|gpt-?4|gemini|claude|copilot|perplexity|deepseek|solve this|give me the answer|correct option|which option is correct|mcq answer)\b/i

const normHost = (h: string) => h.toLowerCase().replace(/^www\./, '')
const hostMatches = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`)
const isAiHost = (host: string) => AI_HOSTS.some((d) => hostMatches(host, d))
const isAllowed = (host: string, allowed: string[]) => allowed.some((d) => hostMatches(host, normHost(d)))
const newTab = (): Tab => ({ id: Math.random().toString(36).slice(2, 10), kind: 'home', url: 'sandbox://home', title: 'New tab', loading: false })
const stamp = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour12: false })

/** Pasted exam questions and AI-style prompts tend to be long or name an assistant. */
export function looksLikeAiQuery(q: string): boolean {
  return q.length > 100 || AI_QUERY_RE.test(q)
}

type Parsed = { kind: 'url'; url: string; host: string } | { kind: 'query'; query: string }

function parseInput(raw: string): Parsed {
  if (URL_RE.test(raw)) {
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    try {
      return { kind: 'url', url, host: normHost(new URL(url).hostname) }
    } catch {
      /* not a valid URL after all: treat as a search */
    }
  }
  return { kind: 'query', query: raw }
}

export default function BrowserTabs({ allowedSites, log, onLog, onAiSite, onAiQuery }: BrowserTabsProps) {
  const [tabs, setTabs] = useState<Tab[]>(() => [newTab()])
  const [activeId, setActiveId] = useState(() => tabs[0].id)
  const [address, setAddress] = useState('')
  const [showLog, setShowLog] = useState(false)
  const [flaggedOnly, setFlaggedOnly] = useState(false)

  const active = tabs.find((t) => t.id === activeId) ?? tabs[0]

  useEffect(() => {
    setAddress(active.kind === 'home' ? '' : active.kind === 'search' ? active.query ?? '' : active.url)
  }, [active.id, active.kind, active.url, active.query])

  const patch = (id: string, p: Partial<Tab>) => setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, ...p } : t)))
  const settle = (id: string, ms: number) => window.setTimeout(() => patch(id, { loading: false }), ms)

  const navigate = (tabId: string, raw: string) => {
    const input = raw.trim()
    if (!input) return
    const at = new Date().toISOString()
    const parsed = parseInput(input)

    if (parsed.kind === 'url') {
      if (NATIVE && isAiHost(parsed.host)) {
        // The brief: allow AI sites but record that they were opened and everything typed into them.
        patch(tabId, { kind: 'page', url: parsed.url, host: parsed.host, title: parsed.host, query: undefined, loading: true })
        onLog({ at, url: parsed.url, title: parsed.host, flaggedAi: true })
        onAiSite(parsed.url)
      } else if (isAiHost(parsed.host)) {
        patch(tabId, { kind: 'ai', url: parsed.url, host: parsed.host, title: 'Blocked: AI assistant', query: undefined, loading: false })
        onLog({ at, url: parsed.url, title: 'AI assistant site (blocked)', flaggedAi: true })
        onAiSite(parsed.url)
      } else if (isAllowed(parsed.host, allowedSites)) {
        patch(tabId, { kind: 'page', url: parsed.url, host: parsed.host, title: SITE_TITLES[parsed.host] ?? parsed.host, query: undefined, loading: true })
        onLog({ at, url: parsed.url, title: SITE_TITLES[parsed.host] ?? parsed.host, flaggedAi: false })
        settle(tabId, 500)
      } else {
        patch(tabId, { kind: 'blocked', url: parsed.url, host: parsed.host, title: 'Blocked site', query: undefined, loading: false })
        onLog({ at, url: parsed.url, title: 'Site not on the allow-list (blocked)', flaggedAi: false })
      }
      return
    }

    const flagged = looksLikeAiQuery(parsed.query)
    if (NATIVE) {
      const url = `https://www.google.com/search?q=${encodeURIComponent(parsed.query)}`
      patch(tabId, { kind: 'page', url, host: 'google.com', title: `Search: ${parsed.query.slice(0, 24)}`, query: parsed.query, loading: true })
      onLog({ at, url, title: 'Google Search', query: parsed.query, flaggedAi: flagged })
      if (flagged) onAiQuery(parsed.query)
      return
    }
    const url = `sandbox://search?q=${encodeURIComponent(parsed.query)}`
    patch(tabId, { kind: 'search', url, title: `Search: ${parsed.query.slice(0, 24)}`, query: parsed.query, host: undefined, loading: true })
    onLog({ at, url, title: 'Sandbox search', query: parsed.query, flaggedAi: flagged })
    if (flagged) onAiQuery(parsed.query)
    settle(tabId, 450)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    navigate(active.id, address)
  }

  const addTab = () => {
    if (tabs.length >= MAX_TABS) return
    const t = newTab()
    setTabs((ts) => [...ts, t])
    setActiveId(t.id)
  }

  const closeTab = (id: string) => {
    if (tabs.length === 1) {
      const t = newTab()
      setTabs([t])
      setActiveId(t.id)
      return
    }
    const idx = tabs.findIndex((t) => t.id === id)
    const rest = tabs.filter((t) => t.id !== id)
    setTabs(rest)
    if (id === activeId) setActiveId(rest[Math.max(0, idx - 1)].id)
  }

  if (allowedSites.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <Ban className="h-10 w-10 text-muted" aria-hidden />
        <h2 className="font-heading text-lg font-semibold text-ink">Browsing is not permitted in this exam</h2>
        <p className="max-w-sm text-sm text-muted">Your exam coordinator has not allowed any reference websites. Return to the question view to continue.</p>
      </div>
    )
  }

  const shownLog = flaggedOnly ? log.filter((l) => l.flaggedAi) : log

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="tablist" aria-label="Browser tabs" className="flex items-end gap-1 border-b border-border bg-soft px-3 pt-2">
        {tabs.map((t) => (
          <div key={t.id} className={`group flex max-w-[11rem] items-center gap-1.5 rounded-t-lg border border-b-0 px-3 py-1.5 text-xs ${t.id === activeId ? 'border-border bg-white font-medium text-ink' : 'border-transparent text-muted hover:bg-white/60'}`}>
            <button type="button" role="tab" aria-selected={t.id === activeId} onClick={() => setActiveId(t.id)} className="flex min-w-0 items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-accent">
              {t.loading ? <Loader2 className="h-3 w-3 shrink-0 animate-spin text-accent" aria-hidden /> : t.kind === 'ai' || t.kind === 'blocked' ? <ShieldX className="h-3 w-3 shrink-0 text-danger" aria-hidden /> : <Globe className="h-3 w-3 shrink-0" aria-hidden />}
              <span className="truncate">{t.title}</span>
            </button>
            <button type="button" onClick={() => closeTab(t.id)} aria-label={`Close tab ${t.title}`} className="rounded p-0.5 text-muted hover:bg-soft hover:text-danger focus-visible:outline-2 focus-visible:outline-accent">
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button type="button" onClick={addTab} disabled={tabs.length >= MAX_TABS} aria-label="New tab" className="mb-1 rounded-md p-1.5 text-muted hover:bg-white focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40">
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <form onSubmit={submit} className="flex items-center gap-2 border-b border-border bg-white px-3 py-2" role="search">
        <button type="button" onClick={() => patch(active.id, { kind: 'home', url: 'sandbox://home', title: 'New tab', query: undefined, host: undefined, loading: false })} aria-label="Sandbox home" className="rounded-md p-1.5 text-muted hover:bg-soft focus-visible:outline-2 focus-visible:outline-accent">
          <Home className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => { patch(active.id, { loading: true }); settle(active.id, 400) }} aria-label="Reload" className="rounded-md p-1.5 text-muted hover:bg-soft focus-visible:outline-2 focus-visible:outline-accent">
          <RotateCw className="h-4 w-4" />
        </button>
        <label className="relative flex-1">
          <span className="sr-only">Address or search</span>
          <Lock className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-success" aria-hidden />
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Search or enter an allowed site address" spellCheck={false} className="w-full rounded-full border border-border bg-soft py-2 pl-9 pr-4 text-sm text-ink focus-visible:bg-white focus-visible:outline-2 focus-visible:outline-accent" />
        </label>
        <button type="submit" className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Go</button>
      </form>

      <div role="note" className="flex items-center gap-2 border-b border-blue-100 bg-blue-50 px-4 py-2 text-xs text-primary">
        <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
        <span><strong>Activity is logged.</strong> Every website, search and chat query in this browser is recorded and visible to your invigilator. {NATIVE ? 'Opening an AI assistant or typing a question into one is reported as a violation.' : 'AI assistants are blocked and reported.'}</span>
      </div>

      <div className="relative min-h-0 flex-1 overflow-y-auto" role="tabpanel">
        <AnimatePresence>
          {active.loading && <motion.div key="bar" initial={{ width: '0%' }} animate={{ width: '90%' }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} className="absolute left-0 top-0 h-0.5 bg-accent" />}
        </AnimatePresence>
        {NATIVE
          ? tabs.map((t) => t.kind === 'page' && (
              <GuestPage
                key={t.id}
                tab={t}
                hidden={t.id !== active.id}
                onState={(p) => patch(t.id, p)}
                onVisit={(url, title) => {
                  const host = safeHost(url)
                  const ai = isAiHost(host)
                  onLog({ at: new Date().toISOString(), url, title, flaggedAi: ai })
                  if (ai) onAiSite(url)
                }}
                onTyped={(text, url, title) => {
                  const ai = isAiHost(safeHost(url))
                  const flagged = ai || looksLikeAiQuery(text)
                  onLog({ at: new Date().toISOString(), url, title: ai ? `${title || safeHost(url)} (AI chat)` : title, query: text, flaggedAi: flagged })
                  if (flagged) onAiQuery(text)
                }}
              />
            ))
          : null}
        {(!NATIVE || active.kind !== 'page') && <PageView tab={active} allowedSites={allowedSites} onNavigate={(input) => navigate(active.id, input)} />}
      </div>

      <div className="border-t border-border bg-white">
        <button type="button" onClick={() => setShowLog((s) => !s)} aria-expanded={showLog} className="flex w-full items-center justify-between px-4 py-2 text-xs font-medium text-primary hover:bg-soft focus-visible:outline-2 focus-visible:outline-accent">
          <span className="inline-flex items-center gap-2"><History className="h-4 w-4" aria-hidden /> Your activity log ({log.length})</span>
          <span className="text-muted">{showLog ? 'Hide' : 'Show'}</span>
        </button>
        {showLog && (
          <div className="max-h-48 overflow-y-auto border-t border-border px-4 py-2">
            <label className="mb-2 flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} className="accent-primary-600" /> Flagged only
            </label>
            {shownLog.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted">{log.length === 0 ? 'Nothing logged yet. Sites and searches you open will appear here.' : 'No flagged entries.'}</p>
            ) : (
              <ul className="space-y-1">
                {shownLog.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-xs odd:bg-soft">
                    <time className="w-16 shrink-0 tabular-nums text-muted" dateTime={l.at}>{stamp(l.at)}</time>
                    <span className="min-w-0 flex-1 truncate text-ink">{l.query ? <>Search: <strong>{l.query}</strong></> : l.url}</span>
                    {l.flaggedAi && <span className="rounded-full bg-red-50 px-2 py-0.5 font-medium text-danger">AI flagged</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const safeHost = (url: string) => {
  try {
    return normHost(new URL(url).hostname)
  } catch {
    return ''
  }
}

interface GuestPageProps {
  tab: Tab
  hidden: boolean
  onState: (patch: Partial<Tab>) => void
  onVisit: (url: string, title: string) => void
  onTyped: (text: string, url: string, title: string) => void
}

type GuestEvent = Event & { url?: string; title?: string; channel?: string; args?: unknown[]; isMainFrame?: boolean; errorDescription?: string }

/** One Electron webview per tab, kept mounted while hidden so switching tabs does not reload pages. */
function GuestPage({ tab, hidden, onState, onVisit, onTyped }: GuestPageProps) {
  const ref = useRef<HTMLElement>(null)
  const cb = useRef({ onState, onVisit, onTyped })
  cb.current = { onState, onVisit, onTyped }
  const initialUrl = useRef(tab.url)
  const lastVisit = useRef('')

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const title = () => (el as unknown as { getTitle?: () => string }).getTitle?.() ?? ''
    const visit = (e: Event) => {
      const url = (e as GuestEvent).url
      if (!url || url === lastVisit.current || url === initialUrl.current) return
      lastVisit.current = url
      cb.current.onState({ url, host: safeHost(url) })
      cb.current.onVisit(url, title())
    }
    const handlers: [string, (e: Event) => void][] = [
      ['did-start-loading', () => cb.current.onState({ loading: true })],
      ['did-stop-loading', () => cb.current.onState({ loading: false })],
      ['did-navigate', visit],
      ['did-navigate-in-page', (e) => ((e as GuestEvent).isMainFrame ? visit(e) : undefined)],
      ['page-title-updated', (e) => cb.current.onState({ title: (e as GuestEvent).title ?? '' })],
      ['did-fail-load', (e) => {
        const g = e as GuestEvent
        if (g.isMainFrame) cb.current.onState({ loading: false, kind: 'blocked', title: 'Blocked site', host: safeHost(g.url ?? '') })
      }],
      ['ipc-message', (e) => {
        const g = e as GuestEvent
        const payload = g.args?.[0] as { text?: string; url?: string; title?: string } | undefined
        if (g.channel === 'sandbox:typed' && payload?.text) cb.current.onTyped(payload.text, payload.url ?? '', payload.title ?? '')
      }],
    ]
    handlers.forEach(([name, fn]) => el.addEventListener(name, fn))
    return () => handlers.forEach(([name, fn]) => el.removeEventListener(name, fn))
  }, [])

  return (
    <div className={hidden ? 'hidden' : 'absolute inset-0'}>
      {tab.host && isAiHost(tab.host) && (
        <div role="alert" className="absolute inset-x-0 top-0 z-10 bg-danger px-4 py-1.5 text-center text-xs font-semibold text-white">
          AI assistant detected · this visit and everything you type here is reported to your invigilator
        </div>
      )}
      <webview ref={ref} src={initialUrl.current} partition={SANDBOX_PARTITION} className="h-full w-full" />
    </div>
  )
}

interface PageViewProps {
  tab: Tab
  allowedSites: string[]
  onNavigate: (input: string) => void
}

function PageView({ tab, allowedSites, onNavigate }: PageViewProps) {
  if (tab.kind === 'ai' || tab.kind === 'blocked') {
    const ai = tab.kind === 'ai'
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-6 py-14 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-danger"><ShieldX className="h-7 w-7" aria-hidden /></span>
        <h2 className="mt-4 font-heading text-lg font-semibold text-ink">{ai ? 'AI assistants are not allowed' : 'This site is not allowed'}</h2>
        <p className="mt-2 text-sm text-muted">
          <strong className="text-ink">{tab.host}</strong> {ai ? 'is an AI assistant. The attempt has been reported to your invigilator and counted as a violation.' : 'is not on this exam’s allow-list. The attempt has been recorded.'}
        </p>
      </div>
    )
  }

  if (tab.kind === 'page' && tab.host) {
    const title = SITE_TITLES[tab.host] ?? tab.host
    return (
      <article className="mx-auto max-w-2xl px-6 py-8">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary font-heading font-semibold text-white">{title[0]}</span>
          <div>
            <h2 className="font-heading text-xl font-semibold text-ink">{title}</h2>
            <p className="text-xs text-muted">{tab.url}</p>
          </div>
        </div>
        <p className="mt-6 text-sm leading-relaxed text-ink">Reference material for this site is permitted during your exam. Use the search box above to look up syntax, definitions or documentation.</p>
        <p className="mt-3 rounded-xl bg-soft p-3 text-xs text-muted">Preview mode: in the installed app this area is an isolated webview with downloads, pop-ups, uploads and the clipboard disabled.</p>
      </article>
    )
  }

  if (tab.kind === 'search' && tab.query) {
    return (
      <section className="mx-auto max-w-2xl px-6 py-6" aria-label="Search results">
        <p className="text-xs text-muted">Sandbox search · results limited to allowed sites</p>
        <h2 className="mt-1 font-heading text-lg font-semibold text-ink">Results for “{tab.query}”</h2>
        <ul className="mt-4 space-y-3">
          {allowedSites.slice(0, 4).map((site) => {
            const host = normHost(site)
            return (
              <li key={host}>
                <button type="button" onClick={() => onNavigate(`https://${host}/search?q=${encodeURIComponent(tab.query ?? '')}`)} className="w-full rounded-xl border border-border p-3 text-left hover:border-accent hover:bg-soft focus-visible:outline-2 focus-visible:outline-accent">
                  <span className="block text-xs text-success">{host}</span>
                  <span className="block text-sm font-medium text-primary">{tab.query} · {SITE_TITLES[host] ?? host}</span>
                  <span className="block text-xs text-muted">Reference article matching your search.</span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-soft text-primary"><Search className="h-6 w-6" aria-hidden /></span>
      <h2 className="mt-3 font-heading text-lg font-semibold text-ink">Sandbox browser</h2>
      <p className="mt-1 text-sm text-muted">Only these reference sites are available during your exam.</p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        {allowedSites.map((site) => {
          const host = normHost(site)
          return (
            <button key={host} type="button" onClick={() => onNavigate(`https://${host}`)} className="flex items-center gap-3 rounded-xl border border-border p-3 text-left hover:border-accent hover:bg-soft focus-visible:outline-2 focus-visible:outline-accent">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 font-heading text-sm font-semibold text-primary">{(SITE_TITLES[host] ?? host)[0]}</span>
              <span className="min-w-0"><span className="block truncate text-sm font-medium text-ink">{SITE_TITLES[host] ?? host}</span><span className="block truncate text-xs text-muted">{host}</span></span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
