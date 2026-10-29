'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react'

const AUTOHIDE_MS = 10_000

interface PasswordCellProps {
  /** Already known in this browser (just imported, generated or reset). */
  value?: string
  /** Whose password it is, for screen-reader labels. */
  label: string
  /** Fetches the stored password; rejects once the person has signed in. */
  reveal: () => Promise<string>
  /** Issues a new password and resolves with it. */
  reset: () => Promise<string>
}

/** Masked password with Reveal and Copy; after the first sign-in it offers Reset & copy instead. */
export default function PasswordCell({ value, label, reveal, reset }: PasswordCellProps) {
  const [password, setPassword] = useState(value ?? '')
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [gone, setGone] = useState<string | null>(null)
  const timers = useRef<number[]>([])

  useEffect(() => setPassword(value ?? ''), [value])
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])

  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms))

  const load = async (): Promise<string | null> => {
    if (password) return password
    setBusy(true)
    try {
      const p = await reveal()
      setPassword(p)
      return p
    } catch (e) {
      setGone(e instanceof Error ? e.message : 'The password is no longer stored.')
      return null
    } finally {
      setBusy(false)
    }
  }

  const show = async () => {
    if (visible) return setVisible(false)
    if (await load()) {
      setVisible(true)
      later(() => setVisible(false), AUTOHIDE_MS)
    }
  }

  const copy = async (text: string | null) => {
    if (!text) return
    await navigator.clipboard.writeText(text)
    setCopied(true)
    later(() => setCopied(false), 1500)
  }

  const resetAndCopy = async () => {
    setBusy(true)
    try {
      const p = await reset()
      setPassword(p)
      setGone(null)
      setVisible(true)
      later(() => setVisible(false), AUTOHIDE_MS)
      await copy(p)
    } catch (e) {
      setGone(e instanceof Error ? e.message : 'Could not reset the password.')
    } finally {
      setBusy(false)
    }
  }

  const icon = 'h-3.5 w-3.5'
  const btn = 'rounded-md p-1 text-muted hover:bg-soft hover:text-primary focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50'

  if (gone) {
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <span className="max-w-[14rem] text-[11px] leading-tight text-muted">Signed in already, so the first password is gone.</span>
        <button type="button" disabled={busy} onClick={() => void resetAndCopy()} className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-primary hover:bg-soft focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50" aria-label={`Reset and copy password for ${label}`}>
          {busy ? <Loader2 className={`${icon} animate-spin`} aria-hidden /> : <KeyRound className={icon} aria-hidden />} Reset &amp; copy
        </button>
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 font-mono text-xs text-ink">
      <span className="inline-block min-w-[6.5rem]" aria-live="polite">{visible && password ? password : '••••••••••'}</span>
      <button type="button" disabled={busy} onClick={() => void show()} aria-label={`${visible ? 'Hide' : 'Reveal'} password for ${label}`} aria-pressed={visible} title={visible ? 'Hide' : `Reveal (hides after ${AUTOHIDE_MS / 1000}s)`} className={btn}>
        {busy ? <Loader2 className={`${icon} animate-spin`} aria-hidden /> : visible ? <EyeOff className={icon} aria-hidden /> : <Eye className={icon} aria-hidden />}
      </button>
      <button type="button" disabled={busy} onClick={() => void load().then(copy)} aria-label={`Copy password for ${label}`} className={btn}>
        {copied ? <Check className={`${icon} text-success`} aria-hidden /> : <Copy className={icon} aria-hidden />}
      </button>
    </span>
  )
}
