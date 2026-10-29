'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft, CheckCircle2, Circle, Loader2, MinusCircle, RefreshCw, XCircle, type LucideIcon } from 'lucide-react'
import { ApiError, getCandidateResults, type CandidateResults, type ReviewItem } from '@/lib/api'
import { useRequireRole } from '@/lib/session'

const STATUS: Record<ReviewItem['status'], { label: string; icon: LucideIcon; cls: string }> = {
  CORRECT: { label: 'Correct', icon: CheckCircle2, cls: 'bg-success/10 text-success' },
  WRONG: { label: 'Wrong', icon: XCircle, cls: 'bg-danger/10 text-danger' },
  UNANSWERED: { label: 'Not answered', icon: MinusCircle, cls: 'bg-soft text-muted' },
}

type Filter = 'ALL' | ReviewItem['status']
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'ALL', label: 'All' }, { id: 'WRONG', label: 'Wrong' }, { id: 'UNANSWERED', label: 'Not answered' }, { id: 'CORRECT', label: 'Correct' },
]

const signed = (n: number) => (n > 0 ? `+${n}` : String(n))

function Question({ q }: { q: ReviewItem }) {
  const s = STATUS[q.status]
  return (
    <li className="rounded-2xl border border-border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 flex-1 font-medium text-ink"><span className="mr-2 font-mono text-sm text-muted">Q{q.position}</span>{q.text}</p>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${s.cls}`}><s.icon className="h-3.5 w-3.5" aria-hidden /> {s.label}</span>
          <span className="font-mono text-sm tabular-nums text-muted" title={`Worth ${q.marks} marks`}>{signed(q.earned)} / {q.marks}</span>
        </div>
      </div>
      {q.numeric && (
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div className={`rounded-xl border px-3 py-2 ${q.status === 'CORRECT' ? 'border-success/40 bg-success/5' : q.status === 'WRONG' ? 'border-danger/40 bg-danger/5' : 'border-border'}`}>
            <dt className="text-xs text-muted">Your answer</dt>
            <dd className="font-mono font-semibold text-ink">{q.numeric.given ?? 'Not answered'}{q.numeric.given !== null && q.numeric.unit ? ` ${q.numeric.unit}` : ''}</dd>
          </div>
          <div className="rounded-xl border border-success/40 bg-success/5 px-3 py-2">
            <dt className="text-xs text-muted">Correct answer</dt>
            <dd className="font-mono font-semibold text-success">{q.numeric.value}{q.numeric.tolerance > 0 ? ` ± ${q.numeric.tolerance}` : ''}{q.numeric.unit ? ` ${q.numeric.unit}` : ''}</dd>
          </div>
        </dl>
      )}
      {q.options.length > 0 && (
      <ul className="mt-4 space-y-2">
        {q.options.map((o) => (
          <li
            key={o.id}
            className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm ${o.correct ? 'border-success/40 bg-success/5' : o.picked ? 'border-danger/40 bg-danger/5' : 'border-border'}`}
          >
            {o.correct ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden /> : o.picked ? <XCircle className="h-4 w-4 shrink-0 text-danger" aria-hidden /> : <Circle className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />}
            <span className="min-w-0 flex-1">{o.text}</span>
            {o.picked && <span className="text-xs font-semibold text-ink">Your answer</span>}
            {o.correct && <span className="text-xs font-semibold text-success">Correct answer</span>}
          </li>
        ))}
      </ul>
      )}
    </li>
  )
}

export default function ResultsPage() {
  useRequireRole(['CANDIDATE'])
  const [data, setData] = useState<CandidateResults | null>(null)
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null)
  const [filter, setFilter] = useState<Filter>('ALL')

  const load = useCallback(async () => {
    setError(null)
    try {
      setData(await getCandidateResults())
    } catch (e) {
      // 403 means "not released yet": the server says why, and retrying will not help until that changes.
      setError(e instanceof ApiError ? { message: e.message, retryable: e.retryable } : { message: 'Could not load your results.', retryable: true })
    }
  }, [])

  useEffect(() => void load(), [load])

  if (error) {
    return (
      <main className="mx-auto grid min-h-[60vh] max-w-lg place-items-center px-6 text-center">
        <div>
          <AlertTriangle className="mx-auto h-10 w-10 text-warning" aria-hidden />
          <h1 className="mt-3 font-heading text-xl font-semibold">Your answer review is not available yet</h1>
          <p className="mt-1 text-sm text-muted">{error.message}</p>
          <div className="mt-5 flex justify-center gap-3">
            <Link href="/lobby" className="inline-flex items-center gap-2 rounded-xl border border-border px-5 py-2.5 text-sm font-semibold text-ink"><ArrowLeft className="h-4 w-4" aria-hidden /> Back to lobby</Link>
            {error.retryable && (
              <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white"><RefreshCw className="h-4 w-4" aria-hidden /> Try again</button>
            )}
          </div>
        </div>
      </main>
    )
  }

  if (!data) {
    return (
      <main className="grid min-h-[60vh] place-items-center" aria-busy="true">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading your results" />
      </main>
    )
  }

  const { summary } = data
  const shown = filter === 'ALL' ? data.questions : data.questions.filter((q) => q.status === filter)
  const count = (f: Filter) => (f === 'ALL' ? data.questions.length : data.questions.filter((q) => q.status === f).length)

  return (
    <main className="bg-soft pb-16">
      <section className="bg-[radial-gradient(120%_120%_at_0%_0%,#1d4ed8_0%,#0b2a6f_45%,#071634_100%)] text-white">
        <div className="mx-auto max-w-4xl px-6 py-10">
          <Link href="/lobby" className="inline-flex items-center gap-1.5 text-sm text-white/75 hover:text-white"><ArrowLeft className="h-4 w-4" aria-hidden /> Back to lobby</Link>
          <p className="mt-6 text-sm text-white/70">Answer review · <span className="font-mono">{data.exam.code}</span></p>
          <h1 className="mt-1 font-heading text-3xl font-bold leading-tight">{data.exam.title}</h1>
          <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-3">
            <p className="font-heading text-4xl font-bold tabular-nums">{summary.score}<span className="text-xl font-semibold text-white/70"> / {summary.totalMarks}</span></p>
            <p className="text-lg font-semibold tabular-nums">{summary.percent}%</p>
            <p className="text-sm text-white/75">{summary.correct} correct · {summary.wrong} wrong · {summary.unanswered} not answered</p>
          </div>
          {summary.negativeMarking.enabled && (
            <p className="mt-2 text-sm text-white/70">Negative marking: each wrong answer loses {summary.negativeMarking.value} of that question&apos;s marks.</p>
          )}
          {data.receiptId && <p className="mt-2 font-mono text-xs text-white/60">Reference {data.receiptId}</p>}
        </div>
      </section>

      <div className="mx-auto max-w-4xl space-y-5 px-6 pt-8">
        <div role="tablist" aria-label="Filter questions" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${filter === f.id ? 'bg-primary text-white' : 'bg-white text-ink ring-1 ring-border hover:bg-primary-50'}`}
            >
              {f.label} <span className="tabular-nums opacity-70">{count(f.id)}</span>
            </button>
          ))}
        </div>
        {shown.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-white p-8 text-center text-sm text-muted">No questions in this group.</p>
        ) : (
          <ol className="space-y-4">{shown.map((q) => <Question key={q.questionId} q={q} />)}</ol>
        )}
      </div>
    </main>
  )
}
