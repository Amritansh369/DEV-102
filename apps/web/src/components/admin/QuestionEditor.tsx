'use client'

import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, Check, Eye, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { z } from 'zod'
import { cx } from '@/lib/adminHooks'
import { toast } from '@/lib/adminStore'
import type { QuestionDraft } from '@/lib/api'
import type { Question } from '@/lib/types'
import { Field, Segmented, btnGhost, btnPrimary, describedBy, inputCls, inputState } from './FormControls'
import { Markdown } from './Markdown'
import { useFocusTrap, useScrollLock } from './Dialogs'

interface FormState {
  type: 'MCQ' | 'NUMERIC'
  text: string
  options: { id: string; text: string }[]
  correctIds: string[]
  multi: boolean
  marks: string
  difficulty: Question['difficulty']
  tags: string[]
  /** NUMERIC only, kept as typed so half-finished input is not lost. */
  value: string
  tolerance: string
  unit: string
}

const blank = (): FormState => ({ type: 'MCQ', value: '', tolerance: '0', unit: '', text: '', options: ['a', 'b', 'c', 'd'].map((id) => ({ id, text: '' })), correctIds: [], multi: false, marks: '1', difficulty: 'MEDIUM', tags: [] })
const fromQuestion = (q: Question): FormState => ({
  type: q.type ?? 'MCQ', value: q.answerKey ? String(q.answerKey.value) : '', tolerance: String(q.answerKey?.tolerance ?? 0), unit: q.answerKey?.unit ?? '',
  text: q.text, options: q.options.map((o) => ({ ...o })), correctIds: [...q.correctIds], multi: q.multi, marks: String(q.marks), difficulty: q.difficulty, tags: [...q.tags],
})

const commonFields = {
  text: z.string().trim().min(10, 'Write at least 10 characters for the question').max(2000, 'Keep the question under 2000 characters'),
  marks: z.number().min(0.25, 'Marks must be between 0.25 and 20').max(20, 'Marks must be between 0.25 and 20'),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  tags: z.array(z.string().min(1).max(24, 'Tags can be up to 24 characters')).max(6, 'Use at most 6 tags'),
}

const numericSchema = z.object({
  ...commonFields,
  value: z.number({ invalid_type_error: 'Enter the correct value as a number' }),
  tolerance: z.number({ invalid_type_error: 'Tolerance must be a number' }).min(0, 'Tolerance cannot be negative').max(1e9, 'Tolerance is too large'),
  unit: z.string().trim().max(20, 'Keep the unit under 20 characters'),
})

const schema = z
  .object({
    ...commonFields,
    options: z
      .array(z.object({ id: z.string(), text: z.string().trim().min(1, 'Option text is required').max(300, 'Keep options under 300 characters') }))
      .min(2, 'Add at least 2 options')
      .max(6, 'Use at most 6 options'),
    correctIds: z.array(z.string()).min(1, 'Mark at least one correct answer'),
    multi: z.boolean(),
  })
  .superRefine((q, ctx) => {
    const seen = new Set<string>()
    q.options.forEach((o, i) => {
      const key = o.text.toLowerCase()
      if (key && seen.has(key)) ctx.addIssue({ code: 'custom', path: ['options', i, 'text'], message: 'Duplicate option' })
      seen.add(key)
    })
    if (!q.multi && q.correctIds.length > 1) ctx.addIssue({ code: 'custom', path: ['correctIds'], message: 'Single-answer questions allow exactly one correct option' })
    if (q.multi && q.correctIds.length === 1) ctx.addIssue({ code: 'custom', path: ['correctIds'], message: 'Multiple-answer questions need at least 2 correct options' })
  })

/** Empty or non-numeric text becomes NaN, which the schema reports with a readable message. */
const num = (raw: string) => (raw.trim() === '' ? Number.NaN : Number(raw))
/** Hides binary rounding noise in the preview, e.g. 3.14 - 0.01 shows as 3.13. */
const tidy = (n: number) => Number(n.toFixed(10))

function issuesOf(issues: z.ZodIssue[]): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const i of issues) {
    const k = i.path.join('.')
    if (!(k in errors)) errors[k] = i.message
  }
  return errors
}

