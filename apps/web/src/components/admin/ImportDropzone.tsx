'use client'

import { useCallback, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import Papa from 'papaparse'
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Loader2, Trash2, UploadCloud, Wand2, X } from 'lucide-react'
import { cx } from '@/lib/adminHooks'
import { toast } from '@/lib/adminStore'
import type { QuestionDraft } from '@/lib/api'
import { btnGhost, btnPrimary } from './FormControls'

export const IMPORT_COLUMNS = ['question', 'option_a', 'option_b', 'option_c', 'option_d', 'option_e', 'option_f', 'correct', 'marks', 'difficulty', 'tags', 'tolerance'] as const
export type ImportColumn = (typeof IMPORT_COLUMNS)[number]
type Cells = Record<ImportColumn, string>
interface ParsedRow { key: number; line: number; cells: Cells }
interface RowResult { row: ParsedRow; errors: Partial<Record<ImportColumn, string>>; draft: QuestionDraft | null }

const MAX_BYTES = 5 * 1024 * 1024
const MAX_ROWS = 1000
const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'] as const
const DIFFICULTY: Record<string, QuestionDraft['difficulty']> = { EASY: 'EASY', E: 'EASY', MEDIUM: 'MEDIUM', M: 'MEDIUM', HARD: 'HARD', H: 'HARD' }

const TEMPLATE: string[][] = [
  [...IMPORT_COLUMNS],
  ['Which planet is known as the Red Planet?', 'Venus', 'Mars', 'Jupiter', 'Mercury', '', '', 'B', '1', 'EASY', 'science;astronomy', ''],
  ['Select all even numbers.', '12', '15', '18', '21', '', '', 'A;C', '2', 'MEDIUM', 'aptitude;numbers', ''],
  ['A train covers 120 km in 2 hours. What is its speed in km/h?', '', '', '', '', '', '', '60', '2', 'EASY', 'aptitude;speed', '0'],
]
const SAMPLE: string[][] = [
  [...IMPORT_COLUMNS],
  ['The SI unit of electric current is', 'Volt', 'Ampere', 'Ohm', 'Watt', '', '', 'B', '2', 'EASY', 'physics;electricity', ''],
  ['Which of the following are NoSQL databases?', 'MongoDB', 'PostgreSQL', 'Redis', 'MySQL', '', '', 'A;C', '4', 'MEDIUM', 'cs;databases', ''],
  ['What is the value of 15% of 480?', '62', '72', '82', '', '', '', 'E', '2', 'EASY', 'aptitude;percentages', ''],
  ['Choose the correctly spelt word.', 'Accomodate', 'Acommodate', 'Accommodate', 'Acomodate', '', '', 'C', '99', 'Tough', 'english', ''],
  ['Short?', 'Yes', 'No', '', '', '', '', 'A', '1', 'EASY', '', ''],
  ['The process by which plants prepare food using sunlight is called', 'Respiration', 'Photosynthesis', 'Transpiration', 'Digestion', '', '', 'B', '4', 'EASY', 'biology;plants', ''],
  ['The value of pi to two decimal places is', '', '', '', '', '', '', '3.14', '1', 'EASY', 'maths', '0.005'],
]

function canonicalHeader(raw: string): ImportColumn | null {
  const h = raw.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (['question', 'questions', 'questiontext', 'ques', 'q'].includes(h)) return 'question'
  const opt = /^(?:option|opt|choice)?([a-f1-6])$/.exec(h)
  if (opt) return `option_${/[1-6]/.test(opt[1]) ? LETTERS[Number(opt[1]) - 1] : opt[1]}` as ImportColumn
  if (['correct', 'answer', 'answers', 'correctanswer', 'correctoption', 'ans'].includes(h)) return 'correct'
  if (['marks', 'mark', 'points', 'score'].includes(h)) return 'marks'
  if (['difficulty', 'level'].includes(h)) return 'difficulty'
  if (['tags', 'tag', 'topic', 'topics'].includes(h)) return 'tags'
  if (['tolerance', 'tol', 'margin', 'plusminus'].includes(h)) return 'tolerance'
  return null
}

async function readTable(file: File): Promise<string[][]> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'csv') {
    const text = (await file.text()).replace(/^\uFEFF/, '')
    return Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' }).data.map((r) => r.map((c) => String(c ?? '')))
  }
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) throw new Error('The workbook has no sheets.')
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '', raw: false }).map((r) => r.map((c) => String(c ?? '')))
}

