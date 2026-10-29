import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Ban, CheckCircle2, ClipboardCopy, Download, LogOut, ShieldCheck, type LucideIcon } from 'lucide-react'

export type SubmitVariant = 'SUBMITTED' | 'AUTO_SUBMITTED' | 'DISQUALIFIED'

export interface SubmittedProps {
  variant?: SubmitVariant
  examTitle?: string
  examCode?: string
  candidateName?: string
  submittedAt?: string
  /** Shown for AUTO_SUBMITTED and DISQUALIFIED, e.g. the policy rule that fired. */
  reason?: string
  referenceNo?: string
  onClose?: () => void
}

interface VariantConfig {
  title: string
  subtitle: string
  status: string
  color: string
  badge: string
  Icon: LucideIcon
  mark: string
  steps: string[]
}

const VARIANTS: Record<SubmitVariant, VariantConfig> = {
  SUBMITTED: {
    title: 'Exam submitted',
    subtitle: 'Your responses were received and saved securely.',
    status: 'Submitted',
    color: '#16A34A',
    badge: 'bg-success/10 text-success',
    Icon: CheckCircle2,
    mark: 'M30 52 L44 66 L70 36',
    steps: ['Keep your reference number for any queries.', 'Results are published by your exam organiser. You will be emailed when they are ready.', 'You can now close this app. It is safe to disconnect your webcam.'],
  },
  AUTO_SUBMITTED: {
    title: 'Exam auto-submitted',
    subtitle: 'Your exam was submitted automatically under the exam rules.',
    status: 'Auto-submitted',
    color: '#F59E0B',
    badge: 'bg-warning/15 text-amber-700',
    Icon: AlertTriangle,
    mark: 'M50 28 L50 56 M50 70 L50 70.5',
    steps: ['Answers saved up to this moment were submitted.', 'Your mentor will review the recorded events before your result is final.', 'If you think this was a mistake, quote your reference number to your exam organiser.'],
  },
  DISQUALIFIED: {
    title: 'Session ended',
    subtitle: 'Your exam was ended because of a serious rule violation.',
    status: 'Disqualified',
    color: '#DC2626',
    badge: 'bg-danger/10 text-danger',
    Icon: Ban,
    mark: 'M34 34 L66 66 M66 34 L34 66',
    steps: ['Your result is on hold while the recorded events are reviewed.', 'Contact your exam organiser if you believe this was a mistake, and quote your reference number.', 'You cannot resume this exam.'],
  },
}

function AnimatedMark({ cfg }: { cfg: VariantConfig }) {
  return (
    <svg width="112" height="112" viewBox="0 0 100 100" aria-hidden="true">
      <motion.circle cx="50" cy="50" r="42" fill={`${cfg.color}14`} stroke={cfg.color} strokeWidth="5" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.7, ease: 'easeOut' }} transform="rotate(-90 50 50)" />
      <motion.path d={cfg.mark} fill="none" stroke={cfg.color} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45, delay: 0.6, ease: 'easeOut' }} />
    </svg>
  )
}

