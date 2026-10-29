'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, HelpCircle, Loader2, X } from 'lucide-react'
import { cx } from '@/lib/adminHooks'
import { btnGhost } from './FormControls'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/** Moves focus into the container, loops Tab inside it and restores focus on unmount. */
export function useFocusTrap(ref: { readonly current: HTMLElement | null }, active: boolean): void {
  useEffect(() => {
    if (!active) return
    const node = ref.current
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    ;(node?.querySelector<HTMLElement>('[data-autofocus]') ?? node?.querySelector<HTMLElement>(FOCUSABLE) ?? node)?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !node) return
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null)
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus()
    }
  }, [ref, active])
}

export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [active])
}

const SIZES = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-6xl' } as const

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  size?: keyof typeof SIZES
  /** Blocks Escape and scrim clicks while something is saving. */
  locked?: boolean
  role?: 'dialog' | 'alertdialog'
  footer?: ReactNode
  children: ReactNode
}

function ModalPanel({ onClose, title, description, size = 'md', locked, role = 'dialog', footer, children }: Omit<ModalProps, 'open'>) {
  const ref = useRef<HTMLDivElement>(null)
  const uid = useId()
  useFocusTrap(ref, true)
  useScrollLock(true)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !locked) { e.stopPropagation(); onClose() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [locked, onClose])

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !locked && onClose()} className="absolute inset-0 bg-slate-900/45" aria-hidden="true" />
      <motion.div
        ref={ref}
        role={role}
        aria-modal="true"
        aria-labelledby={`${uid}-t`}
        aria-describedby={description ? `${uid}-d` : undefined}
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.16 }}
        className={cx('relative flex max-h-[calc(100vh-2rem)] w-full flex-col rounded-2xl bg-surface shadow-[0_24px_64px_-16px_rgba(15,23,42,0.45)] outline-none', SIZES[size])}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div>
            <h2 id={`${uid}-t`} className="font-heading text-lg font-semibold text-text">{title}</h2>
            {description && <p id={`${uid}-d`} className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
          <button type="button" onClick={onClose} disabled={locked} aria-label="Close dialog" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted outline-none transition hover:bg-soft focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <footer className="flex justify-end gap-3 border-t border-border px-6 py-4">{footer}</footer>}
      </motion.div>
    </div>
  )
}

export function Modal({ open, children, ...rest }: ModalProps) {
  return <AnimatePresence>{open && <ModalPanel key="modal" {...rest}>{children}</ModalPanel>}</AnimatePresence>
}

export function ConfirmDialog({ open, title, confirmLabel, busy = false, tone = 'danger', onConfirm, onCancel, children }: {
  open: boolean; title: string; confirmLabel: string; busy?: boolean; tone?: 'danger' | 'primary'; onConfirm: () => void; onCancel: () => void; children: ReactNode
}) {
  const danger = tone === 'danger'
  const Icon = danger ? AlertTriangle : HelpCircle
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      locked={busy}
      role="alertdialog"
      footer={
        <>
          <button type="button" data-autofocus onClick={onCancel} disabled={busy} className={btnGhost}>Cancel</button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={cx('inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white outline-none transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-70', danger ? 'bg-danger focus-visible:ring-danger' : 'bg-primary focus-visible:ring-accent')}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} {confirmLabel}
          </button>
        </>
      }
    >
      <div className="flex items-start gap-4">
        <span className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-xl', danger ? 'bg-danger/10 text-danger' : 'bg-accent/10 text-primary-600')}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="space-y-2 text-sm text-muted">{children}</div>
      </div>
    </Modal>
  )
}
