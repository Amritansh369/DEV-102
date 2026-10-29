'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDown, ArrowLeft, ArrowUp, Check, ChevronDown, Copy, Download, FileQuestion, GripVertical, Pencil, Plus, Search, SearchX, Trash2, Upload, X } from 'lucide-react'
import { ConfirmDialog, Modal } from '@/components/admin/Dialogs'
import { btnCta, btnGhost, btnPrimary, cardCls } from '@/components/admin/FormControls'
import { IMPORT_COLUMNS, ImportDropzone, toCsv } from '@/components/admin/ImportDropzone'
import { QuestionEditor } from '@/components/admin/QuestionEditor'
import { EmptyState, ErrorState, Skeleton } from '@/components/admin/States'
import { getExam } from '@/lib/api'
import { cx, useAsyncData } from '@/lib/adminHooks'
import { toast } from '@/lib/adminStore'
import { deleteQuestions, duplicateQuestion, importQuestions, listQuestions, reorderQuestions, saveQuestion, type QuestionDraft } from '@/lib/api'
import type { Exam, Question } from '@/lib/types'

type Diff = Question['difficulty']
const DIFFS: Diff[] = ['EASY', 'MEDIUM', 'HARD']
const DIFF_STYLE: Record<Diff, string> = { EASY: 'bg-success/10 text-success', MEDIUM: 'bg-warning/15 text-amber-800', HARD: 'bg-danger/10 text-danger' }
const DIFF_BAR: Record<Diff, string> = { EASY: 'bg-success', MEDIUM: 'bg-warning', HARD: 'bg-danger' }
const plain = (s: string) => s.replace(/```[\s\S]*?```/g, '[code]').replace(/[*`#>_]/g, '').replace(/\s+/g, ' ').trim()
const fmtMarks = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ''))

interface PageData { exam: Exam; questions: Question[] }

function exportCsv(exam: Exam, list: Question[]) {
  const letter = (q: Question, id: string) => 'ABCDEF'[q.options.findIndex((o) => o.id === id)] ?? ''
  const table = [
    [...IMPORT_COLUMNS],
    ...list.map((q) => [
      q.text, ...[0, 1, 2, 3, 4, 5].map((i) => q.options[i]?.text ?? ''),
      q.type === 'NUMERIC' && q.answerKey ? String(q.answerKey.value) : q.correctIds.map((c) => letter(q, c)).join(';'),
      String(q.marks), q.difficulty, q.tags.join(';'), q.type === 'NUMERIC' && q.answerKey ? String(q.answerKey.tolerance) : '',
    ]),
  ]
  const url = URL.createObjectURL(new Blob([toCsv(table)], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${exam.code}-questions.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function QuestionsView() {
  const { id } = useParams<{ id: string }>()
  const search = useSearchParams()
  const loader = useCallback(async (): Promise<PageData> => {
    const [exam, questions] = await Promise.all([getExam(id), listQuestions(id)])
    return { exam, questions }
  }, [id])
  const { data, setData, error, loading, reload } = useAsyncData(loader)
  const questions = useMemo(() => data?.questions ?? [], [data])
  const setQuestions = (fn: (prev: Question[]) => Question[]) => setData((d) => (d ? { ...d, questions: fn(d.questions) } : d))

  const [query, setQuery] = useState('')
  const [diff, setDiff] = useState<'ALL' | Diff>('ALL')
  const [tag, setTag] = useState('ALL')
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [editor, setEditor] = useState<{ open: boolean; question: Question | null }>({ open: false, question: null })
  const [importOpen, setImportOpen] = useState(search.get('import') === '1')
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [announce, setAnnounce] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
      if (e.key === 'n' && !typing && !e.metaKey && !e.ctrlKey && !editor.open && !importOpen) { e.preventDefault(); setEditor({ open: true, question: null }) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editor.open, importOpen])

  const stats = useMemo(() => {
    const byDiff: Record<Diff, number> = { EASY: 0, MEDIUM: 0, HARD: 0 }
    const tags = new Map<string, number>()
    let marks = 0
    let multi = 0
    for (const q of questions) {
      byDiff[q.difficulty]++
      marks += q.marks
      if (q.multi) multi++
      q.tags.forEach((t) => tags.set(t, (tags.get(t) ?? 0) + 1))
    }
    return { byDiff, marks, multi, tags: Array.from(tags.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) }
  }, [questions])

  const filtersActive = query.trim() !== '' || diff !== 'ALL' || tag !== 'ALL'
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return questions.filter((x) =>
      (diff === 'ALL' || x.difficulty === diff) && (tag === 'ALL' || x.tags.includes(tag)) &&
      (!q || x.text.toLowerCase().includes(q) || x.tags.some((t) => t.includes(q)) || x.options.some((o) => o.text.toLowerCase().includes(q))))
  }, [questions, query, diff, tag])
  const position = useMemo(() => new Map(questions.map((q, i) => [q.id, i + 1])), [questions])
  const allVisibleSelected = visible.length > 0 && visible.every((q) => selected.has(q.id))

  const persistOrder = async (next: Question[], message: string) => {
    const prev = questions
    setQuestions(() => next)
    setAnnounce(message)
    try {
      await reorderQuestions(id, next.map((q) => q.id))
    } catch (e) {
      setQuestions(() => prev)
      toast.error('Could not save the new order', e instanceof Error ? e.message : 'Please try again.')
    }
  }
  const moveTo = (from: number, to: number, label: string) => {
    if (from === to || to < 0 || to >= questions.length) return
    const copy = [...questions]
    const [item] = copy.splice(from, 1)
    copy.splice(to, 0, item)
    void persistOrder(copy, `${label} moved to position ${to + 1}`)
  }

  const handleSave = async (draft: QuestionDraft, qid?: string) => {
    const saved = await saveQuestion(id, draft, qid)
    setQuestions((prev) => (qid ? prev.map((q) => (q.id === qid ? saved : q)) : [...prev, saved]))
    toast.success(qid ? 'Question updated' : 'Question added')
    setEditor({ open: false, question: null })
  }
  const handleImport = async (rows: QuestionDraft[]) => {
    const added = await importQuestions(id, rows)
    setQuestions((prev) => [...prev, ...added])
  }
  const handleDuplicate = async (q: Question) => {
    try {
      const copy = await duplicateQuestion(id, q.id)
      setQuestions((prev) => { const at = prev.findIndex((x) => x.id === q.id); return [...prev.slice(0, at + 1), copy, ...prev.slice(at + 1)] })
      toast.success('Question duplicated')
    } catch (e) {
      toast.error('Could not duplicate', e instanceof Error ? e.message : 'Please try again.')
    }
  }
  const confirmDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await deleteQuestions(id, pendingDelete)
      setQuestions((prev) => prev.filter((q) => !pendingDelete.includes(q.id)))
      setSelected((s) => new Set(Array.from(s).filter((x) => !pendingDelete.includes(x))))
      toast.success(pendingDelete.length === 1 ? 'Question deleted' : `${pendingDelete.length} questions deleted`)
      setPendingDelete(null)
    } catch (e) {
      toast.error('Could not delete', e instanceof Error ? e.message : 'Please try again.')
    } finally {
      setDeleting(false)
    }
  }
  const toggle = (set: ReadonlySet<string>, key: string): ReadonlySet<string> => { const n = new Set(set); if (n.has(key)) n.delete(key); else n.add(key); return n }

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <Link href={`/organization/exams/${id}`} className="mb-2 inline-flex items-center gap-1.5 rounded text-sm font-medium text-muted outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-accent"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to exam</Link>
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-text sm:text-3xl">Questions</h1>
        <p className="mt-1 text-sm text-muted">{data ? `${data.exam.title} · ${data.exam.code}` : 'Loading exam…'}</p>
      </div>
      {data && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => exportCsv(data.exam, questions)} disabled={questions.length === 0} className={btnGhost}><Download className="h-4 w-4" aria-hidden="true" /> Export CSV</button>
          <button type="button" onClick={() => setImportOpen(true)} className={btnGhost}><Upload className="h-4 w-4" aria-hidden="true" /> Import</button>
          <button type="button" onClick={() => setEditor({ open: true, question: null })} className={btnCta}><Plus className="h-4 w-4" aria-hidden="true" /> Add question <kbd className="hidden rounded bg-black/10 px-1.5 font-mono text-[10px] sm:inline">N</kbd></button>
        </div>
      )}
    </div>
  )

  if (error && !loading) return <div className="space-y-6">{header}<ErrorState title="Couldn't load questions" message={error} onRetry={reload} /></div>
  if (loading || !data) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading questions">
        {header}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
        <div className="space-y-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
      </div>
    )
  }

  const { exam } = data
  const remaining = exam.questionCount - questions.length
  const marksDiff = stats.marks - exam.totalMarks
  const total = Math.max(1, questions.length)

  return (
    <div className="space-y-6">
      {header}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className={cx(cardCls, 'p-5')}>
          <p className="text-sm text-muted">Questions</p>
          <p className="mt-1 font-heading text-3xl font-semibold tabular-nums text-text">{questions.length}<span className="text-base font-medium text-muted"> / {exam.questionCount}</span></p>
          <p className={cx('mt-2 text-xs font-medium', remaining === 0 ? 'text-success' : remaining > 0 ? 'text-amber-700' : 'text-danger')}>{remaining === 0 ? 'Matches the exam setup' : remaining > 0 ? `${remaining} more to add` : `${-remaining} more than planned`}</p>
        </div>
        <div className={cx(cardCls, 'p-5')}>
          <p className="text-sm text-muted">Total marks</p>
          <p className="mt-1 font-heading text-3xl font-semibold tabular-nums text-text">{fmtMarks(stats.marks)}<span className="text-base font-medium text-muted"> / {exam.totalMarks}</span></p>
          <p className={cx('mt-2 text-xs font-medium', marksDiff === 0 ? 'text-success' : 'text-amber-700')}>{marksDiff === 0 ? 'Matches the exam total' : `${marksDiff > 0 ? '+' : ''}${fmtMarks(marksDiff)} versus the exam total`}</p>
        </div>
        <div className={cx(cardCls, 'p-5')}>
          <p className="text-sm text-muted">Difficulty mix</p>
          <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`Easy ${stats.byDiff.EASY}, medium ${stats.byDiff.MEDIUM}, hard ${stats.byDiff.HARD}`}>
            {DIFFS.map((d) => <div key={d} className={DIFF_BAR[d]} style={{ width: `${(stats.byDiff[d] / total) * 100}%` }} />)}
          </div>
          <ul className="mt-3 flex gap-4 text-xs text-muted">{DIFFS.map((d) => <li key={d} className="flex items-center gap-1.5"><span className={cx('h-2 w-2 rounded-full', DIFF_BAR[d])} aria-hidden="true" />{d[0] + d.slice(1).toLowerCase()} {stats.byDiff[d]}</li>)}</ul>
        </div>
        <div className={cx(cardCls, 'p-5')}>
          <p className="text-sm text-muted">Multiple-answer questions</p>
          <p className="mt-1 font-heading text-3xl font-semibold tabular-nums text-text">{stats.multi}</p>
          <p className="mt-2 text-xs text-muted">{stats.tags.length} tags · top: {stats.tags[0] ? `${stats.tags[0][0]} (${stats.tags[0][1]})` : 'none yet'}</p>
        </div>
      </div>

      <div className={cardCls}>
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1 lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search questions" placeholder="Search question text, options or tags" className="h-10 w-full rounded-xl border border-border bg-soft pl-10 pr-9 text-sm outline-none transition placeholder:text-muted focus:border-accent focus:bg-surface focus:ring-2 focus:ring-accent/30" />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-muted hover:bg-slate-200"><X className="h-3.5 w-3.5" aria-hidden="true" /></button>}
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by difficulty">
            {(['ALL', ...DIFFS] as const).map((d) => (
              <button key={d} type="button" aria-pressed={diff === d} onClick={() => setDiff(d)} className={cx('rounded-full border px-3.5 py-1.5 text-xs font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-accent', diff === d ? 'border-primary bg-primary text-white' : 'border-border text-slate-600 hover:bg-soft')}>
                {d === 'ALL' ? 'All' : d[0] + d.slice(1).toLowerCase()} <span className="font-normal">{d === 'ALL' ? questions.length : stats.byDiff[d]}</span>
              </button>
            ))}
          </div>
          <select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Filter by tag" className="h-10 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30">
            <option value="ALL">All tags</option>
            {stats.tags.map(([t, n]) => <option key={t} value={t}>{t} ({n})</option>)}
          </select>
        </div>

        <AnimatePresence initial={false}>
          {selected.size > 0 && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-b border-border bg-accent/5">
              <div className="flex flex-wrap items-center gap-3 px-4 py-2.5" role="region" aria-label="Bulk actions">
                <p className="text-sm font-semibold text-primary" aria-live="polite">{selected.size} selected</p>
                <div className="ml-auto flex gap-2">
                  <button type="button" onClick={() => setPendingDelete(Array.from(selected))} className="inline-flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-1"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete</button>
                  <button type="button" onClick={() => setSelected(new Set())} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 outline-none hover:bg-soft focus-visible:ring-2 focus-visible:ring-accent">Clear</button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {questions.length === 0 ? (
          <EmptyState icon={FileQuestion} title="No questions yet" message="Write questions one by one, or import a CSV or Excel file with the whole paper." action={<div className="flex flex-wrap justify-center gap-3"><button type="button" onClick={() => setEditor({ open: true, question: null })} className={btnPrimary}><Plus className="h-4 w-4" aria-hidden="true" /> Add question</button><button type="button" onClick={() => setImportOpen(true)} className={btnGhost}><Upload className="h-4 w-4" aria-hidden="true" /> Import file</button></div>} />
        ) : visible.length === 0 ? (
          <EmptyState icon={SearchX} title="No questions match" message="Try another keyword, difficulty or tag." action={<button type="button" onClick={() => { setQuery(''); setDiff('ALL'); setTag('ALL') }} className={btnGhost}>Clear filters</button>} />
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-xs text-muted">
              <input type="checkbox" checked={allVisibleSelected} onChange={() => setSelected((s) => { const n = new Set(s); visible.forEach((q) => (allVisibleSelected ? n.delete(q.id) : n.add(q.id))); return n })} aria-label="Select all visible questions" className="h-4 w-4 cursor-pointer rounded accent-primary" />
              <span>{filtersActive ? `${visible.length} of ${questions.length} questions` : `${questions.length} questions · drag the handle or use the arrows to reorder`}</span>
              {filtersActive && <span className="ml-auto">Clear filters to reorder</span>}
            </div>
            <ul aria-label="Questions">
              {visible.map((q) => {
                const idx = position.get(q.id) ?? 0
                const open = expanded.has(q.id)
                return (
                  <li
                    key={q.id}
                    draggable={!filtersActive}
                    onDragStart={(e) => { setDragId(q.id); e.dataTransfer.effectAllowed = 'move' }}
                    onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverId(q.id) } }}
                    onDrop={(e) => { e.preventDefault(); if (dragId && dragId !== q.id) moveTo(questions.findIndex((x) => x.id === dragId), idx - 1, `Question ${position.get(dragId)}`); setDragId(null); setOverId(null) }}
                    onDragEnd={() => { setDragId(null); setOverId(null) }}
                    className={cx('group border-t border-border first:border-t-0', dragId === q.id && 'opacity-40', overId === q.id && dragId !== q.id && 'bg-accent/5 ring-1 ring-inset ring-accent/40')}
                  >
                    <div className="flex items-start gap-3 px-4 py-3.5">
                      <input type="checkbox" checked={selected.has(q.id)} onChange={() => setSelected((s) => toggle(s, q.id))} aria-label={`Select question ${idx}`} className="mt-1.5 h-4 w-4 cursor-pointer rounded accent-primary" />
                      <span className={cx('mt-0.5 flex shrink-0 items-center', filtersActive && 'invisible')}>
                        <GripVertical className="h-5 w-5 cursor-grab text-slate-300 group-hover:text-slate-500" aria-hidden="true" />
                      </span>
                      <span className="mt-0.5 w-7 shrink-0 text-sm font-semibold tabular-nums text-muted">{idx}.</span>
                      <div className="min-w-0 flex-1">
                        <button type="button" onClick={() => setExpanded((s) => toggle(s, q.id))} aria-expanded={open} className="flex w-full items-start gap-2 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-accent">
                          <span className={cx('text-sm font-medium text-text', !open && 'line-clamp-2')}>{plain(q.text)}</span>
                          <ChevronDown className={cx('mt-0.5 h-4 w-4 shrink-0 text-muted transition-transform', open && 'rotate-180')} aria-hidden="true" />
                        </button>
                        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          <span className={cx('rounded-full px-2 py-0.5 font-semibold', DIFF_STYLE[q.difficulty])}>{q.difficulty[0] + q.difficulty.slice(1).toLowerCase()}</span>
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">{fmtMarks(q.marks)} mark{q.marks === 1 ? '' : 's'}</span>
                          {q.multi && <span className="rounded-full bg-accent/10 px-2 py-0.5 font-semibold text-primary-600">Multiple answers</span>}
                          {q.type === 'NUMERIC' && <span className="rounded-full bg-accent/10 px-2 py-0.5 font-semibold text-primary-600">Numeric</span>}
                          {q.tags.map((t) => <button key={t} type="button" onClick={() => setTag(t)} className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 outline-none hover:bg-slate-200 focus-visible:ring-2 focus-visible:ring-accent">{t}</button>)}
                        </p>
                        {open && q.type === 'NUMERIC' && q.answerKey && (
                          <p className="mt-3 inline-flex items-center gap-2 rounded-lg border border-success/40 bg-success/5 px-3 py-2 font-mono text-sm text-text">
                            Answer: {q.answerKey.value}{q.answerKey.tolerance > 0 ? ` ± ${q.answerKey.tolerance}` : ''}{q.answerKey.unit ? ` ${q.answerKey.unit}` : ''}
                          </p>
                        )}
                        {open && q.type !== 'NUMERIC' && (
                          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                            {q.options.map((o, i) => {
                              const ok = q.correctIds.includes(o.id)
                              return <li key={o.id} className={cx('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm', ok ? 'border-success/40 bg-success/5 text-text' : 'border-border text-slate-600')}><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-soft text-[11px] font-bold">{String.fromCharCode(65 + i)}</span><span className="flex-1">{o.text}</span>{ok && <Check className="h-4 w-4 text-success" aria-label="Correct answer" />}</li>
                            })}
                          </ul>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        {!filtersActive && (
                          <>
                            <button type="button" onClick={() => moveTo(idx - 1, idx - 2, `Question ${idx}`)} disabled={idx === 1} aria-label={`Move question ${idx} up`} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 outline-none hover:bg-soft focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-30"><ArrowUp className="h-4 w-4" aria-hidden="true" /></button>
                            <button type="button" onClick={() => moveTo(idx - 1, idx, `Question ${idx}`)} disabled={idx === questions.length} aria-label={`Move question ${idx} down`} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 outline-none hover:bg-soft focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-30"><ArrowDown className="h-4 w-4" aria-hidden="true" /></button>
                          </>
                        )}
                        <button type="button" onClick={() => setEditor({ open: true, question: q })} aria-label={`Edit question ${idx}`} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 outline-none hover:bg-soft hover:text-primary focus-visible:ring-2 focus-visible:ring-accent"><Pencil className="h-4 w-4" aria-hidden="true" /></button>
                        <button type="button" onClick={() => void handleDuplicate(q)} aria-label={`Duplicate question ${idx}`} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 outline-none hover:bg-soft hover:text-primary focus-visible:ring-2 focus-visible:ring-accent"><Copy className="h-4 w-4" aria-hidden="true" /></button>
                        <button type="button" onClick={() => setPendingDelete([q.id])} aria-label={`Delete question ${idx}`} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 outline-none hover:bg-danger/10 hover:text-danger focus-visible:ring-2 focus-visible:ring-accent"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>

      <p className="sr-only" role="status" aria-live="polite">{announce}</p>

      <QuestionEditor open={editor.open} question={editor.question} tagSuggestions={stats.tags.map(([t]) => t)} onSave={handleSave} onClose={() => setEditor({ open: false, question: null })} />

      <Modal open={importOpen} onClose={() => setImportOpen(false)} size="xl" title="Import questions" description="Upload a CSV or Excel file. You can fix problems in the preview before importing.">
        <ImportDropzone existingTexts={questions.map((q) => q.text)} onImport={handleImport} onDone={() => setImportOpen(false)} />
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete && pendingDelete.length > 1 ? `Delete ${pendingDelete.length} questions?` : 'Delete this question?'}
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      >
        <p>The question{pendingDelete && pendingDelete.length > 1 ? 's are' : ' is'} removed from the exam and the numbering updates automatically. This cannot be undone.</p>
      </ConfirmDialog>
    </div>
  )
}

export default function ExamQuestionsPage() {
  return (
    <Suspense fallback={<div className="space-y-4" aria-busy="true"><Skeleton className="h-9 w-56" /><Skeleton className="h-[480px] rounded-2xl" /></div>}>
      <QuestionsView />
    </Suspense>
  )
}
