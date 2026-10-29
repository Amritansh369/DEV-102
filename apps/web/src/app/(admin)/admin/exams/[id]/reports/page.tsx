'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, FileSpreadsheet, FileText, Loader2, Search } from 'lucide-react'
import ScoreDistribution from '@/components/charts/ScoreDistribution'
import ViolationChart from '@/components/charts/ViolationChart'
import RiskGauge, { riskLevel } from '@/components/charts/RiskGauge'
import { getExamReport, type ExamReport } from '@/lib/api'
import { download } from '@/lib/http'

const PAGE_SIZE = 10
const FLAG_RISK = 65

function PassDonut({ passed, total }: { passed: number; total: number }) {
  const frac = total ? passed / total : 0
  const r = 52
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 140 140" className="w-36 shrink-0" role="img" aria-label={`${passed} of ${total} candidates passed`}>
        <g transform="rotate(-90 70 70)">
          <circle cx={70} cy={70} r={r} fill="none" stroke="#FECACA" strokeWidth={16} />
          <motion.circle cx={70} cy={70} r={r} fill="none" stroke="#16A34A" strokeWidth={16} pathLength={1} initial={{ pathLength: 0 }} animate={{ pathLength: Math.max(0.001, frac) }} transition={{ type: 'spring', stiffness: 60, damping: 18 }} />
        </g>
        <text x={70} y={68} textAnchor="middle" fontSize={26} fontWeight={600} fill="#0F172A">{Math.round(frac * 100)}%</text>
        <text x={70} y={86} textAnchor="middle" fontSize={10} fill="#64748B">pass rate</text>
      </svg>
      <ul className="space-y-2 text-sm">
        <li className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-success" aria-hidden /> <span className="text-ink"><strong className="tabular-nums">{passed}</strong> passed</span></li>
        <li className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-red-200" aria-hidden /> <span className="text-ink"><strong className="tabular-nums">{total - passed}</strong> failed</span></li>
      </ul>
    </div>
  )
}

type SortKey = 'name' | 'score' | 'violations' | 'risk'

