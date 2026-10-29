'use client'

import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Mail, RotateCcw, ShieldCheck, X } from 'lucide-react'

export interface EmailTemplate {
  subject: string
  body: string
}

export const VARIABLES = [
  { key: 'name', label: 'Candidate name' },
  { key: 'examName', label: 'Exam name' },
  { key: 'examId', label: 'Exam ID' },
  { key: 'userId', label: 'Candidate ID' },
  { key: 'password', label: 'Password' },
  { key: 'startTime', label: 'Start time' },
  { key: 'appLink', label: 'App download link' },
  { key: 'inviteLink', label: 'Exam link (one per candidate)' },
] as const

export const DEFAULT_TEMPLATE: EmailTemplate = {
  subject: 'Your sign-in details for {{examName}}',
  body: `Hello {{name}},

You have been registered for {{examName}}, starting {{startTime}}.

Your exam link: {{inviteLink}}
Password: {{password}}

Install the Smart Proctor app from {{appLink}}, paste the exam link, enter the password and complete the system check at least 15 minutes before the start. The link works on one computer only and expires when the exam ends.

Exam ID: {{examId}}
Candidate ID: {{userId}}

Keep these details private. If you did not expect this email, contact your exam coordinator.`,
}

export function renderTemplate(text: string, vars: Record<string, string>) {
  return text.replace(/\{\{(\w+)\}\}/g, (m, k: string) => vars[k] ?? m)
}

function segments(text: string, vars: Record<string, string>) {
  const out: { text: string; variable: boolean }[] = []
  let last = 0
  for (const m of text.matchAll(/\{\{(\w+)\}\}/g)) {
    const at = m.index ?? 0
    if (at > last) out.push({ text: text.slice(last, at), variable: false })
    out.push({ text: vars[m[1]] ?? m[0], variable: m[1] in vars })
    last = at + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last), variable: false })
  return out
}

interface EmailPreviewModalProps {
  open: boolean
  onClose: () => void
  template: EmailTemplate
  onChange: (t: EmailTemplate) => void
  examName: string
  examId: string
  startTime: string
  appLink: string
  sample?: { name: string; userId: string; password: string }
}

const FALLBACK_SAMPLE = { name: 'Aarav Sharma', userId: 'WUE26-0001', password: 'Kp7#mQ2xRt' }

export default function EmailPreviewModal({ open, onClose, template, onChange, examName, examId, startTime, appLink, sample }: EmailPreviewModalProps) {
  const s = sample ?? FALLBACK_SAMPLE
  const vars: Record<string, string> = { name: s.name, examName, examId, userId: s.userId, password: s.password, startTime, appLink, inviteLink: `${typeof window === 'undefined' ? '' : window.location.origin}/join/3f9c…e21a` }

  const subjectRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const lastField = useRef<'subject' | 'body'>('body')
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [open, onClose])

  const insert = (key: string) => {
    const field = lastField.current
    const el = field === 'subject' ? subjectRef.current : bodyRef.current
    const token = `{{${key}}}`
    const value = template[field]
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    onChange({ ...template, [field]: value.slice(0, start) + token + value.slice(end) })
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + token.length, start + token.length)
    })
  }

  const field = 'mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent'

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Credentials email preview"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
            className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl outline-none"
          >
            <header className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-ink">
                <Mail className="h-4 w-4 text-accent" aria-hidden /> Credentials email
              </h2>
              <button type="button" onClick={onClose} aria-label="Close preview" className="rounded-lg p-1.5 text-muted hover:bg-soft focus-visible:outline-2 focus-visible:outline-accent">
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="grid flex-1 gap-0 overflow-y-auto lg:grid-cols-2">
              <section className="space-y-4 border-b border-border p-5 lg:border-b-0 lg:border-r" aria-label="Edit template">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">Insert variable</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {VARIABLES.map((v) => (
                      <button key={v.key} type="button" onClick={() => insert(v.key)} title={v.label} className="rounded-full bg-blue-50 px-2.5 py-1 font-mono text-[11px] font-medium text-accent hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-accent">
                        {`{{${v.key}}}`}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted">Chips insert at the cursor in whichever field you last clicked.</p>
                </div>
                <label className="block text-sm font-medium text-ink">
                  Subject
                  <input ref={subjectRef} value={template.subject} onFocus={() => (lastField.current = 'subject')} onChange={(e) => onChange({ ...template, subject: e.target.value })} className={field} />
                </label>
                <label className="block text-sm font-medium text-ink">
                  Body
                  <textarea ref={bodyRef} rows={13} value={template.body} onFocus={() => (lastField.current = 'body')} onChange={(e) => onChange({ ...template, body: e.target.value })} className={`${field} font-mono text-xs leading-relaxed`} />
                </label>
                <button type="button" onClick={() => onChange(DEFAULT_TEMPLATE)} className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent">
                  <RotateCcw className="h-3 w-3" aria-hidden /> Reset to default
                </button>
              </section>

              <section className="bg-soft p-5" aria-label="Preview">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Preview · sample candidate</p>
                <article className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
                  <div className="flex items-center gap-2.5 bg-gradient-to-br from-primary via-primary-600 to-accent px-5 py-4 text-white">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15"><ShieldCheck className="h-4 w-4" aria-hidden /></span>
                    <div>
                      <p className="font-heading text-sm font-semibold">Smart Proctor</p>
                      <p className="text-[11px] text-white/70">Where U Elevate</p>
                    </div>
                  </div>
                  <div className="px-5 py-4">
                    <p className="border-b border-border pb-3 text-sm font-semibold text-ink">
                      {segments(template.subject, vars).map((p, i) => (
                        <span key={i} className={p.variable ? 'rounded bg-blue-50 px-0.5 text-accent' : ''}>{p.text}</span>
                      ))}
                    </p>
                    <div className="mt-3 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink">
                      {segments(template.body, vars).map((p, i) => (
                        <span key={i} className={p.variable ? 'rounded bg-blue-50 px-0.5 font-medium text-accent' : ''}>{p.text}</span>
                      ))}
                    </div>
                  </div>
                  <p className="border-t border-border bg-soft/60 px-5 py-2.5 text-[11px] text-muted">© Where U Elevate · DEV102 Assessment Platform · Automated message, do not reply.</p>
                </article>
                <p className="mt-2 text-[11px] text-muted">Highlighted text is replaced per candidate when emails are sent.</p>
              </section>
            </div>

            <footer className="flex justify-end border-t border-border px-5 py-3">
              <button type="button" onClick={onClose} className="rounded-xl bg-cta px-5 py-2 text-sm font-semibold text-ink shadow-sm hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                Done
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
