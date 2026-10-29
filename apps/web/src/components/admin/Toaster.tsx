'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Info, X, XCircle, type LucideIcon } from 'lucide-react'
import { useAdminUi, type ToastTone } from '@/lib/adminStore'

const TONES: Record<ToastTone, { icon: LucideIcon; color: string }> = {
  success: { icon: CheckCircle2, color: 'text-success' },
  error: { icon: XCircle, color: 'text-danger' },
  warning: { icon: AlertTriangle, color: 'text-warning' },
  info: { icon: Info, color: 'text-accent' },
}

export function Toaster() {
  const toasts = useAdminUi((s) => s.toasts)
  const dismiss = useAdminUi((s) => s.dismissToast)

  return (
    <div
      role="region"
      aria-live="polite"
      aria-label="Toast messages"
      className="pointer-events-none fixed bottom-4 right-4 z-[90] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const { icon: Icon, color } = TONES[t.tone]
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.2 }}
              role={t.tone === 'error' ? 'alert' : 'status'}
              className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 shadow-[0_12px_32px_-12px_rgba(15,23,42,0.3)]"
            >
              <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${color}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-text">{t.title}</p>
                {t.description && <p className="mt-0.5 text-sm text-muted">{t.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss message"
                className="rounded-lg p-1 text-muted outline-none transition hover:bg-soft hover:text-text focus-visible:ring-2 focus-visible:ring-accent"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