export default function ReportsPage() {
  const params = useParams<{ id: string }>()
  const examId = params?.id ?? 'exam'

  const [report, setReport] = useState<ExamReport | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'score', dir: -1 })
  const [page, setPage] = useState(0)
  // 'excel' for the whole-exam workbook, otherwise the sessionId whose PDF is downloading.
  const [exporting, setExporting] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getExamReport(examId)
      .then((r) => alive && setReport(r))
      .catch((e: unknown) => alive && setLoadError(e instanceof Error ? e.message : 'Could not load the report.'))
    return () => {
      alive = false
    }
  }, [examId])

  const pctOf = (score: number, max: number) => (score / max) * 100

  const derived = useMemo(() => {
    if (!report) return null
    const passed = report.rows.filter((r) => pctOf(r.score, report.maxScore) >= report.passMark).length
    const avg = report.rows.length ? report.rows.reduce((a, r) => a + pctOf(r.score, report.maxScore), 0) / report.rows.length : 0
    const flagged = report.rows.filter((r) => r.risk >= FLAG_RISK).length
    const top = [...report.rows].sort((a, b) => b.risk - a.risk).slice(0, 5)
    const topType = new Map<string, string>()
    top.forEach((t) => {
      const counts = new Map<string, number>()
      report.events.filter((e) => e.candidateId === t.id).forEach((e) => counts.set(e.type, (counts.get(e.type) ?? 0) + 1))
      const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
      if (best) topType.set(t.id, best[0])
    })
    return { passed, avg, flagged, top, topType }
  }, [report])

  const visible = useMemo(() => {
    if (!report) return []
    const q = query.trim().toLowerCase()
    const list = report.rows.filter((r) => !q || r.name.toLowerCase().includes(q) || r.userId.toLowerCase().includes(q))
    list.sort((a, b) => (sort.key === 'name' ? a.name.localeCompare(b.name) : a[sort.key] - b[sort.key]) * sort.dir)
    return list
  }, [report, query, sort])

  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const safePage = Math.min(page, pages - 1)
  const slice = visible.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  const slug = (report?.examName ?? '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'exam'

  const runExport = async (key: string, path: string, fallbackName: string, label: string) => {
    if (exporting) return
    setExportError(null)
    setExporting(key)
    try {
      await download(path, fallbackName)
    } catch (e) {
      setExportError(`Could not download the ${label}. ${e instanceof Error ? e.message : ''}`.trim())
    } finally {
      setExporting(null)
    }
  }

  const downloadExcel = () => void runExport('excel', `/reports/exams/${encodeURIComponent(examId)}/results.xlsx`, `${slug}-results.xlsx`, 'Excel file')
  const downloadPdf = (sessionId: string, name: string) =>
    void runExport(sessionId, `/reports/sessions/${encodeURIComponent(sessionId)}/report.pdf`, `${slug}-${name.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}.pdf`, `PDF report for ${name}`)

  if (!report || !derived) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted" role="status">
        {loadError ? <><AlertTriangle className="mr-2 h-4 w-4 text-danger" aria-hidden /> {loadError}</> : <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Loading report…</>}
      </div>
    )
  }

  const stat = (label: string, value: string, sub?: string) => (
    <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 font-heading text-2xl font-semibold tabular-nums text-ink">{value}</p>
      {sub && <p className="text-[11px] text-muted">{sub}</p>}
    </div>
  )

  const th = (key: SortKey, label: string, align: 'left' | 'right' = 'left') => {
    const active = sort.key === key
    const Icon = !active ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown
    return (
      <th scope="col" aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'} className={`px-4 py-2.5 text-${align}`}>
        <button type="button" onClick={() => { setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 })); setPage(0) }} className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-accent">
          {label} <Icon className={`h-3 w-3 ${active ? 'text-accent' : ''}`} aria-hidden />
        </button>
      </th>
    )
  }

  const card = 'rounded-2xl border border-border bg-white p-5 shadow-sm'

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted">Exam {examId}</p>
          <h1 className="font-heading text-2xl font-semibold text-ink">Results &amp; integrity report</h1>
          <p className="text-sm text-muted">{report.examName}</p>
        </div>
        <button type="button" onClick={downloadExcel} disabled={!!exporting} className="inline-flex items-center gap-2 rounded-xl bg-cta px-4 py-2.5 text-sm font-semibold text-ink shadow-sm hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50">
          {exporting === 'excel' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileSpreadsheet className="h-4 w-4" aria-hidden />} Download Excel
        </button>
      </header>

      {exportError && <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-danger">{exportError}</p>}
      {loadError && (
        <p role="alert" className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2.5 text-xs text-danger">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {loadError}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stat('Candidates', String(report.rows.length))}
        {stat('Average score', `${derived.avg.toFixed(1)}%`, `Pass mark ${report.passMark}%`)}
        {stat('Pass rate', `${report.rows.length ? Math.round((derived.passed / report.rows.length) * 100) : 0}%`, `${derived.passed} passed`)}
        {stat('High-risk candidates', String(derived.flagged), `Risk score ≥ ${FLAG_RISK}`)}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className={`${card} lg:col-span-2`} aria-label="Score distribution">
          <h2 className="mb-3 font-heading text-base font-semibold text-ink">Score distribution</h2>
          <ScoreDistribution scores={report.rows.map((r) => r.score)} maxScore={report.maxScore} passMark={report.passMark} />
        </section>
        <section className={card} aria-label="Pass rate">
          <h2 className="mb-3 font-heading text-base font-semibold text-ink">Pass rate</h2>
          <PassDonut passed={derived.passed} total={report.rows.length} />
        </section>
      </div>

      <section className={card} aria-label="Violations">
        <h2 className="mb-4 font-heading text-base font-semibold text-ink">Violations</h2>
        <ViolationChart events={report.events} view="both" />
      </section>

      <section className={card} aria-label="Top flagged candidates">
        <h2 className="mb-3 font-heading text-base font-semibold text-ink">Top flagged candidates</h2>
        <ol className="divide-y divide-border">
          {derived.top.map((t, i) => (
            <li key={t.id} className="flex items-center gap-4 py-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-soft text-xs font-semibold text-primary">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{t.name}</p>
                <p className="truncate text-xs text-muted">{t.userId} · {t.violations} violation{t.violations === 1 ? '' : 's'}{derived.topType.get(t.id) ? ` · mostly “${derived.topType.get(t.id)}”` : ''}</p>
              </div>
              <RiskGauge value={t.risk} size="sm" />
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-2xl border border-border bg-white shadow-sm" aria-label="Results table">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="font-heading text-base font-semibold text-ink">Results</h2>
          <label className="relative">
            <span className="sr-only">Search candidates</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(0) }} placeholder="Search name or User ID" className="w-64 rounded-xl border border-border bg-white py-2 pl-9 pr-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent" />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-soft/60">
              <tr>
                {th('name', 'Candidate')}
                <th scope="col" className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">User ID</th>
                {th('score', 'Score', 'right')}
                <th scope="col" className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">Result</th>
                {th('violations', 'Violations', 'right')}
                {th('risk', 'Risk', 'right')}
                <th scope="col" className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted">Report</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {slice.map((r) => {
                const pct = pctOf(r.score, report.maxScore)
                const pass = pct >= report.passMark
                const lvl = riskLevel(r.risk)
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-2.5 font-medium text-ink">{r.name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted">{r.userId}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink">{r.score}/{report.maxScore} <span className="text-xs text-muted">({pct.toFixed(0)}%)</span></td>
                    <td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${pass ? 'bg-green-50 text-success' : 'bg-red-50 text-danger'}`}>{pass ? 'Pass' : 'Fail'}</span></td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink">{r.violations}</td>
                    <td className="px-4 py-2.5 text-right"><span className="rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums" style={{ background: `${lvl.color}1A`, color: lvl.color }}>{r.risk} · {lvl.label}</span></td>
                    <td className="px-4 py-2.5 text-right">
                      {r.sessionId ? (
                        <button type="button" onClick={() => downloadPdf(r.sessionId as string, r.name)} disabled={!!exporting} aria-label={`Download PDF report for ${r.name}`} className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-primary hover:bg-soft focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50">
                          {exporting === r.sessionId ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <FileText className="h-3.5 w-3.5" aria-hidden />} PDF
                        </button>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {slice.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted">No candidates match your search.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-muted">
          <span>{visible.length} result{visible.length === 1 ? '' : 's'} · page {safePage + 1} of {pages}</span>
          <div className="flex gap-1">
            <button type="button" onClick={() => setPage(safePage - 1)} disabled={safePage === 0} aria-label="Previous page" className="rounded-lg border border-border p-1.5 text-primary hover:bg-soft focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" onClick={() => setPage(safePage + 1)} disabled={safePage >= pages - 1} aria-label="Next page" className="rounded-lg border border-border p-1.5 text-primary hover:bg-soft focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      </section>
    </div>
  )
}
