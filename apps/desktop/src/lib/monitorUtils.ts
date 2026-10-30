import { useEffect, useState } from 'react'
import type { BrowsingLog, Session, Severity, ViolationCode } from './types'

export const VIOLATION_META: Record<ViolationCode, { label: string; severity: Severity }> = {
  MULTIPLE_FACES: { label: 'Multiple faces in frame', severity: 'HIGH' },
  NO_FACE: { label: 'No face detected', severity: 'MEDIUM' },
  GAZE_AWAY: { label: 'Looking away from screen', severity: 'LOW' },
  FACE_MISMATCH: { label: 'Face does not match registered photo', severity: 'CRITICAL' },
  AI_SITE_OPENED: { label: 'AI website opened', severity: 'HIGH' },
  AI_QUERY_DETECTED: { label: 'AI assistant query typed', severity: 'HIGH' },
  BLACKLISTED_APP: { label: 'Blacklisted app running', severity: 'HIGH' },
  SCREEN_MIRRORING: { label: 'Screen mirroring detected', severity: 'CRITICAL' },
  MULTI_MONITOR: { label: 'Extra monitor connected', severity: 'HIGH' },
  VM_DETECTED: { label: 'Virtual machine detected', severity: 'CRITICAL' },
  REMOTE_DESKTOP: { label: 'Remote desktop active', severity: 'CRITICAL' },
  EXTERNAL_DEVICE: { label: 'External device attached', severity: 'MEDIUM' },
  CLIPBOARD_USE: { label: 'Clipboard use attempted', severity: 'LOW' },
  SHORTCUT_BLOCKED: { label: 'Blocked shortcut pressed', severity: 'LOW' },
  SCREEN_SHARE_STOPPED: { label: 'Screen sharing stopped', severity: 'HIGH' },
  CAMERA_BLOCKED: { label: 'Camera blocked or covered', severity: 'HIGH' },
  MULTI_LOGIN: { label: 'Second login detected', severity: 'CRITICAL' },
  NETWORK_LOST: { label: 'Network connection lost', severity: 'LOW' },
  WINDOW_BLUR: { label: 'Exam window lost focus', severity: 'MEDIUM' },
  VOICE_DETECTED: { label: 'Voice detected', severity: 'MEDIUM' },
  MIC_BLOCKED: { label: 'Microphone muted or disconnected', severity: 'HIGH' },
  PHONE_DETECTED: { label: 'Phone visible on camera', severity: 'HIGH' },
  NOTES_DETECTED: { label: 'Book or notes visible on camera', severity: 'MEDIUM' },
}

export const SEVERITY_WEIGHT: Record<Severity, number> = { LOW: 4, MEDIUM: 10, HIGH: 18, CRITICAL: 30 }

export const STATUS_LABEL: Record<Session['status'], string> = {
  WAITING: 'Waiting',
  LIVE: 'Live',
  SUBMITTED: 'Submitted',
  TERMINATED: 'Terminated',
}

export function timeAgo(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

/* ---------------------------------------------------------------- browsing activity */

const SITE_NAMES: Record<string, string> = {
  'chatgpt.com': 'ChatGPT', 'chat.openai.com': 'ChatGPT', 'claude.ai': 'Claude', 'gemini.google.com': 'Gemini',
  'aistudio.google.com': 'Google AI Studio', 'copilot.microsoft.com': 'Microsoft Copilot', 'perplexity.ai': 'Perplexity',
  'chat.deepseek.com': 'DeepSeek', 'poe.com': 'Poe', 'you.com': 'You.com', 'phind.com': 'Phind', 'meta.ai': 'Meta AI',
  'grok.com': 'Grok', 'chat.mistral.ai': 'Mistral', 'google.com': 'Google', 'bing.com': 'Bing', 'duckduckgo.com': 'DuckDuckGo',
}

function hostOf(url: string): string {
  if (url.startsWith('sandbox://search')) return 'sandbox-search'
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** One stay on a site: when it was opened and what was typed there, in order. */
export interface SiteVisit {
  key: string
  site: string
  host: string
  url: string
  at: string
  ai: boolean
  /** The candidate had been on this site earlier and switched back to it. */
  returned: boolean
  queries: { id: string; at: string; text: string; reply?: string }[]
}

/**
 * Turns the browsing log into "ChatGPT opened → typed …" visits. A visit starts whenever the site changes, so
 * switching tabs and coming back shows as a new visit marked `returned`; typed text attaches to the visit it was typed in.
 */
export function groupVisits(logs: BrowsingLog[]): SiteVisit[] {
  const visits: SiteVisit[] = []
  const seen = new Set<string>()
  for (const l of logs.slice().sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    const host = hostOf(l.url)
    let visit = visits[visits.length - 1]
    if (!visit || visit.host !== host) {
      const site = host === 'sandbox-search' ? 'Search' : SITE_NAMES[host] ?? (l.title && !l.query ? l.title : host)
      visit = { key: l.id, site, host, url: l.url, at: l.at, ai: false, returned: seen.has(host), queries: [] }
      visits.push(visit)
      seen.add(host)
    }
    if (l.flaggedAi) visit.ai = true
    // The tracker reports text after a typing pause and again on Enter, so the same message can arrive twice.
    // A reply arrives as its own entry, and a long one again as it grows: the newest text belongs to its question.
    const asked = l.query ? visit.queries.find((q) => q.text === l.query) : undefined
    if (asked && l.reply) asked.reply = l.reply
    else if (l.query && visit.queries[visit.queries.length - 1]?.text !== l.query) visit.queries.push({ id: l.id, at: l.at, text: l.query, ...(l.reply ? { reply: l.reply } : {}) })
  }
  return visits
}

export const formatClock = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

/** Re-renders the caller on an interval so relative timestamps stay fresh. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}