function validate(f: FormState): { errors: Record<string, string>; draft: QuestionDraft | null } {
  const marks = f.marks.trim() === '' ? 0 : Number(f.marks)
  if (f.type === 'NUMERIC') {
    const n = numericSchema.safeParse({ ...f, marks: Number.isFinite(marks) ? marks : 0, value: num(f.value), tolerance: num(f.tolerance) })
    if (!n.success) return { errors: issuesOf(n.error.issues), draft: null }
    return {
      errors: {},
      draft: {
        type: 'NUMERIC', text: n.data.text, options: [], correctIds: [], multi: false, marks: n.data.marks, difficulty: n.data.difficulty, tags: n.data.tags,
        answerKey: { value: n.data.value, tolerance: n.data.tolerance, unit: n.data.unit || null },
      },
    }
  }
  const r = schema.safeParse({ ...f, marks: Number.isFinite(marks) ? marks : 0 })
  if (r.success) {
    return {
      errors: {},
      draft: {
        type: 'MCQ',
        text: r.data.text ?? '',
        options: (r.data.options ?? []).map((option) => ({ id: option.id ?? '', text: option.text ?? '' })),
        correctIds: r.data.correctIds ?? [],
        multi: r.data.multi ?? false,
        marks: r.data.marks ?? 0,
        difficulty: r.data.difficulty ?? 'MEDIUM',
        tags: r.data.tags ?? [],
      },
    }
  }
  return { errors: issuesOf(r.error.issues), draft: null }
}

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')

interface PanelProps {
  question: Question | null
  tagSuggestions: string[]
  onSave: (draft: QuestionDraft, id?: string) => Promise<void>
  onClose: () => void
}

