'use client'

import { Suspense, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, ClipboardList, Copy, Download, ExternalLink, Loader2, Plus, Search, SearchX, Trash2, X } from 'lucide-react'
import { ExamStatusBadge } from '@/components/admin/ExamStatusBadge'
import { EmptyState, ErrorState, Skeleton } from '@/components/admin/States'
import { deleteExam, deleteExams, duplicateExam, listExams } from '@/lib/api'
import { cx, formatDate, formatTime, useAsyncData } from '@/lib/adminHooks'
import { toast } from '@/lib/adminStore'
import type { Exam } from '@/lib/types'

type SortKey = 'title' | 'status' | 'startsAt' | 'questionCount' | 'candidateCount'
type SortDir = 'asc' | 'desc'
type StatusFilter = 'ALL' | Exam['status']

const STATUS_ORDER: Record<Exam['status'], number> = { LIVE: 0, SCHEDULED: 1, DRAFT: 2, COMPLETED: 3 }
const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'LIVE', label: 'Live' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'COMPLETED', label: 'Completed' },
]
const PAGE_SIZES = [10, 25, 50]

function parseStatus(v: string | null): StatusFilter {
  return v === 'LIVE' || v === 'SCHEDULED' || v === 'DRAFT' || v === 'COMPLETED' ? v : 'ALL'
}

function pageWindow(current: number, total: number): Array<number | '…'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const out: Array<number | '…'> = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  if (start > 2) out.push('…')
  for (let i = start; i <= end; i++) out.push(i)
  if (end < total - 1) out.push('…')
  out.push(total)
  return out
}

