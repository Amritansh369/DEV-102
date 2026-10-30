import { FormEvent, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Globe, Home, Loader2, Lock, Plus, RotateCw, Search, X } from 'lucide-react'
import type { BrowsingLog } from '../lib/types'

type LogEntry = Omit<BrowsingLog, 'id' | 'sessionId'>
type TabKind = 'home' | 'search' | 'page'

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
  /** Reference sites the exam suggests on the new-tab page. Any other site opens too. */
  allowedSites: string[]
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
const newTab = (): Tab => ({ id: Math.random().toString(36).slice(2, 10), kind: 'home', url: 'sandbox://home', title: 'New tab', loading: false })

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

export default function BrowserTabs({ allowedSites, onLog, onAiSite, onAiQuery }: BrowserTabsProps) {
  const [tabs, setTabs] = useState<Tab[]>(() => [newTab()])
  const [activeId, setActiveId] = useState(() => tabs[0].id)
  const [address, setAddress] = useState('')

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
      const ai = isAiHost(parsed.host)
      const title = SITE_TITLES[parsed.host] ?? parsed.host
      patch(tabId, { kind: 'page', url: parsed.url, host: parsed.host, title, query: undefined, loading: NATIVE })
      onLog({ at, url: parsed.url, title, flaggedAi: ai })
      if (ai) onAiSite(parsed.url)
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
    onLog({ at, url, title: 'Search', query: parsed.query, flaggedAi: flagged })
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="tablist" aria-label="Browser tabs" className="flex items-end gap-1 border-b border-border bg-soft px-3 pt-2">
        {tabs.map((t) => (
          <div key={t.id} className={`group flex max-w-[11rem] items-center gap-1.5 rounded-t-lg border border-b-0 px-3 py-1.5 text-xs ${t.id === activeId ? 'border-border bg-white font-medium text-ink' : 'border-transparent text-muted hover:bg-white/60'}`}>
            <button type="button" role="tab" aria-selected={t.id === activeId} onClick={() => setActiveId(t.id)} className="flex min-w-0 items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-accent">
              {t.loading ? <Loader2 className="h-3 w-3 shrink-0 animate-spin text-accent" aria-hidden /> : <Globe className="h-3 w-3 shrink-0" aria-hidden />}
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
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Search or enter any address" spellCheck={false} className="w-full rounded-full border border-border bg-soft py-2 pl-9 pr-4 text-sm text-ink focus-visible:bg-white focus-visible:outline-2 focus-visible:outline-accent" />
        </label>
        <button type="submit" className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Go</button>
      </form>

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
                onReply={(prompt, text, url, title) => onLog({ at: new Date().toISOString(), url, title: title || safeHost(url), query: prompt, reply: text, flaggedAi: true })}
              />
            ))
          : null}
        {(!NATIVE || active.kind !== 'page') && <PageView tab={active} allowedSites={allowedSites} onNavigate={(input) => navigate(active.id, input)} />}
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
  onReply: (prompt: string, text: string, url: string, title: string) => void
}

type GuestEvent = Event & { url?: string; title?: string; channel?: string; args?: unknown[]; isMainFrame?: boolean; errorDescription?: string }

/** One Electron webview per tab, kept mounted while hidden so switching tabs does not reload pages. */
function GuestPage({ tab, hidden, onState, onVisit, onTyped, onReply }: GuestPageProps) {
  const ref = useRef<HTMLElement>(null)
  const cb = useRef({ onState, onVisit, onTyped, onReply })
  cb.current = { onState, onVisit, onTyped, onReply }
  const initialUrl = useRef(tab.url)
  const lastVisit = useRef('')
  const ready = useRef(false)

  // The address bar changed this tab's URL: send the page there. The webview's own navigations already match.
  useEffect(() => {
    const el = ref.current as unknown as { getURL?: () => string; loadURL?: (url: string) => Promise<void> } | null
    const same = (a: string, b: string) => a.replace(/\/$/, '') === b.replace(/\/$/, '')
    if (ready.current && el?.getURL && !same(el.getURL(), tab.url)) void el.loadURL?.(tab.url).catch(() => undefined)
  }, [tab.url])

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
      ['dom-ready', () => { ready.current = true }],
      ['did-start-loading', () => cb.current.onState({ loading: true })],
      ['did-stop-loading', () => cb.current.onState({ loading: false })],
      ['did-navigate', visit],
      ['did-navigate-in-page', (e) => ((e as GuestEvent).isMainFrame ? visit(e) : undefined)],
      ['page-title-updated', (e) => cb.current.onState({ title: (e as GuestEvent).title ?? '' })],
      ['did-fail-load', (e) => {
        const g = e as GuestEvent
        if (g.isMainFrame) cb.current.onState({ loading: false })
      }],
      ['ipc-message', (e) => {
        const g = e as GuestEvent
        const payload = g.args?.[0] as { text?: string; prompt?: string; url?: string; title?: string } | undefined
        if (g.channel === 'sandbox:typed' && payload?.text) cb.current.onTyped(payload.text, payload.url ?? '', payload.title ?? '')
        if (g.channel === 'sandbox:reply' && payload?.text && payload.prompt) cb.current.onReply(payload.prompt, payload.text, payload.url ?? '', payload.title ?? '')
      }],
    ]
    handlers.forEach(([name, fn]) => el.addEventListener(name, fn))
    return () => handlers.forEach(([name, fn]) => el.removeEventListener(name, fn))
  }, [])

  return (
    <div className={hidden ? 'hidden' : 'absolute inset-0'}>
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
        <p className="mt-3 rounded-xl bg-soft p-3 text-xs text-muted">Preview mode: websites open in the installed app.</p>
      </article>
    )
  }

  if (tab.kind === 'search' && tab.query) {
    return (
      <section className="mx-auto max-w-2xl px-6 py-6" aria-label="Search results">
        <p className="text-xs text-muted">Preview search</p>
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
      <h2 className="mt-3 font-heading text-lg font-semibold text-ink">Browser</h2>
      <p className="mt-1 text-sm text-muted">Search or enter any address above.</p>
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
