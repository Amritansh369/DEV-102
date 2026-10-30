'use client'

import { useMemo, useRef, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Ban, Bell, CheckCircle2, EyeOff, FlaskConical, Plus, RotateCcw, ShieldAlert, Trash2, type LucideIcon } from 'lucide-react'
import { VIOLATION_META } from '@/lib/api'
import { cx } from '@/lib/adminHooks'
import {
  DEFAULT_POLICY, SEVERITIES, SEVERITY_RANK, clonePolicy, policySchema, simulateSession, type SimEvent, type SimOutcome, type ViolationPolicy,
} from '@/lib/examPolicy'
import type { Severity, ViolationCode } from '@/lib/types'
import { Segmented, Toggle, btnGhost, cardCls } from './FormControls'

const SEV_STYLE: Record<Severity, string> = {
  LOW: 'bg-slate-100 text-slate-600',
  MEDIUM: 'bg-warning/15 text-amber-800',
  HIGH: 'bg-orange-100 text-orange-700',
  CRITICAL: 'bg-danger text-white',
}
const CODES = Object.keys(VIOLATION_META) as ViolationCode[]
const CODES_BY_SEV = SEVERITIES.map((s) => ({ s, codes: CODES.filter((c) => VIOLATION_META[c].severity === s) }))
const sevLabel = (s: Severity) => s[0] + s.slice(1).toLowerCase()
const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`

function effectOf(s: Severity, p: ViolationPolicy): { label: string; cls: string } {
  const rank = SEVERITY_RANK[s]
  if (p.autoSubmit && p.autoSubmitOnCritical && s === 'CRITICAL') return { label: 'Ends the session immediately', cls: 'bg-danger/10 text-danger' }
  if (rank >= SEVERITY_RANK[p.warnFrom]) {
    const auto = p.autoSubmit && rank >= SEVERITY_RANK[p.autoSubmitFrom]
    if (p.maxWarnings === 0) return auto ? { label: 'Auto-submits at once', cls: 'bg-danger/10 text-danger' } : { label: 'Logged for review', cls: 'bg-slate-100 text-slate-600' }
    return auto
      ? { label: `Warns up to ${p.maxWarnings}×, then auto-submits`, cls: 'bg-orange-100 text-orange-700' }
      : { label: `Warns up to ${p.maxWarnings}×, then logged`, cls: 'bg-warning/15 text-amber-800' }
  }
  return { label: 'Logged, adds risk only', cls: 'bg-slate-100 text-slate-600' }
}

/* -------------------------------- Simulator ------------------------------- */

interface Draft { id: number; code: ViolationCode; gapSec: number }
let draftSeq = 0
const withIds = (list: ReadonlyArray<[ViolationCode, number]>): Draft[] => list.map(([code, gapSec]) => ({ id: ++draftSeq, code, gapSec }))

const PRESETS: { label: string; events: ReadonlyArray<[ViolationCode, number]> }[] = [
  { label: 'Honest candidate', events: [['WINDOW_BLUR', 240], ['GAZE_AWAY', 180], ['NETWORK_LOST', 600], ['GAZE_AWAY', 420]] },
  { label: 'Repeated suspicious events', events: [['GAZE_AWAY', 60], ['NO_FACE', 300], ['MULTIPLE_FACES', 240], ['NO_FACE', 200], ['MULTIPLE_FACES', 120], ['GAZE_AWAY', 60]] },
  { label: 'AI assistance', events: [['AI_SITE_OPENED', 600], ['AI_QUERY_DETECTED', 45], ['GAZE_AWAY', 30]] },
]
const GAPS = [15, 30, 60, 300, 900]

const OUTCOME: Record<SimOutcome, { label: string; cls: string; icon: LucideIcon }> = {
  LOGGED: { label: 'Logged', cls: 'bg-slate-100 text-slate-600', icon: EyeOff },
  SUPPRESSED: { label: 'Counted once', cls: 'bg-slate-100 text-slate-500', icon: EyeOff },
  WARNING: { label: 'Warning', cls: 'bg-warning/15 text-amber-800', icon: Bell },
  AUTO_SUBMIT: { label: 'Auto-submit', cls: 'bg-danger text-white', icon: Ban },
  AFTER_SUBMIT: { label: 'Ignored', cls: 'bg-slate-100 text-slate-400', icon: EyeOff },
}

function Simulator({ policy }: { policy: ViolationPolicy }) {
  const [events, setEvents] = useState<Draft[]>(() => withIds(PRESETS[1].events))
  const [code, setCode] = useState<ViolationCode>('GAZE_AWAY')
  const [gap, setGap] = useState(60)

  const timed = useMemo<SimEvent[]>(() => {
    let t = 0
    return events.map((e) => ({ id: e.id, code: e.code, atSec: (t += e.gapSec) }))
  }, [events])
  const result = useMemo(() => simulateSession(policy, timed), [policy, timed])
  const selectCls = 'h-10 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30'

  return (
    <section aria-labelledby="sim-title" className={cx(cardCls, 'p-5')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="sim-title" className="flex items-center gap-2 font-heading text-base font-semibold text-text"><FlaskConical className="h-4 w-4 text-accent" aria-hidden="true" /> Simulate a session</h3>
          <p className="mt-0.5 text-xs text-muted">Build a sequence of violations and see exactly what this policy would do. Nothing is saved.</p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Example sequences">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" onClick={() => setEvents(withIds(p.events))} className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-slate-600 outline-none transition hover:bg-soft focus-visible:ring-2 focus-visible:ring-accent">{p.label}</button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-slate-600">
          Violation
          <select value={code} onChange={(e) => setCode(e.target.value as ViolationCode)} className={cx(selectCls, 'mt-1 block w-64 max-w-full')}>
            {CODES_BY_SEV.map(({ s, codes }) => (
              <optgroup key={s} label={sevLabel(s)}>{codes.map((c) => <option key={c} value={c}>{VIOLATION_META[c].label}</option>)}</optgroup>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          After the previous event
          <select value={gap} onChange={(e) => setGap(Number(e.target.value))} className={cx(selectCls, 'mt-1 block')}>
            {GAPS.map((g) => <option key={g} value={g}>{g < 60 ? `${g} seconds` : `${g / 60} min`}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => setEvents((ev) => [...ev, { id: ++draftSeq, code, gapSec: gap }])} className={cx(btnGhost, 'h-10 py-0')}><Plus className="h-4 w-4" aria-hidden="true" /> Add event</button>
        <button type="button" onClick={() => setEvents([])} disabled={events.length === 0} className={cx(btnGhost, 'h-10 py-0')}><Trash2 className="h-4 w-4" aria-hidden="true" /> Clear</button>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_280px]">
        {result.steps.length === 0 ? (
          <p className="rounded-xl bg-soft px-4 py-8 text-center text-sm text-muted">Add a violation above to see how the policy reacts.</p>
        ) : (
          <ol className="space-y-2" aria-label="Simulated timeline">
            {result.steps.map((st, i) => {
              const o = OUTCOME[st.outcome]
              const Icon = o.icon
              return (
                <motion.li key={st.event.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex items-start gap-3 rounded-xl border border-border p-3">
                  <span className="mt-0.5 w-10 shrink-0 font-mono text-xs text-muted">{mmss(st.event.atSec)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text">
                      {i + 1}. {VIOLATION_META[st.event.code].label}
                      <span className={cx('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', SEV_STYLE[st.severity])}>{st.severity}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted">{st.note}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', o.cls)}><Icon className="h-3.5 w-3.5" aria-hidden="true" />{o.label}</span>
                    <span className="text-[11px] tabular-nums text-muted">Risk {st.risk}</span>
                  </div>
                  <button type="button" aria-label={`Remove event ${i + 1}`} onClick={() => setEvents((ev) => ev.filter((e) => e.id !== st.event.id))} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted outline-none hover:bg-danger/10 hover:text-danger focus-visible:ring-2 focus-visible:ring-accent"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
                </motion.li>
              )
            })}
          </ol>
        )}

        <aside aria-live="polite" className={cx('h-fit rounded-xl p-4', result.submittedAtStep !== null ? 'bg-danger/5 ring-1 ring-danger/25' : 'bg-success/5 ring-1 ring-success/25')}>
          <p className={cx('flex items-center gap-2 text-sm font-semibold', result.submittedAtStep !== null ? 'text-danger' : 'text-success')}>
            {result.submittedAtStep !== null ? <Ban className="h-4 w-4" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
            {result.submittedAtStep !== null ? `Auto-submitted at event ${result.submittedAtStep + 1}` : 'Candidate finishes the exam'}
          </p>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Warnings shown</dt><dd className="font-semibold tabular-nums text-text">{result.warnings} / {policy.maxWarnings}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Final risk score</dt><dd className="font-semibold tabular-nums text-text">{result.risk} / 100</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Proctor review</dt><dd className={cx('font-semibold', result.flagged ? 'text-danger' : 'text-text')}>{result.flagged ? 'Flagged' : 'Not flagged'}</dd></div>
          </dl>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200" role="img" aria-label={`Risk ${result.risk} of 100, flag at ${policy.riskFlagAt}`}>
            <div className={cx('h-full rounded-full transition-all', result.flagged ? 'bg-danger' : 'bg-accent')} style={{ width: `${result.risk}%` }} />
          </div>
        </aside>
      </div>
    </section>
  )
}

/* --------------------------------- Editor --------------------------------- */

function Slider({ label, value, min, max, step = 1, unit, display, onChange, disabled, error }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string; display?: string; onChange: (v: number) => void; disabled?: boolean; error?: string
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <output className="rounded-lg bg-primary/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary">{display ?? `${value}${unit ?? ''}`}</output>
      </div>
      <input type="range" aria-label={label} min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 h-2 w-full cursor-pointer accent-primary-600 disabled:cursor-not-allowed disabled:opacity-50" />
      <div className="mt-1 flex justify-between text-[11px] text-muted"><span>{min}</span><span>{max}</span></div>
      {error && <p role="alert" className="mt-1 text-xs font-medium text-danger">{error}</p>}
    </div>
  )
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className={cx(cardCls, 'p-5')}>
      <h3 className="font-heading text-base font-semibold text-text">{title}</h3>
      <p className="mb-4 mt-0.5 text-xs text-muted">{subtitle}</p>
      {children}
    </section>
  )
}

export function PolicyEditor({ value, onChange, readOnly = false, showSimulator = true }: {
  value: ViolationPolicy; onChange: (next: ViolationPolicy) => void; readOnly?: boolean; showSimulator?: boolean
}) {
  const patch = (p: Partial<ViolationPolicy>) => onChange({ ...value, ...p })
  const parsed = useMemo(() => policySchema.safeParse(value), [value])
  const errs = useMemo(() => {
    const map: Record<string, string> = {}
    if (!parsed.success) for (const i of parsed.error.issues) { const k = String(i.path[0]); if (!(k in map)) map[k] = i.message }
    return map
  }, [parsed])
  const tableRef = useRef<HTMLTableElement>(null)
  const warnOptions = (['LOW', 'MEDIUM', 'HIGH'] as const).map((s) => ({ value: s as Severity, label: sevLabel(s) }))
  const autoOptions = SEVERITIES.map((s) => ({ value: s, label: sevLabel(s) }))

  return (
    <div className="space-y-5">
      <Panel title="Risk points and marks" subtitle="Each detected event adds risk points to the candidate's score. When a proctor confirms a flag, these marks are taken off the result. The proctor can change the marks for a single flag.">
        <div className="overflow-x-auto">
          <table ref={tableRef} className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">Risk points and consequences per severity</caption>
            <thead>
              <tr className="text-xs uppercase tracking-wide text-muted">
                <th scope="col" className="pb-2 pr-3 font-semibold">Severity</th>
                <th scope="col" className="pb-2 pr-3 font-semibold">Typical events</th>
                <th scope="col" className="pb-2 pr-3 font-semibold">Risk points</th>
                <th scope="col" className="pb-2 pr-3 font-semibold">Marks deducted</th>
                <th scope="col" className="pb-2 font-semibold">What happens</th>
              </tr>
            </thead>
            <tbody>
              {CODES_BY_SEV.map(({ s, codes }) => {
                const eff = effectOf(s, value)
                return (
                  <tr key={s} className="border-t border-border align-top">
                    <th scope="row" className="py-3 pr-3"><span className={cx('rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide', SEV_STYLE[s])}>{s}</span></th>
                    <td className="max-w-[260px] py-3 pr-3 text-xs text-muted">{codes.slice(0, 3).map((c) => VIOLATION_META[c].label).join(', ')}{codes.length > 3 ? ` +${codes.length - 3} more` : ''}</td>
                    <td className="py-3 pr-3">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={100}
                        disabled={readOnly}
                        aria-label={`Risk points for ${s.toLowerCase()} severity`}
                        value={value.weights[s]}
                        onChange={(e) => patch({ weights: { ...value.weights, [s]: Number.isFinite(e.target.valueAsNumber) ? Math.round(e.target.valueAsNumber) : 0 } })}
                        className="h-9 w-20 rounded-lg border border-border px-2 text-sm tabular-nums outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:bg-soft"
                      />
                    </td>
                    <td className="py-3 pr-3">
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={100}
                        step={0.25}
                        disabled={readOnly}
                        aria-label={`Marks deducted for a confirmed ${s.toLowerCase()} flag`}
                        value={value.penalties[s]}
                        onChange={(e) => patch({ penalties: { ...value.penalties, [s]: Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : 0 } })}
                        className="h-9 w-20 rounded-lg border border-border px-2 text-sm tabular-nums outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:bg-soft"
                      />
                    </td>
                    <td className="py-3"><span className={cx('inline-block rounded-full px-2.5 py-1 text-xs font-semibold', eff.cls)}>{eff.label}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {(errs.weights ?? errs.penalties) && <p role="alert" className="mt-2 flex items-center gap-1.5 text-xs font-medium text-danger"><ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />{errs.weights ?? errs.penalties}</p>}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Warning thresholds" subtitle="When sessions are flagged for review. Candidate warnings apply only when Proctor-only alerts is off.">
          <div className="space-y-5">
            <Slider label="Warnings before action" value={value.maxWarnings} min={0} max={5} disabled={readOnly} onChange={(v) => patch({ maxWarnings: v })} display={value.maxWarnings === 0 ? 'No warnings' : `${value.maxWarnings} warning${value.maxWarnings > 1 ? 's' : ''}`} error={errs.maxWarnings} />
            <div>
              <p className="mb-1.5 text-sm font-medium text-slate-700">Warn from severity</p>
              <Segmented label="Warn from severity" value={value.warnFrom} onChange={(v) => patch({ warnFrom: v })} options={warnOptions} disabled={readOnly} />
            </div>
            <Slider label="Flag for proctor review at risk" value={value.riskFlagAt} min={10} max={100} step={5} disabled={readOnly} onChange={(v) => patch({ riskFlagAt: v })} error={errs.riskFlagAt} />
            <Slider label="Ignore repeats of the same event within" value={value.cooldownSec} min={0} max={120} step={5} unit=" s" disabled={readOnly} onChange={(v) => patch({ cooldownSec: v })} error={errs.cooldownSec} />
          </div>
        </Panel>

        <Panel title="Auto-submit rules" subtitle="Applies only when Proctor-only alerts is off. Ends the exam and submits saved answers without waiting for a proctor.">
          <div className="space-y-5">
            <Toggle checked={value.autoSubmit} onChange={(v) => patch({ autoSubmit: v })} label="Auto-submit on repeated violations" description="When off, only proctors can terminate a session." disabled={readOnly} />
            <div className={cx(!value.autoSubmit && 'pointer-events-none opacity-50')}>
              <p className="mb-1.5 text-sm font-medium text-slate-700">Auto-submit once warnings are used up, from severity</p>
              <Segmented label="Auto-submit severity" value={value.autoSubmitFrom} onChange={(v) => patch({ autoSubmitFrom: v })} options={autoOptions} disabled={readOnly || !value.autoSubmit} />
              {errs.autoSubmitFrom && <p role="alert" className="mt-1.5 text-xs font-medium text-danger">{errs.autoSubmitFrom}</p>}
            </div>
            <div className={cx(!value.autoSubmit && 'pointer-events-none opacity-50')}>
              <Toggle checked={value.autoSubmitOnCritical} onChange={(v) => patch({ autoSubmitOnCritical: v })} label="Any critical event ends the exam at once" description="Face mismatch, virtual machine, remote desktop, second login and AI-style queries." disabled={readOnly || !value.autoSubmit} />
            </div>
            {!readOnly && (
              <button type="button" onClick={() => onChange(clonePolicy(DEFAULT_POLICY))} className={btnGhost}><RotateCcw className="h-4 w-4" aria-hidden="true" /> Reset to recommended policy</button>
            )}
          </div>
        </Panel>
      </div>

      {showSimulator && <Simulator policy={value} />}
    </div>
  )
}