function exportCsv(rows: Exam[]): void {
  const head = ['Code', 'Title', 'Status', 'Starts at', 'Ends at', 'Duration (min)', 'Questions', 'Total marks', 'Candidates']
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const lines = [
    head.map(esc).join(','),
    ...rows.map((e) => [e.code, e.title, e.status, e.startsAt, e.endsAt, e.durationMin, e.questionCount, e.totalMarks, e.candidateCount].map(esc).join(',')),
  ]
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `dev102-exams-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/* ------------------------------ Confirm dialog ---------------------------- */

function ConfirmDialog({ open, title, confirmLabel, busy, onConfirm, onCancel, children }: {
  open: boolean; title: string; confirmLabel: string; busy: boolean; onConfirm: () => void; onCancel: () => void; children: ReactNode
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    cancelRef.current?.focus()
    return () => previous?.focus()
  }, [open])

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && !busy) {
      e.stopPropagation()
      onCancel()
    }
    if (e.key === 'Tab') {
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])')
      if (!focusable || focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] grid place-items-center p-4" onKeyDown={onKeyDown}>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !busy && onCancel()} className="absolute inset-0 bg-slate-900/45" aria-hidden="true" />
          <motion.div
            ref={dialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-body"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.16 }}
            className="relative w-full max-w-md rounded-2xl bg-surface p-6 shadow-[0_24px_64px_-16px_rgba(15,23,42,0.45)]"
          >
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-danger/10 text-danger"><AlertTriangle className="h-5 w-5" aria-hidden="true" /></span>
              <div>
                <h2 id="confirm-title" className="font-heading text-lg font-semibold text-text">{title}</h2>
                <div id="confirm-body" className="mt-1.5 space-y-1.5 text-sm text-muted">{children}</div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button ref={cancelRef} type="button" onClick={onCancel} disabled={busy} className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-slate-700 outline-none transition hover:bg-soft focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60">Cancel</button>
              <button type="button" onClick={onConfirm} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-danger px-4 py-2.5 text-sm font-semibold text-white outline-none transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 disabled:opacity-70">
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} {confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

/* ---------------------------------- Page ---------------------------------- */

interface PendingDelete { ids: string[]; skippedLive: number; label: string }

function ExamsView() {
  const params = useSearchParams()
  const { data, setData, error, loading, reload } = useAsyncData(listExams)
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [status, setStatus] = useState<StatusFilter>(parseStatus(params.get('status')))
  const [sortKey, setSortKey] = useState<SortKey>('status')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState<PendingDelete | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const headerCheckRef = useRef<HTMLInputElement>(null)

  // Follow links such as /admin/exams?status=SCHEDULED or ?q=jee from the dashboard and global search.
  useEffect(() => {
    setQuery(params.get('q') ?? '')
    setStatus(parseStatus(params.get('status')))
    setPage(1)
  }, [params])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
      if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { ALL: 0, LIVE: 0, SCHEDULED: 0, DRAFT: 0, COMPLETED: 0 }
    for (const e of data ?? []) { c.ALL++; c[e.status]++ }
    return c
  }, [data])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const dir = sortDir === 'asc' ? 1 : -1
    return (data ?? [])
      .filter((e) => (status === 'ALL' || e.status === status) && (!q || e.title.toLowerCase().includes(q) || e.code.toLowerCase().includes(q)))
      .sort((a, b) => {
        let r = 0
        switch (sortKey) {
          case 'title': r = a.title.localeCompare(b.title); break
          case 'status': r = STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || Date.parse(b.startsAt) - Date.parse(a.startsAt); break
          case 'startsAt': r = Date.parse(a.startsAt) - Date.parse(b.startsAt); break
          case 'questionCount': r = a.questionCount - b.questionCount; break
          case 'candidateCount': r = a.candidateCount - b.candidateCount; break
        }
        return r * dir
      })
  }, [data, query, status, sortKey, sortDir])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, pageCount)
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)
  const rangeStart = filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1
  const rangeEnd = Math.min(safePage * pageSize, filtered.length)

  const allOnPage = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id))
  const someOnPage = pageRows.some((r) => selected.has(r.id))
  useEffect(() => {
    if (headerCheckRef.current) headerCheckRef.current.indeterminate = someOnPage && !allOnPage
  }, [someOnPage, allOnPage])

  const examsById = useMemo(() => new Map((data ?? []).map((e) => [e.id, e])), [data])
  const selectedExams = useMemo(() => [...selected].map((id) => examsById.get(id)).filter((e): e is Exam => Boolean(e)), [selected, examsById])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir(key === 'title' || key === 'status' ? 'asc' : 'desc') }
  }

  const toggleRow = (id: string) =>
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const togglePage = () =>
    setSelected((prev) => { const n = new Set(prev); pageRows.forEach((r) => (allOnPage ? n.delete(r.id) : n.add(r.id))); return n })

  const clearFilters = () => { setQuery(''); setStatus('ALL'); setPage(1) }

  const askDelete = (ids: string[], label: string) => {
    const live = ids.filter((id) => examsById.get(id)?.status === 'LIVE')
    const deletable = ids.filter((id) => !live.includes(id))
    if (deletable.length === 0) { toast.warning('Nothing to delete', 'Live exams cannot be deleted. End the session first.'); return }
    setPending({ ids: deletable, skippedLive: live.length, label })
  }

  const confirmDelete = async () => {
    if (!pending) return
    setDeleting(true)
    try {
      const removed = pending.ids.length === 1 ? (await deleteExam(pending.ids[0]), pending.ids) : (await deleteExams(pending.ids)).deleted
      setData((prev) => (prev ? prev.filter((e) => !removed.includes(e.id)) : prev))
      setSelected((prev) => { const n = new Set(prev); removed.forEach((id) => n.delete(id)); return n })
      toast.success(removed.length === 1 ? 'Exam deleted' : `${removed.length} exams deleted`, pending.skippedLive > 0 ? `${pending.skippedLive} live exam(s) were skipped.` : undefined)
    } catch (e) {
      toast.error('Could not delete', e instanceof Error ? e.message : 'Please try again.')
    } finally {
      setDeleting(false)
      setPending(null)
    }
  }

  const duplicate = async (exam: Exam) => {
    setDuplicatingId(exam.id)
    try {
      const copy = await duplicateExam(exam.id)
      setData((prev) => (prev ? [copy, ...prev] : [copy]))
      toast.success('Exam duplicated', `“${copy.title}” was saved as a draft.`)
    } catch (e) {
      toast.error('Could not duplicate', e instanceof Error ? e.message : 'Please try again.')
    } finally {
      setDuplicatingId(null)
    }
  }

  const SortTh = ({ k, label, align = 'left' }: { k: SortKey; label: string; align?: 'left' | 'right' }) => {
    const active = sortKey === k
    const Icon = !active ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown
    return (
      <th scope="col" aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} className={cx('px-4 py-3', align === 'right' && 'text-right')}>
        <button type="button" onClick={() => toggleSort(k)} className={cx('inline-flex items-center gap-1.5 rounded text-xs font-semibold uppercase tracking-wide outline-none transition focus-visible:ring-2 focus-visible:ring-accent', active ? 'text-primary' : 'text-muted hover:text-text')}>
          {label}<Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </th>
    )
  }

  const checkbox = 'h-4 w-4 cursor-pointer rounded border-border accent-primary outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1'
  const iconBtn = 'grid h-8 w-8 place-items-center rounded-lg text-slate-600 outline-none transition hover:bg-soft hover:text-primary focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-600'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-text sm:text-3xl">Exams</h1>
          <p className="mt-1 text-sm text-muted">Create, schedule and monitor every proctored assessment in one place.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" disabled={filtered.length === 0} onClick={() => { exportCsv(filtered); toast.success('CSV exported', `${filtered.length} exam(s) downloaded.`) }} className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-slate-700 outline-none transition hover:bg-soft focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50">
            <Download className="h-4 w-4" aria-hidden="true" /> Export CSV
          </button>
          <Link href="/organization/exams/new" className="inline-flex items-center gap-2 rounded-xl bg-cta px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm outline-none transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
            <Plus className="h-4 w-4" aria-hidden="true" /> Create exam
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(10,77,166,0.12)]">
        <div className="flex flex-col gap-4 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1) }}
              aria-label="Search exams by title or code"
              placeholder="Search by title or code  ( / )"
              className="h-10 w-full rounded-xl border border-border bg-soft pl-10 pr-9 text-sm outline-none transition placeholder:text-muted focus:border-accent focus:bg-surface focus:ring-2 focus:ring-accent/30"
            />
            {query && (
              <button type="button" onClick={() => { setQuery(''); searchRef.current?.focus() }} aria-label="Clear search" className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-muted outline-none hover:bg-slate-200 focus-visible:ring-2 focus-visible:ring-accent">
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by status">
            {FILTERS.map((f) => (
              <button key={f.value} type="button" aria-pressed={status === f.value} onClick={() => { setStatus(f.value); setPage(1) }}
                className={cx('inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-accent',
                  status === f.value ? 'border-primary bg-primary text-white' : 'border-border bg-surface text-slate-600 hover:bg-soft')}>
                {f.label}
                <span className={cx('rounded-full px-1.5 text-[11px] tabular-nums', status === f.value ? 'bg-white/20' : 'bg-slate-100 text-muted')}>{counts[f.value]}</span>
              </button>
            ))}
          </div>
        </div>

        <AnimatePresence initial={false}>
          {selected.size > 0 && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-b border-border bg-accent/5">
              <div className="flex flex-wrap items-center gap-3 px-4 py-2.5" role="region" aria-label="Bulk actions">
                <p className="text-sm font-semibold text-primary" aria-live="polite">{selected.size} selected</p>
                {allOnPage && filtered.length > pageRows.length && selected.size < filtered.length && (
                  <button type="button" onClick={() => setSelected(new Set(filtered.map((e) => e.id)))} className="rounded text-xs font-semibold text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent">Select all {filtered.length} matching exams</button>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <button type="button" onClick={() => { exportCsv(selectedExams); toast.success('CSV exported', `${selectedExams.length} exam(s) downloaded.`) }} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none hover:bg-soft focus-visible:ring-2 focus-visible:ring-accent"><Download className="h-3.5 w-3.5" aria-hidden="true" /> Export</button>
                  <button type="button" onClick={() => askDelete([...selected], `${selected.size} exams`)} className="inline-flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-1"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete</button>
                  <button type="button" onClick={() => setSelected(new Set())} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 outline-none hover:bg-soft focus-visible:ring-2 focus-visible:ring-accent">Clear</button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {error && !loading ? (
          <ErrorState className="m-4 border-0" title="Couldn't load exams" message={error} onRetry={reload} />
        ) : loading ? (
          <div className="space-y-3 p-4" aria-busy="true" aria-label="Loading exams">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex items-center gap-4"><Skeleton className="h-4 w-4" /><Skeleton className="h-10 flex-1" /><Skeleton className="hidden h-6 w-24 rounded-full sm:block" /><Skeleton className="hidden h-10 w-40 md:block" /></div>
            ))}
          </div>
        ) : (data?.length ?? 0) === 0 ? (
          <EmptyState icon={ClipboardList} title="No exams yet" message="Create your first exam to add questions, import candidates and send credentials." action={<Link href="/organization/exams/new" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white outline-none hover:bg-primary-600 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"><Plus className="h-4 w-4" aria-hidden="true" /> Create exam</Link>} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={SearchX} title="No exams match your filters" message="Try a different keyword or status, or clear the filters to see everything." action={<button type="button" onClick={clearFilters} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-slate-700 outline-none hover:bg-soft focus-visible:ring-2 focus-visible:ring-accent">Clear filters</button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <caption className="sr-only">Exams, sortable by column</caption>
              <thead className="bg-soft/60">
                <tr>
                  <th scope="col" className="w-12 px-4 py-3">
                    <input ref={headerCheckRef} type="checkbox" checked={allOnPage} onChange={togglePage} aria-label="Select all exams on this page" className={checkbox} />
                  </th>
                  <SortTh k="title" label="Exam" />
                  <SortTh k="status" label="Status" />
                  <SortTh k="startsAt" label="Schedule" />
                  <SortTh k="questionCount" label="Questions" align="right" />
                  <SortTh k="candidateCount" label="Candidates" align="right" />
                  <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((e) => {
                  const isSel = selected.has(e.id)
                  return (
                    <tr key={e.id} className={cx('border-t border-border transition-colors hover:bg-soft/70', isSel && 'bg-accent/5')}>
                      <td className="px-4 py-3.5"><input type="checkbox" checked={isSel} onChange={() => toggleRow(e.id)} aria-label={`Select ${e.title}`} className={checkbox} /></td>
                      <td className="max-w-[320px] px-4 py-3.5">
                        <Link href={`/organization/exams/${e.id}`} className="rounded font-semibold text-text outline-none transition hover:text-primary focus-visible:ring-2 focus-visible:ring-accent">{e.title}</Link>
                        <p className="mt-1 flex items-center gap-2 text-xs text-muted">
                          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px]">{e.code}</code>
                          <span>{e.durationMin} min · {e.totalMarks} marks</span>
                        </p>
                      </td>
                      <td className="px-4 py-3.5"><ExamStatusBadge status={e.status} /></td>
                      <td className="whitespace-nowrap px-4 py-3.5">
                        <p className="font-medium text-slate-700">{formatDate(e.startsAt)}</p>
                        <p className="text-xs text-muted">{formatTime(e.startsAt)} – {formatTime(e.endsAt)}</p>
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-slate-700">{e.questionCount}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-slate-700">{e.candidateCount.toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/organization/exams/${e.id}`} aria-label={`Open ${e.title}`} title="Open" className={iconBtn}><ExternalLink className="h-4 w-4" aria-hidden="true" /></Link>
                          <button type="button" onClick={() => duplicate(e)} disabled={duplicatingId === e.id} aria-label={`Duplicate ${e.title}`} title="Duplicate" className={iconBtn}>
                            {duplicatingId === e.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                          </button>
                          <button type="button" onClick={() => askDelete([e.id], `“${e.title}”`)} disabled={e.status === 'LIVE'} aria-label={e.status === 'LIVE' ? `${e.title} is live and cannot be deleted` : `Delete ${e.title}`} title={e.status === 'LIVE' ? 'Live exams cannot be deleted' : 'Delete'} className={cx(iconBtn, 'hover:bg-danger/10 hover:text-danger')}>
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="flex flex-col items-center justify-between gap-3 border-t border-border px-4 py-3 sm:flex-row">
            <p className="text-xs text-muted" aria-live="polite">Showing <span className="font-semibold text-text">{rangeStart}–{rangeEnd}</span> of <span className="font-semibold text-text">{filtered.length}</span> exams</p>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-muted">
                Rows
                <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }} className="rounded-lg border border-border bg-surface px-2 py-1 text-xs font-semibold text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <nav aria-label="Pagination" className="flex items-center gap-1">
                <button type="button" onClick={() => setPage(safePage - 1)} disabled={safePage === 1} aria-label="Previous page" className={iconBtn}><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
                {pageWindow(safePage, pageCount).map((p, i) =>
                  p === '…' ? (
                    <span key={`gap-${i}`} className="px-1 text-muted" aria-hidden="true">…</span>
                  ) : (
                    <button key={p} type="button" onClick={() => setPage(p)} aria-label={`Page ${p}`} aria-current={p === safePage ? 'page' : undefined}
                      className={cx('h-8 min-w-8 rounded-lg px-2 text-xs font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-accent', p === safePage ? 'bg-primary text-white' : 'text-slate-600 hover:bg-soft')}>{p}</button>
                  ),
                )}
                <button type="button" onClick={() => setPage(safePage + 1)} disabled={safePage === pageCount} aria-label="Next page" className={iconBtn}><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
              </nav>
            </div>
          </div>
        )}
      </div>

      <p className="sr-only" aria-live="polite">{loading ? 'Loading exams' : `${filtered.length} exams found`}</p>

      <ConfirmDialog
        open={pending !== null}
        title={pending && pending.ids.length > 1 ? `Delete ${pending.ids.length} exams?` : `Delete ${pending?.label ?? 'exam'}?`}
        confirmLabel={pending && pending.ids.length > 1 ? `Delete ${pending.ids.length} exams` : 'Delete exam'}
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPending(null)}
      >
        <p>This permanently removes the exam along with its questions, candidate assignments and violation history. This action cannot be undone.</p>
        {pending && pending.skippedLive > 0 && <p className="font-medium text-warning">{pending.skippedLive} live exam(s) in your selection will be skipped.</p>}
      </ConfirmDialog>
    </div>
  )
}

export default function AdminExamsPage() {
  return (
    <Suspense fallback={<div className="space-y-4" aria-busy="true"><Skeleton className="h-9 w-48" /><Skeleton className="h-[480px] rounded-2xl" /></div>}>
      <ExamsView />
    </Suspense>
  )
 }
