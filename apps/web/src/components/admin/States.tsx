'use client'

import type { ReactNode } from 'react'
import { AlertTriangle, RefreshCw, type LucideIcon } from 'lucide-react'
import { cx } from '@/lib/adminHooks'

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx('animate-pulse rounded-lg bg-slate-200/70', className)} />
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  className,
}: {
  title?: string
  message: string
  onRetry: () => void
  className?: string
}) {
  return (
    <div role="alert" className={cx('flex flex-col items-center rounded-2xl border border-danger/20 bg-danger/5 px-6 py-12 text-center', className)}>
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-danger/10 text-danger">
        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
      </span>
      <h3 className="mt-4 font-heading text-base font-semibold text-text">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm outline-none transition hover:bg-primary-600 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
      </button>
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  message,
  action,
}: {
  icon: LucideIcon
  title: string
  message: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-soft text-accent">
        <Icon className="h-7 w-7" aria-hidden="true" />
      </span>
      <h3 className="mt-4 font-heading text-base font-semibold text-text">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">{message}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
