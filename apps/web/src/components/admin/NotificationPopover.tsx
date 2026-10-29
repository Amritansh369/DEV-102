'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Bell, BellOff, CheckCheck, CheckCircle2, Info, ShieldAlert, type LucideIcon } from 'lucide-react'
import {
  listNotifications,
  markAllNotificationsRead,
  type AdminNotification,
  type NotificationTone,
} from '@/lib/api'
import { cx, timeAgo, useDismiss, useNow } from '@/lib/adminHooks'
import { toast } from '@/lib/adminStore'
import { ErrorState, Skeleton } from './States'

const TONES: Record<NotificationTone, { icon: LucideIcon; classes: string }> = {
  info: { icon: Info, classes: 'bg-accent/10 text-primary-600' },
  success: { icon: CheckCircle2, classes: 'bg-success/10 text-success' },
  warning: { icon: AlertTriangle, classes: 'bg-warning/15 text-warning' },
  danger: { icon: ShieldAlert, classes: 'bg-danger/10 text-danger' },
}

export function NotificationPopover() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AdminNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'all' | 'unread'>('all')
  const wrapRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const now = useNow(30_000)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setItems(await listNotifications())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load notifications.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Live mode: refresh from the server and toast new critical alerts.
  useEffect(() => {
    const id = window.setInterval(async () => {
      try {
        const latest = await listNotifications()
        setItems((prev) => {
          const known = new Set(prev.map((n) => n.id))
          latest.filter((n) => !known.has(n.id) && n.tone === 'danger').forEach((n) => toast.error(n.title, n.body))
          return latest
        })
      } catch {
        /* the next refresh retries */
      }
    }, 20_000)
    return () => window.clearInterval(id)
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    buttonRef.current?.focus()
  }, [])
  useDismiss(wrapRef, open, close)

  const unread = items.filter((n) => !n.read).length
  const shown = useMemo(() => (tab === 'unread' ? items.filter((n) => !n.read) : items), [items, tab])

  const markAll = async () => {
    const snapshot = items
    setItems((prev) => prev.map((n) => ({ ...n, read: true })))
    try {
      await markAllNotificationsRead()
    } catch {
      setItems(snapshot)
      toast.error('Could not mark as read', 'Please try again in a moment.')
    }
  }

  const markOne = (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="admin-notifications"
        aria-label={`Notifications, ${unread} unread`}
        className="relative grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface text-slate-600 outline-none transition hover:bg-soft hover:text-primary focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-[18px] text-white ring-2 ring-surface">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id="admin-notifications"
            role="dialog"
            aria-label="Notifications"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] origin-top-right overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_20px_48px_-16px_rgba(15,23,42,0.35)]"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="font-heading text-sm font-semibold text-text">Notifications</h2>
              <button
                type="button"
                onClick={markAll}
                disabled={unread === 0}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-accent outline-none transition hover:bg-soft focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:text-muted disabled:hover:bg-transparent"
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" /> Mark all read
              </button>
            </div>
            <div className="flex gap-1 px-3 pt-3" role="tablist" aria-label="Filter notifications">
              {(['all', 'unread'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={cx(
                    'rounded-lg px-3 py-1 text-xs font-semibold capitalize outline-none transition focus-visible:ring-2 focus-visible:ring-accent',
                    tab === t ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-soft',
                  )}
                >
                  {t}
                  {t === 'unread' && unread > 0 ? ` (${unread})` : ''}
                </button>
              ))}
            </div>

            <div className="max-h-[360px] overflow-y-auto p-2">
              {loading ? (
                <div className="space-y-3 p-2" aria-label="Loading notifications">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex gap-3">
                      <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-3.5 w-3/4" />
                        <Skeleton className="h-3 w-full" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : error ? (
                <ErrorState title="Couldn't load" message={error} onRetry={load} className="border-0 py-8" />
              ) : shown.length === 0 ? (
                <div className="flex flex-col items-center px-6 py-10 text-center">
                  <BellOff className="h-8 w-8 text-muted" aria-hidden="true" />
                  <p className="mt-3 text-sm font-semibold text-text">You&apos;re all caught up</p>
                  <p className="mt-1 text-xs text-muted">New alerts about exams, violations and emails will show up here.</p>
                </div>
              ) : (
                <ul className="space-y-1">
                  {shown.map((n) => {
                    const { icon: Icon, classes } = TONES[n.tone]
                    const content: ReactNode = (
                      <>
                        <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-xl', classes)}>
                          <Icon className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1 text-left">
                          <span className="block text-sm font-semibold text-text">{n.title}</span>
                          <span className="mt-0.5 block text-xs text-muted">{n.body}</span>
                          <span className="mt-1 block text-[11px] text-slate-400">{timeAgo(n.at, now)}</span>
                        </span>
                        {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
                      </>
                    )
                    const rowClass = 'flex w-full items-start gap-3 rounded-xl p-2.5 outline-none transition hover:bg-soft focus-visible:ring-2 focus-visible:ring-accent'
                    return (
                      <li key={n.id}>
                        {n.href ? (
                          <Link href={n.href} onClick={() => markOne(n.id)} className={rowClass}>
                            {content}
                          </Link>
                        ) : (
                          <button type="button" onClick={() => markOne(n.id)} className={rowClass}>
                            {content}
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div className="border-t border-border px-4 py-2.5">
              <Link href="/admin/reports" onClick={() => setOpen(false)} className="text-xs font-semibold text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent">
                Open violation reports
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
