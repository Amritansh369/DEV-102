import { useMemo, useState } from 'react'
import { Flag } from 'lucide-react'

export interface PaletteItem {
  id: string
  number: number
  section: string
  answered: boolean
  flagged: boolean
}

interface QuestionPaletteProps {
  items: PaletteItem[]
  currentId: string
  onSelect: (id: string) => void
}

type StatusFilter = 'all' | 'unanswered' | 'flagged'

function cellClass(item: PaletteItem, current: boolean): string {
  const base = 'relative flex h-10 items-center justify-center rounded-lg border text-sm font-medium tabular-nums transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
  const tone = item.flagged
    ? 'border-amber-300 bg-amber-50 text-amber-800'
    : item.answered
      ? 'border-green-300 bg-green-50 text-success'
      : 'border-border bg-white text-muted hover:border-accent hover:text-primary'
  return `${base} ${tone} ${current ? 'ring-2 ring-accent ring-offset-1 font-semibold' : ''}`
}

export default function QuestionPalette({ items, currentId, onSelect }: QuestionPaletteProps) {
  const [section, setSection] = useState('ALL')
  const [status, setStatus] = useState<StatusFilter>('all')

  const sections = useMemo(() => {
    const map = new Map<string, { total: number; done: number }>()
    items.forEach((i) => {
      const entry = map.get(i.section) ?? { total: 0, done: 0 }
      entry.total += 1
      if (i.answered) entry.done += 1
      map.set(i.section, entry)
    })
    return [...map.entries()]
  }, [items])

  const answered = items.filter((i) => i.answered).length
  const flagged = items.filter((i) => i.flagged).length
  const visible = items.filter(
    (i) => (section === 'ALL' || i.section === section) && (status === 'all' || (status === 'unanswered' ? !i.answered : i.flagged)),
  )

  const chip = (active: boolean) =>
    `rounded-full border px-2.5 py-1 text-[11px] font-medium transition focus-visible:outline-2 focus-visible:outline-accent ${active ? 'border-primary bg-primary text-white' : 'border-border bg-white text-muted hover:border-accent'}`

  return (
    <section className="rounded-2xl border border-border bg-white p-4 shadow-sm" aria-label="Question palette">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-sm font-semibold text-ink">Question palette</h2>
        <span className="text-xs text-muted tabular-nums">{answered}/{items.length} answered</span>
      </div>

      {sections.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by section">
          <button type="button" aria-pressed={section === 'ALL'} onClick={() => setSection('ALL')} className={chip(section === 'ALL')}>All ({items.length})</button>
          {sections.map(([name, s]) => (
            <button key={name} type="button" aria-pressed={section === name} onClick={() => setSection(name)} className={chip(section === name)}>
              {name} {s.done}/{s.total}
            </button>
          ))}
        </div>
      )}

      <div className="mt-2 flex gap-1.5" role="group" aria-label="Filter by status">
        {(['all', 'unanswered', 'flagged'] as const).map((f) => (
          <button key={f} type="button" aria-pressed={status === f} onClick={() => setStatus(f)} className={chip(status === f)}>
            {f === 'all' ? 'Any status' : f === 'unanswered' ? 'Unanswered' : 'Marked'}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="mt-4 rounded-xl bg-soft px-3 py-6 text-center text-xs text-muted">
          No questions match this filter.
          <button type="button" onClick={() => { setSection('ALL'); setStatus('all') }} className="ml-1 font-medium text-accent underline">Reset</button>
        </div>
      ) : (
        <div className="mt-4 grid max-h-64 grid-cols-5 gap-2 overflow-y-auto p-1">
          {visible.map((item) => {
            const state = `${item.answered ? 'answered' : 'not answered'}${item.flagged ? ', marked for review' : ''}`
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={item.id === currentId ? 'true' : undefined}
                aria-label={`Question ${item.number}, ${state}`}
                className={cellClass(item, item.id === currentId)}
              >
                {item.number}
                {item.flagged && <Flag className="absolute -right-1 -top-1 h-3 w-3 fill-amber-400 text-amber-500" aria-hidden />}
                {item.flagged && item.answered && <span className="absolute bottom-0.5 right-1 h-1.5 w-1.5 rounded-full bg-success" aria-hidden />}
              </button>
            )
          })}
        </div>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] text-muted">
        <div className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-green-300 bg-green-50" /> Answered {answered}</div>
        <div className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-border bg-white" /> Unanswered {items.length - answered}</div>
        <div className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-amber-300 bg-amber-50" /> Marked {flagged}</div>
        <div className="flex items-center gap-1.5"><span className="h-3 w-3 rounded ring-2 ring-accent" /> Current</div>
      </dl>
    </section>
  )
}