export default function Submitted({
  variant = 'SUBMITTED',
  examTitle = 'Exam',
  examCode = 'DEV102',
  candidateName = 'Candidate',
  submittedAt,
  reason,
  referenceNo,
  onClose,
}: SubmittedProps) {
  const cfg = VARIANTS[variant] ?? VARIANTS.SUBMITTED
  const [at] = useState(() => submittedAt ?? new Date().toISOString())
  const [fallbackRef] = useState(() => `WU-${examCode}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`)
  const ref = referenceNo ?? fallbackRef
  const [copied, setCopied] = useState(false)
  const displayReason = reason === 'TIME_UP' ? 'Time limit reached' : reason

  const when = useMemo(() => {
    try {
      const d = new Date(submittedAt ?? at)
      return isNaN(d.getTime())
        ? new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
        : d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    } catch {
      return new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    }
  }, [submittedAt, at])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ref)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  // The receipt deliberately omits answers and marks.
  const download = () => {
    const text = [
      `DEV102 Smart Proctoring: Submission receipt`,
      ``,
      `Candidate: ${candidateName}`,
      `Exam: ${examTitle} (${examCode})`,
      `Status: ${cfg.status}`,
      `Time: ${when}`,
      `Reference: ${ref}`,
      ...(displayReason ? [`Note: ${displayReason}`] : []),
      ``,
      `This receipt does not include answers or marks.`,
    ].join('\n')
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `receipt-${ref}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const close = () => {
    if (onClose) {
      onClose()
      return
    }
    const win = window as unknown as { proctor?: { window?: { close?: () => void } } }
    if (win.proctor?.window?.close) {
      void win.proctor.window.close()
    } else {
      window.close()
    }
  }

  return (
    <div className="grid min-h-full place-items-center bg-soft p-8">
      <motion.main initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-xl rounded-3xl bg-white p-10 text-center shadow-xl ring-1 ring-border" aria-labelledby="submitted-title">
        <div className="flex justify-center"><AnimatedMark cfg={cfg} /></div>
        <span className={`mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${cfg.badge}`}><cfg.Icon className="h-3.5 w-3.5" aria-hidden="true" />{cfg.status}</span>
        <h1 id="submitted-title" role="status" className="mt-3 font-heading text-3xl font-semibold text-text">{cfg.title}</h1>
        <p className="mt-2 text-muted">{cfg.subtitle}</p>
        {displayReason && variant !== 'SUBMITTED' && <p className="mx-auto mt-4 max-w-md rounded-xl border border-border bg-soft px-4 py-3 text-left text-sm text-text"><span className="font-semibold">Reason: </span>{displayReason}</p>}

        <dl className="mt-6 grid grid-cols-2 gap-3 text-left text-sm">
          <div className="rounded-xl bg-soft p-3"><dt className="text-xs text-muted">Candidate</dt><dd className="truncate font-semibold text-text">{candidateName}</dd></div>
          <div className="rounded-xl bg-soft p-3"><dt className="text-xs text-muted">Time</dt><dd className="font-semibold text-text">{when}</dd></div>
          <div className="col-span-2 rounded-xl bg-soft p-3"><dt className="text-xs text-muted">Exam</dt><dd className="font-semibold text-text">{examTitle}</dd></div>
          <div className="col-span-2 flex items-center justify-between gap-3 rounded-xl border border-dashed border-accent/50 bg-white p-3">
            <div className="min-w-0"><dt className="text-xs text-muted">Reference number</dt><dd className="truncate font-mono text-base font-semibold tracking-wide text-primary">{ref}</dd></div>
            <div className="flex shrink-0 gap-2">
              <button onClick={() => void copy()} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text hover:bg-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"><ClipboardCopy className="h-3.5 w-3.5" aria-hidden="true" /><span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span></button>
              <button onClick={download} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text hover:bg-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"><Download className="h-3.5 w-3.5" aria-hidden="true" />Receipt</button>
            </div>
          </div>
        </dl>

        <section className="mt-6 text-left" aria-label="Next steps">
          <h2 className="mb-2 font-heading text-base font-semibold text-text">What happens next</h2>
          <ol className="space-y-2">
            {cfg.steps.map((s, i) => (
              <li key={s} className="flex gap-3 text-sm text-text"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-soft text-xs font-semibold text-primary-600">{i + 1}</span><span className="pt-0.5">{s}</span></li>
            ))}
          </ol>
        </section>

        <p className="mt-6 flex items-center justify-center gap-2 text-xs text-muted"><ShieldCheck className="h-4 w-4 text-success" aria-hidden="true" />Camera and screen sharing have stopped. Monitoring has ended.</p>
        <button onClick={close} autoFocus className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cta px-6 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:brightness-95 focus:outline-none focus-visible:ring-4 focus-visible:ring-cta/40"><LogOut className="h-4 w-4" aria-hidden="true" />Close app</button>
      </motion.main>
    </div>
  )
}
