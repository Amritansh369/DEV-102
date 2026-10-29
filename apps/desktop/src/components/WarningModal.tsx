import { KeyboardEvent, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertOctagon, AlertTriangle, ShieldAlert } from 'lucide-react'
import type { Severity, ViolationCode } from '../lib/types'

export type WarningKind = 'warning' | 'final' | 'submit'

export interface WarningInfo {
  id: string
  code: ViolationCode
  severity: Severity
  message: string
  kind: WarningKind
  warningNumber: number
}

interface WarningModalProps {
  warning: WarningInfo | null
  maxWarnings: number
  onAcknowledge: (id: string) => void
  onAutoSubmit: (message: string) => void
}

const COUNTDOWN: Record<WarningKind, number> = { warning: 20, final: 25, submit: 10 }
const READ_LOCK_SEC = 3

const SEVERITY_BADGE: Record<Severity, string> = {
  LOW: 'bg-slate-100 text-muted',
  MEDIUM: 'bg-amber-100 text-amber-800',
  HIGH: 'bg-orange-100 text-orange-800',
  CRITICAL: 'bg-red-100 text-danger',
}

const THEME: Record<WarningKind, { head: string; icon: typeof AlertTriangle; bar: string }> = {
  warning: { head: 'bg-amber-500 text-white', icon: AlertTriangle, bar: 'bg-amber-500' },
  final: { head: 'bg-orange-600 text-white', icon: ShieldAlert, bar: 'bg-orange-600' },
  submit: { head: 'bg-danger text-white', icon: AlertOctagon, bar: 'bg-danger' },
}

export default function WarningModal({ warning, maxWarnings, onAcknowledge, onAutoSubmit }: WarningModalProps) {
  const [left, setLeft] = useState(0)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const callbacks = useRef({ onAcknowledge, onAutoSubmit })
  callbacks.current = { onAcknowledge, onAutoSubmit }

  useEffect(() => {
    if (!warning) return
    const total = COUNTDOWN[warning.kind]
    const end = Date.now() + total * 1000
    setLeft(total)
    window.requestAnimationFrame(() => buttonRef.current?.focus())
    const id = window.setInterval(() => {
      const rem = Math.ceil((end - Date.now()) / 1000)
      setLeft(Math.max(0, rem))
      if (rem <= 0) {
        window.clearInterval(id)
        if (warning.kind === 'submit') callbacks.current.onAutoSubmit(warning.message)
        else callbacks.current.onAcknowledge(warning.id)
      }
    }, 250)
    return () => window.clearInterval(id)
  }, [warning])

  const trap = (e: KeyboardEvent<HTMLDivElement>) => {
    // The dialog has one action; keep focus on it and never allow Escape to dismiss.
    if (e.key === 'Tab' || e.key === 'Escape') {
      e.preventDefault()
      buttonRef.current?.focus()
    }
  }

  return (
    <AnimatePresence>
      {warning && (
        <motion.div
          key="warning-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/60 p-6 backdrop-blur-sm"
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="warning-title"
            aria-describedby="warning-desc"
            onKeyDown={trap}
            initial={{ scale: 0.94, y: 14 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <WarningBody warning={warning} left={left} maxWarnings={maxWarnings} buttonRef={buttonRef} onAcknowledge={onAcknowledge} onAutoSubmit={onAutoSubmit} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

interface BodyProps {
  warning: WarningInfo
  left: number
  maxWarnings: number
  buttonRef: React.RefObject<HTMLButtonElement | null>
  onAcknowledge: (id: string) => void
  onAutoSubmit: (message: string) => void
}

function WarningBody({ warning, left, maxWarnings, buttonRef, onAcknowledge, onAutoSubmit }: BodyProps) {
  const theme = THEME[warning.kind]
  const Icon = theme.icon
  const total = COUNTDOWN[warning.kind]
  const locked = warning.kind !== 'submit' && total - left < READ_LOCK_SEC
  const used = Math.min(warning.warningNumber, maxWarnings)

  const title = warning.kind === 'submit' ? 'Exam is being submitted' : warning.kind === 'final' ? 'Final warning' : `Warning ${used} of ${maxWarnings}`
  const subtitle =
    warning.kind === 'submit'
      ? 'Violation limit reached'
      : warning.kind === 'final'
        ? 'Another serious violation may end your exam'
        : 'Please follow the exam rules'

  return (
    <>
      <div className={`flex items-center gap-3 px-6 py-4 ${theme.head}`}>
        <Icon className="h-7 w-7 shrink-0" aria-hidden />
        <div>
          <h2 id="warning-title" className="font-heading text-lg font-semibold leading-tight">{title}</h2>
          <p className="text-xs opacity-90">{subtitle}</p>
        </div>
      </div>
      <div className="px-6 py-5">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${SEVERITY_BADGE[warning.severity]}`}>{warning.severity}</span>
        <p id="warning-desc" className="mt-2 text-sm leading-relaxed text-ink">{warning.message}</p>

        <div className="mt-4 flex items-center gap-2" aria-label={`${used} of ${maxWarnings} warnings used`}>
          {Array.from({ length: maxWarnings }, (_, i) => (
            <span key={i} className={`h-2 flex-1 rounded-full ${i < used ? theme.bar : 'bg-soft'}`} />
          ))}
          <span className="ml-1 text-xs font-medium tabular-nums text-muted">{used}/{maxWarnings}</span>
        </div>

        <p className="mt-4 text-xs text-muted" role="status">
          {warning.kind === 'submit'
            ? `Your answers will be submitted automatically in ${left}s.`
            : `Repeated or serious violations are reported to your invigilator. This notice closes in ${left}s.`}
        </p>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-soft" aria-hidden>
          <div className={`h-full ${theme.bar} transition-[width] duration-300 ease-linear`} style={{ width: `${(left / total) * 100}%` }} />
        </div>

        <button
          ref={buttonRef}
          type="button"
          disabled={locked}
          onClick={() => (warning.kind === 'submit' ? onAutoSubmit(warning.message) : onAcknowledge(warning.id))}
          className="mt-5 w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          {warning.kind === 'submit' ? 'Submit now' : locked ? `I understand (${READ_LOCK_SEC - (total - left)})` : 'I understand'}
        </button>
      </div>
    </>
  )
}
