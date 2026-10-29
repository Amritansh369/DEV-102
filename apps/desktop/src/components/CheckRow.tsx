import { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Circle, Loader2, RotateCw, XCircle } from 'lucide-react'

export type CheckStatus = 'idle' | 'running' | 'pass' | 'fail' | 'warn'

interface CheckRowProps {
  title: string
  description: string
  icon: ReactNode
  status: CheckStatus
  detail?: string
  hint?: string
  progress?: number
  onRetry?: () => void
  children?: ReactNode
}

const BADGE: Record<CheckStatus, { label: string; cls: string }> = {
  idle: { label: 'Waiting', cls: 'bg-soft text-muted' },
  running: { label: 'Checking…', cls: 'bg-blue-50 text-accent' },
  pass: { label: 'Passed', cls: 'bg-green-50 text-success' },
  warn: { label: 'Warning', cls: 'bg-amber-50 text-warning' },
  fail: { label: 'Failed', cls: 'bg-red-50 text-danger' },
}

function StatusIcon({ status }: { status: CheckStatus }) {
  const common = 'h-5 w-5'
  if (status === 'running') return <Loader2 className={`${common} animate-spin text-accent`} aria-hidden />
  if (status === 'pass') return <CheckCircle2 className={`${common} text-success`} aria-hidden />
  if (status === 'warn') return <AlertTriangle className={`${common} text-warning`} aria-hidden />
  if (status === 'fail') return <XCircle className={`${common} text-danger`} aria-hidden />
  return <Circle className={`${common} text-border`} aria-hidden />
}

export default function CheckRow({ title, description, icon, status, detail, hint, progress, onRetry, children }: CheckRowProps) {
  const border =
    status === 'fail' ? 'border-red-200' : status === 'warn' ? 'border-amber-200' : status === 'pass' ? 'border-green-200' : 'border-border'
  const badge = BADGE[status]

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      className={`rounded-2xl border bg-white p-4 shadow-sm ${border}`}
      aria-label={`${title}: ${badge.label}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-soft text-primary">{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-heading text-sm font-semibold text-ink">{title}</h3>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`} role="status">
              {badge.label}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted">{detail ?? description}</p>
          {status === 'running' && typeof progress === 'number' && (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-soft" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
              <motion.div className="h-full rounded-full bg-accent" animate={{ width: `${progress}%` }} transition={{ ease: 'linear', duration: 0.2 }} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(status === 'fail' || status === 'warn') && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <RotateCw className="h-3.5 w-3.5" aria-hidden /> Retry
            </button>
          )}
          <StatusIcon status={status} />
        </div>
      </div>

      <AnimatePresence initial={false}>
        {(status === 'fail' || status === 'warn') && hint && (
          <motion.p
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className={`mt-3 overflow-hidden rounded-lg px-3 py-2 text-xs ${status === 'fail' ? 'bg-red-50 text-danger' : 'bg-amber-50 text-amber-700'}`}
          >
            <strong>How to fix:</strong> {hint}
          </motion.p>
        )}
      </AnimatePresence>
      {children && <div className="mt-3">{children}</div>}
    </motion.section>
  )
}