function EditorPanel({ question, tagSuggestions, onSave, onClose }: PanelProps) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, true)
  useScrollLock(true)

  const [f, setF] = useState<FormState>(() => (question ? fromQuestion(question) : blank()))
  const initial = useRef(JSON.stringify(f))
  const dirty = JSON.stringify(f) !== initial.current
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set())
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const { errors, draft } = useMemo(() => validate(f), [f])
  const issueCount = Object.keys(errors).length

  const touch = (k: string) => setTouched((t) => new Set(t).add(k))
  const shown = (k: string) => (submitted || touched.has(k) ? errors[k] : undefined)
  const patch = (p: Partial<FormState>) => setF((s) => ({ ...s, ...p }))
  const requestClose = () => (dirty && !saving ? setConfirmClose(true) : onClose())

  const addOption = () => {
    const used = new Set(f.options.map((o) => o.id))
    const id = 'abcdefgh'.split('').find((c) => !used.has(c)) ?? `o${f.options.length}`
    patch({ options: [...f.options, { id, text: '' }] })
  }
  const removeOption = (id: string) => patch({ options: f.options.filter((o) => o.id !== id), correctIds: f.correctIds.filter((c) => c !== id) })
  const toggleCorrect = (id: string) => {
    touch('correctIds')
    patch({ correctIds: f.multi ? (f.correctIds.includes(id) ? f.correctIds.filter((c) => c !== id) : [...f.correctIds, id]) : [id] })
  }
  const addTag = (raw: string) => {
    const t = slug(raw)
    if (t && !f.tags.includes(t) && f.tags.length < 6) patch({ tags: [...f.tags, t] })
    setTagInput('')
  }
  const onTagKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput) }
    else if (e.key === 'Backspace' && tagInput === '' && f.tags.length > 0) patch({ tags: f.tags.slice(0, -1) })
  }

  const save = async () => {
    setSubmitted(true)
    if (!draft) {
      toast.warning('Fix the highlighted fields', `${issueCount} issue${issueCount > 1 ? 's' : ''} need attention.`)
      return
    }
    setSaving(true)
    try {
      await onSave(draft, question?.id)
    } catch (e) {
      toast.error('Could not save the question', e instanceof Error ? e.message : 'Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.stopPropagation(); requestClose() }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void save() }
  }

  const suggestions = tagSuggestions.filter((t) => !f.tags.includes(t) && t.includes(slug(tagInput))).slice(0, 8)
  const textErr = shown('text')
  const marksErr = shown('marks')

  return (
    <div className="fixed inset-0 z-[70]" onKeyDown={onKeyDown}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={requestClose} className="absolute inset-0 bg-slate-900/45" aria-hidden="true" />
      <motion.aside
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={question ? 'Edit question' : 'Add question'}
        tabIndex={-1}
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'tween', duration: 0.22 }}
        className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col bg-surface shadow-2xl outline-none"
      >
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="font-heading text-lg font-semibold text-text">{question ? 'Edit question' : 'Add question'}</h2>
            <p className="text-xs text-muted">Ctrl Enter saves · Esc closes</p>
          </div>
          <button type="button" onClick={requestClose} aria-label="Close editor" className="grid h-9 w-9 place-items-center rounded-lg text-muted outline-none hover:bg-soft focus-visible:ring-2 focus-visible:ring-accent"><X className="h-5 w-5" aria-hidden="true" /></button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="q-text" className="text-sm font-medium text-slate-700">Question <span className="text-danger" aria-hidden="true">*</span></label>
              <div role="tablist" aria-label="Editor mode" className="inline-flex rounded-lg bg-soft p-0.5">
                {([['write', Pencil, 'Write'], ['preview', Eye, 'Preview']] as const).map(([key, Icon, label]) => (
                  <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={cx('inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-accent', tab === key ? 'bg-surface text-primary shadow-sm' : 'text-muted')}>
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}
                  </button>
                ))}
              </div>
            </div>
            {tab === 'write' ? (
              <>
                <textarea id="q-text" rows={6} value={f.text} onChange={(e) => { patch({ text: e.target.value }); touch('text') }} onBlur={() => touch('text')} aria-invalid={Boolean(textErr)} aria-describedby={textErr ? 'q-text-err' : 'q-text-hint'} placeholder={'Type the question. Markdown works: **bold**, `code`, lists and ``` fenced code.'} className={cx(inputCls, inputState(textErr), 'h-auto resize-y py-2.5 font-mono text-[13px] leading-relaxed')} />
                <div className="mt-1.5 flex justify-between text-xs">
                  {textErr ? <p id="q-text-err" role="alert" className="font-medium text-danger">{textErr}</p> : <p id="q-text-hint" className="text-muted">Supports Markdown</p>}
                  <span className="tabular-nums text-muted">{f.text.length} / 2000</span>
                </div>
              </>
            ) : (
              <div className="min-h-[148px] rounded-xl border border-border bg-soft/60 p-4">
                {f.text.trim() ? <Markdown source={f.text} /> : <p className="text-sm text-muted">Nothing to preview yet.</p>}
              </div>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700">Question type</p>
            <Segmented label="Question type" value={f.type} onChange={(v) => patch({ type: v })} options={[{ value: 'MCQ', label: 'Multiple choice' }, { value: 'NUMERIC', label: 'Numeric' }]} />
          </div>

          {f.type === 'NUMERIC' ? (
            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-medium text-slate-700">Correct answer <span className="text-danger" aria-hidden="true">*</span></legend>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field id="q-value" label="Correct value" required error={shown('value')}>
                  <input id="q-value" type="text" inputMode="decimal" value={f.value} onChange={(e) => { patch({ value: e.target.value }); touch('value') }} onBlur={() => touch('value')} aria-invalid={Boolean(shown('value'))} aria-describedby={describedBy('q-value', shown('value'))} placeholder="e.g. 72" className={cx(inputCls, inputState(shown('value')), 'font-mono')} />
                </Field>
                <Field id="q-tolerance" label="Tolerance (±)" error={shown('tolerance')} hint="0 means exact">
                  <input id="q-tolerance" type="text" inputMode="decimal" value={f.tolerance} onChange={(e) => { patch({ tolerance: e.target.value }); touch('tolerance') }} onBlur={() => touch('tolerance')} aria-invalid={Boolean(shown('tolerance'))} aria-describedby={describedBy('q-tolerance', shown('tolerance'), '0 means exact')} className={cx(inputCls, inputState(shown('tolerance')), 'font-mono')} />
                </Field>
                <Field id="q-unit" label="Unit" error={shown('unit')} hint="Optional, e.g. km/h">
                  <input id="q-unit" type="text" value={f.unit} onChange={(e) => { patch({ unit: e.target.value }); touch('unit') }} onBlur={() => touch('unit')} aria-invalid={Boolean(shown('unit'))} aria-describedby={describedBy('q-unit', shown('unit'), 'Optional, e.g. km/h')} className={cx(inputCls, inputState(shown('unit')))} />
                </Field>
              </div>
              <p className="text-xs text-muted">
                {Number.isFinite(num(f.value)) && Number.isFinite(num(f.tolerance)) && num(f.tolerance) >= 0
                  ? `Accepted: ${num(f.tolerance) > 0 ? `${tidy(num(f.value) - num(f.tolerance))} to ${tidy(num(f.value) + num(f.tolerance))}` : `exactly ${num(f.value)}`}${f.unit.trim() ? ` ${f.unit.trim()}` : ''}. Candidates type a number; options are not used.`
                  : 'Candidates type a number; options are not used.'}
              </p>
            </fieldset>
          ) : (
          <fieldset>
            <legend className="mb-2 flex w-full items-center justify-between">
              <span className="text-sm font-medium text-slate-700">Options and correct answer <span className="text-danger" aria-hidden="true">*</span></span>
              <Segmented label="Answer type" value={f.multi ? 'multi' : 'single'} onChange={(v) => patch({ multi: v === 'multi', correctIds: v === 'single' ? f.correctIds.slice(0, 1) : f.correctIds })} options={[{ value: 'single', label: 'Single answer' }, { value: 'multi', label: 'Multiple answers' }]} />
            </legend>
            <ul className="space-y-2">
              {f.options.map((o, i) => {
                const correct = f.correctIds.includes(o.id)
                const err = shown(`options.${i}.text`)
                return (
                  <li key={o.id}>
                    <div className="flex items-center gap-2">
                      <button type="button" role={f.multi ? 'checkbox' : 'radio'} aria-checked={correct} aria-label={`Mark option ${String.fromCharCode(65 + i)} as correct`} onClick={() => toggleCorrect(o.id)} className={cx('grid h-10 w-10 shrink-0 place-items-center border text-sm font-bold outline-none transition focus-visible:ring-2 focus-visible:ring-accent', f.multi ? 'rounded-lg' : 'rounded-full', correct ? 'border-success bg-success text-white' : 'border-border bg-surface text-muted hover:border-success hover:text-success')}>
                        {correct ? <Check className="h-4 w-4" aria-hidden="true" /> : String.fromCharCode(65 + i)}
                      </button>
                      <input value={o.text} onChange={(e) => { patch({ options: f.options.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)) }); touch(`options.${i}.text`) }} onBlur={() => touch(`options.${i}.text`)} aria-label={`Option ${String.fromCharCode(65 + i)} text`} aria-invalid={Boolean(err)} placeholder={`Option ${String.fromCharCode(65 + i)}`} className={cx(inputCls, inputState(err))} />
                      <button type="button" onClick={() => removeOption(o.id)} disabled={f.options.length <= 2} aria-label={`Remove option ${String.fromCharCode(65 + i)}`} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-muted outline-none hover:bg-danger/10 hover:text-danger focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                    </div>
                    {err && <p role="alert" className="ml-12 mt-1 text-xs font-medium text-danger">{err}</p>}
                  </li>
                )
              })}
            </ul>
            <div className="mt-2 flex items-center justify-between">
              <button type="button" onClick={addOption} disabled={f.options.length >= 6} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-accent outline-none hover:bg-soft focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"><Plus className="h-4 w-4" aria-hidden="true" /> Add option</button>
              <span className="text-xs text-muted">{f.options.length} of 6 options</span>
            </div>
            {(shown('correctIds') || shown('options')) && <p role="alert" className="mt-1 text-xs font-medium text-danger">{shown('correctIds') ?? shown('options')}</p>}
          </fieldset>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="q-marks" label="Marks" required error={marksErr} hint="Between 0.25 and 20">
              <input id="q-marks" type="number" inputMode="decimal" step="0.25" min="0.25" max="20" value={f.marks} onChange={(e) => { patch({ marks: e.target.value }); touch('marks') }} onBlur={() => touch('marks')} aria-invalid={Boolean(marksErr)} aria-describedby={describedBy('q-marks', marksErr, 'x')} className={cx(inputCls, inputState(marksErr))} />
            </Field>
            <div>
              <p className="mb-1.5 text-sm font-medium text-slate-700">Difficulty</p>
              <Segmented label="Difficulty" value={f.difficulty} onChange={(v) => patch({ difficulty: v })} options={[{ value: 'EASY', label: 'Easy' }, { value: 'MEDIUM', label: 'Medium' }, { value: 'HARD', label: 'Hard' }]} />
            </div>
          </div>

          <div>
            <label htmlFor="q-tags" className="mb-1.5 block text-sm font-medium text-slate-700">Tags</label>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border px-3 py-2 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30">
              {f.tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                  {t}<button type="button" onClick={() => patch({ tags: f.tags.filter((x) => x !== t) })} aria-label={`Remove tag ${t}`} className="rounded-full outline-none hover:text-danger focus-visible:ring-2 focus-visible:ring-accent"><X className="h-3 w-3" aria-hidden="true" /></button>
                </span>
              ))}
              <input id="q-tags" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={onTagKey} onBlur={() => tagInput && addTag(tagInput)} placeholder={f.tags.length ? '' : 'Type a tag and press Enter'} disabled={f.tags.length >= 6} className="min-w-[8rem] flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted" />
            </div>
            {suggestions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Tag suggestions">
                {suggestions.map((t) => <button key={t} type="button" onClick={() => addTag(t)} className="rounded-full border border-border px-2.5 py-0.5 text-xs text-slate-600 outline-none hover:bg-soft focus-visible:ring-2 focus-visible:ring-accent">+ {t}</button>)}
              </div>
            )}
            {shown('tags') && <p role="alert" className="mt-1.5 text-xs font-medium text-danger">{shown('tags')}</p>}
          </div>

          {tab === 'preview' && (
            <div className="rounded-xl border border-border p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">How options appear to the candidate</p>
              <ul className="space-y-2">
                {f.options.map((o, i) => (
                  <li key={o.id} className={cx('flex items-center gap-3 rounded-lg border px-3 py-2 text-sm', f.correctIds.includes(o.id) ? 'border-success/40 bg-success/5' : 'border-border')}>
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-soft text-xs font-bold text-slate-600">{String.fromCharCode(65 + i)}</span>
                    <Markdown source={o.text || '…'} className="flex-1" />
                    {f.correctIds.includes(o.id) && <Check className="h-4 w-4 text-success" aria-label="Correct answer" />}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <AnimatePresence initial={false}>
          {confirmClose && (
            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden border-t border-warning/40 bg-warning/10" role="alertdialog" aria-label="Discard changes">
              <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
                <p className="text-sm font-medium text-amber-800">Discard your unsaved changes?</p>
                <div className="flex gap-2">
                  <button type="button" data-autofocus onClick={() => setConfirmClose(false)} className={btnGhost}>Keep editing</button>
                  <button type="button" onClick={onClose} className="rounded-xl bg-danger px-4 py-2.5 text-sm font-semibold text-white outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2">Discard</button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <footer className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
          <p className={cx('flex items-center gap-1.5 text-xs font-medium', issueCount === 0 ? 'text-success' : submitted ? 'text-danger' : 'text-muted')} aria-live="polite">
            {issueCount === 0 ? <><Check className="h-4 w-4" aria-hidden="true" /> Ready to save</> : <><AlertCircle className="h-4 w-4" aria-hidden="true" /> {issueCount} issue{issueCount > 1 ? 's' : ''} to fix</>}
          </p>
          <div className="flex gap-3">
            <button type="button" onClick={requestClose} disabled={saving} className={btnGhost}>Cancel</button>
            <button type="button" onClick={() => void save()} disabled={saving} className={btnPrimary}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} {question ? 'Save changes' : 'Add question'}
            </button>
          </div>
        </footer>
      </motion.aside>
    </div>
  )
}

export function QuestionEditor({ open, question, tagSuggestions, onSave, onClose }: PanelProps & { open: boolean }) {
  return (
    <AnimatePresence>
      {open && <EditorPanel key={question?.id ?? 'new'} question={question} tagSuggestions={tagSuggestions} onSave={onSave} onClose={onClose} />}
    </AnimatePresence>
  )
}