let rowSeq = 0
function tableToRows(table: string[][]): ParsedRow[] {
  if (table.length === 0) throw new Error('The file is empty.')
  const mapping = table[0].map(canonicalHeader)
  if (!mapping.includes('question') || mapping.filter((m) => m?.startsWith('option_')).length < 2) {
    throw new Error('Could not find the question and option columns. Download the template to see the expected headers.')
  }
  const rows = table.slice(1).map((cells, i): ParsedRow => {
    const out = Object.fromEntries(IMPORT_COLUMNS.map((c) => [c, ''])) as Cells
    mapping.forEach((col, idx) => { if (col) out[col] = (cells[idx] ?? '').trim() })
    return { key: ++rowSeq, line: i + 2, cells: out }
  })
  if (rows.length === 0) throw new Error('The file has headers but no question rows.')
  if (rows.length > MAX_ROWS) throw new Error(`A single import is limited to ${MAX_ROWS} questions. This file has ${rows.length}.`)
  return rows
}

function validateRows(rows: ParsedRow[], existing: ReadonlySet<string>): RowResult[] {
  const seen = new Set<string>()
  return rows.map((row) => {
    const c = row.cells
    const errors: Partial<Record<ImportColumn, string>> = {}
    const text = c.question.trim()
    const norm = text.toLowerCase().replace(/\s+/g, ' ')
    if (text.length < 10) errors.question = 'Question must be at least 10 characters'
    else if (text.length > 2000) errors.question = 'Question is longer than 2000 characters'
    else if (existing.has(norm)) errors.question = 'This question already exists in the exam'
    else if (seen.has(norm)) errors.question = 'Duplicate of an earlier row'
    if (text) seen.add(norm)

    const options = LETTERS.map((l) => ({ id: l as string, text: c[`option_${l}`].trim() }))
    const filled = options.filter((o) => o.text)
    // No options and a number in "correct" makes a numeric question.
    const numericValue = filled.length === 0 && /^-?(\d+\.?\d*|\.\d+)$/.test(c.correct.trim()) ? Number(c.correct.trim()) : null
    const tolerance = c.tolerance.trim() === '' ? 0 : Number(c.tolerance)
    if (numericValue !== null) {
      if (!Number.isFinite(tolerance) || tolerance < 0) errors.tolerance = 'Tolerance must be a number of 0 or more'
    } else {
    if (!options[0].text) errors.option_a = filled.length === 0 ? 'Add options, or put a number in "correct" for a numeric question' : 'Option A is required'
    if (!options[1].text) errors.option_b = 'Option B is required'
    }

    const tokens = numericValue !== null ? [] : c.correct.toUpperCase().split(/[\s,;|/&]+/).filter(Boolean).map((t) => (/^[1-6]$/.test(t) ? 'ABCDEF'[Number(t) - 1] : t))
    const correct = Array.from(new Set(tokens))
    if (numericValue !== null) { /* the number itself is the answer */ }
    else if (correct.length === 0) errors.correct = 'Give the correct option, e.g. B or A;C'
    else {
      const bad = correct.find((t) => !/^[A-F]$/.test(t) || !filled.some((o) => o.id === t.toLowerCase()))
      if (bad) errors.correct = `Option ${bad} does not exist in this row`
    }

    const marks = c.marks.trim() === '' ? 1 : Number(c.marks)
    if (!Number.isFinite(marks) || marks < 0.25 || marks > 20) errors.marks = 'Marks must be between 0.25 and 20'
    const dRaw = c.difficulty.trim().toUpperCase()
    const difficulty: QuestionDraft['difficulty'] | undefined = dRaw === '' ? 'MEDIUM' : DIFFICULTY[dRaw]
    if (!difficulty) errors.difficulty = 'Use Easy, Medium or Hard'
    const tags = c.tags.split(/[;,|]/).map((t) => t.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean)
    if (tags.length > 6) errors.tags = 'Use at most 6 tags'
    else if (tags.some((t) => t.length > 24)) errors.tags = 'Tags can be up to 24 characters'

    const ok = Object.keys(errors).length === 0 && difficulty !== undefined
    return {
      row,
      errors,
      draft: !ok ? null : numericValue !== null
        ? { type: 'NUMERIC', text, options: [], correctIds: [], multi: false, marks, difficulty, tags, answerKey: { value: numericValue, tolerance, unit: null } }
        : { type: 'MCQ', text, options: filled, correctIds: correct.map((t) => t.toLowerCase()), multi: correct.length > 1, marks, difficulty, tags },
    }
  })
}

