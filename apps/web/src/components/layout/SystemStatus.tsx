'use client'

import { useEffect, useState } from 'react'
import { getSystemStatus, type SystemStatus } from '@/lib/api'

export type StatusView = { tone: 'ok' | 'warn' | 'down' | 'checking'; title: string; detail: string }

/** Live system health from the API, refreshed every minute. */
export function useSystemStatus(): StatusView {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [unreachable, setUnreachable] = useState(false)

  useEffect(() => {
    let alive = true
    const load = () => getSystemStatus().then(
      (s) => { if (alive) { setStatus(s); setUnreachable(false) } },
      () => { if (alive) setUnreachable(true) },
    )
    void load()
    const timer = window.setInterval(() => void load(), 60_000)
    return () => { alive = false; window.clearInterval(timer) }
  }, [])

  if (unreachable) return { tone: 'down', title: 'Server unreachable', detail: 'The API is not answering' }
  if (!status) return { tone: 'checking', title: 'Checking systems…', detail: 'Contacting the server' }
  if (!status.database) return { tone: 'down', title: 'Database unreachable', detail: 'Sign-ins and exams may fail' }
  if (!status.agent) return { tone: 'warn', title: 'AI agent unreachable', detail: 'Webcam and AI checks are paused' }
  return { tone: 'ok', title: 'All systems operational', detail: `Proctoring agent · ${status.agentLatencyMs ?? 0} ms` }
}

export const STATUS_DOT: Record<StatusView['tone'], string> = {
  ok: 'bg-success', warn: 'bg-warning', down: 'bg-danger', checking: 'bg-slate-300',
}
