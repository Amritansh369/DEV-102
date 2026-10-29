'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export const cx = (...parts: Array<string | false | null | undefined>): string => parts.filter(Boolean).join(' ')

export function useAsyncData<T>(loader: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const run = useRef(0)

  const load = useCallback(async () => {
    const id = ++run.current
    setLoading(true)
    setError(null)
    try {
      const result = await loader()
      if (id === run.current) setData(result)
    } catch (e) {
      if (id === run.current) setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      if (id === run.current) setLoading(false)
    }
  }, [loader])

  useEffect(() => {
    void load()
    const currentRun = run
    return () => {
      currentRun.current++
    }
  }, [load])

  return { data, setData, error, loading, reload: load }
}

/** Closes a popover on outside press or Escape. */
export function useDismiss(ref: { readonly current: HTMLElement | null }, open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && e.target instanceof Node && !ref.current.contains(e.target)) closeRef.current()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, ref])
}

export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

export function timeAgo(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} h ago`
  return `${Math.floor(h / 24)} d ago`
}

export function formatCountdown(iso: string, now: number): string {
  const diff = Date.parse(iso) - now
  if (diff <= 0) return 'Starting now'
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `in ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `in ${hours}h ${mins % 60}m`
  return `in ${Math.floor(hours / 24)}d ${hours % 24}h`
}

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
const timeFmt = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })

export const formatDate = (iso: string): string => dateFmt.format(new Date(iso))
export const formatTime = (iso: string): string => timeFmt.format(new Date(iso)).toUpperCase()