const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`
export const toCsv = (table: string[][]): string => `\uFEFF${table.map((r) => r.map(csvCell).join(',')).join('\r\n')}`

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

const COL_WIDTH: Record<ImportColumn, string> = {
  question: 'w-72', option_a: 'w-32', option_b: 'w-32', option_c: 'w-32', option_d: 'w-32', option_e: 'w-28', option_f: 'w-28', correct: 'w-20', marks: 'w-16', difficulty: 'w-24', tags: 'w-36', tolerance: 'w-20',
}

export function ImportDropzone({ existingTexts, onImport, onDone }: {
  existingTexts: string[]
  onImport: (rows: QuestionDraft[]) => Promise<void>
  onDone?: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [fileName, setFileName] = useState('')
  const [parsing, setParsing] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [errorsOnly, setErrorsOnly] = useState(false)
  const [limit, setLimit] = useState(50)
  const [importing, setImporting] = useState(false)

  const existing = useMemo(() => new Set(existingTexts.map((t) => t.toLowerCase().replace(/\s+/g, ' ').trim())), [existingTexts])
  const results = useMemo(() => validateRows(rows, existing), [rows, existing])
  const valid = results.filter((r) => r.draft)
  const invalid = results.length - valid.length
  const visible = (errorsOnly ? results.filter((r) => !r.draft) : results).slice(0, limit)
  const totalVisible = errorsOnly ? invalid : results.length

  const load = useCallback((table: string[][], name: string) => {
    setRows(tableToRows(table))
    setFileName(name)
    setErrorsOnly(false)
    setLimit(50)
  }, [])

  const processFile = async (file: File) => {
    setFileError(null)
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!ext || !['csv', 'xlsx', 'xls'].includes(ext)) return setFileError('Unsupported file type. Upload a .csv, .xlsx or .xls file.')
    if (file.size > MAX_BYTES) return setFileError(`This file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB.`)
    setParsing(true)
    try {
      load(await readTable(file), file.name)
    } catch (e) {
      setFileError(e instanceof Error ? e.message : 'The file could not be read.')
    } finally {
      setParsing(false)
    }
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) void processFile(file)
  }
  const onZoneKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() }
  }

  const setCell = (key: number, col: ImportColumn, value: string) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, cells: { ...r.cells, [col]: value } } : r)))

  const downloadCsvTemplate = () => download(new Blob([toCsv(TEMPLATE)], { type: 'text/csv;charset=utf-8' }), 'dev102-mcq-template.csv')
  const downloadXlsxTemplate = async () => {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(TEMPLATE), 'Questions')
    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    download(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'dev102-mcq-template.xlsx')
  }

  const submit = async () => {
    const drafts = valid.flatMap((r) => (r.draft ? [r.draft] : []))
    setImporting(true)
    try {
      await onImport(drafts)
      toast.success(`${drafts.length} question${drafts.length > 1 ? 's' : ''} imported`, invalid > 0 ? `${invalid} row${invalid > 1 ? 's' : ''} with errors were skipped.` : undefined)
      setRows([])
      onDone?.()
    } catch (e) {
      toast.error('Import failed', e instanceof Error ? e.message : 'Please try again.')
    } finally {
      setImporting(false)
    }
  }

  if (rows.length === 0) {
    return (
      <div className="space-y-4">
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload a CSV or Excel file of questions. Press Enter to browse."
          onClick={() => inputRef.current?.click()}
          onKeyDown={onZoneKey}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cx('flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-6 py-12 text-center outline-none transition focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2', dragOver ? 'border-accent bg-accent/5' : 'border-border bg-soft/50 hover:border-accent/60')}
        >
          <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { const f = e.target.files?.[0]; if (f) void processFile(f); e.target.value = '' }} />
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-surface text-accent shadow-sm">
            {parsing ? <Loader2 className="h-7 w-7 animate-spin" aria-hidden="true" /> : <UploadCloud className="h-7 w-7" aria-hidden="true" />}
          </span>
          <p className="mt-4 font-heading text-base font-semibold text-text">{parsing ? 'Reading your file…' : 'Drag and drop your question file here'}</p>
          <p className="mt-1 text-sm text-muted">or <span className="font-semibold text-accent">browse</span> · .csv, .xlsx or .xls · up to 5 MB and {MAX_ROWS} questions</p>
        </div>

        {fileError && (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/5 p-4 text-sm text-danger">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {fileError}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={downloadCsvTemplate} className={btnGhost}><Download className="h-4 w-4" aria-hidden="true" /> CSV template</button>
          <button type="button" onClick={() => void downloadXlsxTemplate()} className={btnGhost}><FileSpreadsheet className="h-4 w-4" aria-hidden="true" /> Excel template</button>
          <button type="button" onClick={() => load(SAMPLE, 'sample-questions.csv')} className={btnGhost}><Wand2 className="h-4 w-4" aria-hidden="true" /> Try with sample data</button>
        </div>

        <ul className="grid gap-2 rounded-xl bg-soft p-4 text-xs text-muted sm:grid-cols-2">
          <li><strong className="text-text">question</strong>: 10 to 2000 characters, Markdown allowed</li>
          <li><strong className="text-text">option_a … option_f</strong>: at least A and B</li>
          <li><strong className="text-text">correct</strong>: letters such as B, or A;C for multiple answers</li>
          <li><strong className="text-text">marks, difficulty, tags</strong>: optional (1, Medium, semicolon-separated)</li>
          <li className="sm:col-span-2"><strong className="text-text">Numeric questions</strong>: leave the options empty, put the number in <em>correct</em> and an optional ± <em>tolerance</em></li>
        </ul>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-lg bg-soft px-3 py-1.5 text-sm font-medium text-slate-700"><FileSpreadsheet className="h-4 w-4 text-accent" aria-hidden="true" />{fileName}</span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{results.length} rows</span>
        <span className="rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">{valid.length} ready</span>
        <span className={cx('rounded-full px-3 py-1 text-xs font-semibold', invalid ? 'bg-danger/10 text-danger' : 'bg-slate-100 text-slate-500')}>{invalid} with errors</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" aria-pressed={errorsOnly} onClick={() => { setErrorsOnly((v) => !v); setLimit(50) }} disabled={invalid === 0 && !errorsOnly} className={cx(btnGhost, 'py-1.5 text-xs', errorsOnly && 'border-danger text-danger')}>Show errors only</button>
          <button type="button" onClick={() => setRows((rs) => rs.filter((r) => results.find((x) => x.row.key === r.key)?.draft))} disabled={invalid === 0} className={cx(btnGhost, 'py-1.5 text-xs')}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remove rows with errors</button>
          <button type="button" onClick={() => setRows([])} className={cx(btnGhost, 'py-1.5 text-xs')}>Choose another file</button>
        </div>
      </div>

      {invalid > 0 && <p role="status" className="rounded-xl bg-warning/10 px-4 py-2.5 text-sm text-amber-800">Edit the highlighted cells to fix them, or import only the {valid.length} valid row{valid.length === 1 ? '' : 's'}.</p>}

      <div className="max-h-[52vh] overflow-auto rounded-xl border border-border">
        <table className="w-max min-w-full text-left text-xs">
          <caption className="sr-only">Import preview. Cells with errors are highlighted and editable.</caption>
          <thead className="sticky top-0 z-10 bg-soft">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold uppercase tracking-wide text-muted">Row</th>
              {IMPORT_COLUMNS.map((c) => <th key={c} scope="col" className="px-2 py-2 font-semibold uppercase tracking-wide text-muted">{c.replace('_', ' ')}</th>)}
              <th scope="col" className="min-w-[220px] px-3 py-2 font-semibold uppercase tracking-wide text-muted">Status</th>
              <th scope="col" className="px-2 py-2"><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {visible.map(({ row, errors, draft }) => (
              <tr key={row.key} className={cx('border-t border-border align-top', !draft && 'bg-danger/[0.04]')}>
                <td className="px-3 py-2 tabular-nums text-muted">{row.line}</td>
                {IMPORT_COLUMNS.map((c) => (
                  <td key={c} className="px-1 py-1.5">
                    <input value={row.cells[c]} onChange={(e) => setCell(row.key, c, e.target.value)} aria-label={`Row ${row.line}, ${c.replace('_', ' ')}`} aria-invalid={Boolean(errors[c])} title={errors[c]} className={cx('h-8 rounded-md border px-2 text-xs outline-none focus:border-accent focus:ring-2 focus:ring-accent/30', COL_WIDTH[c], errors[c] ? 'border-danger bg-danger/5 text-danger' : 'border-transparent bg-transparent hover:border-border')} />
                  </td>
                ))}
                <td className="px-3 py-2">
                  {draft ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-success"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Ready{draft.multi ? ' · multiple answers' : ''}</span>
                  ) : (
                    <ul className="space-y-0.5 text-danger">{Object.values(errors).map((m) => <li key={m} className="flex gap-1"><AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />{m}</li>)}</ul>
                  )}
                </td>
                <td className="px-2 py-2"><button type="button" aria-label={`Remove row ${row.line}`} onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))} className="grid h-7 w-7 place-items-center rounded-md text-muted outline-none hover:bg-danger/10 hover:text-danger focus-visible:ring-2 focus-visible:ring-accent"><X className="h-3.5 w-3.5" aria-hidden="true" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">Showing {visible.length} of {totalVisible} rows{visible.length < totalVisible && <> · <button type="button" onClick={() => setLimit((l) => l + 50)} className="font-semibold text-accent hover:underline">Show 50 more</button></>}</p>
        <button type="button" onClick={() => void submit()} disabled={valid.length === 0 || importing} className={btnPrimary}>
          {importing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Import {valid.length} valid question{valid.length === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  )
}
