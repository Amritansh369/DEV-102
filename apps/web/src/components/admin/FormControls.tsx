'use client'

import { useId, type ReactNode } from 'react'
import { cx } from '@/lib/adminHooks'

export const cardCls = 'rounded-2xl border border-border bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(10,77,166,0.12)]'
export const inputCls = 'h-11 w-full rounded-xl border bg-surface px-3.5 text-sm text-text outline-none transition placeholder:text-muted focus:ring-2 disabled:cursor-not-allowed disabled:bg-soft disabled:text-muted'
export const inputState = (error?: string): string =>
  error ? 'border-danger focus:border-danger focus:ring-danger/25' : 'border-border focus:border-accent focus:ring-accent/30'
export const btnPrimary = 'inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm outline-none transition hover:bg-primary-600 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60'
export const btnGhost = 'inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-slate-700 outline-none transition hover:bg-soft focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50'
export const btnCta = 'inline-flex items-center justify-center gap-2 rounded-xl bg-cta px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm outline-none transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60'

export const describedBy = (id: string, error?: string, hint?: string): string | undefined =>
  error ? `${id}-err` : hint ? `${id}-hint` : undefined

export function Field({ id, label, hint, error, required, className, children }: {
  id: string; label: string; hint?: string; error?: string; required?: boolean; className?: string; children: ReactNode
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-danger" aria-hidden="true"> *</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-err`} role="alert" className="mt-1.5 text-xs font-medium text-danger">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

export function Toggle({ checked, onChange, label, description, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p id={`${id}-l`} className="text-sm font-medium text-text">{label}</p>
        {description && <p id={`${id}-d`} className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-l`}
        aria-describedby={description ? `${id}-d` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 h-6 w-11 shrink-0 rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50', checked ? 'bg-primary-600' : 'bg-slate-300')}
      >
        <span aria-hidden="true" className={cx('absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')} />
      </button>
    </div>
  )
}

export function Segmented<T extends string | number>({ value, onChange, options, label, disabled }: {
  value: T; onChange: (v: T) => void; options: ReadonlyArray<{ value: T; label: string }>; label: string; disabled?: boolean
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-xl bg-soft p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={value === o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-lg px-3 py-1.5 text-xs font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50',
            value === o.value ? 'bg-surface text-primary shadow-sm' : 'text-muted hover:text-text',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
