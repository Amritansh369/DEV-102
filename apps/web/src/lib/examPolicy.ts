import { z } from 'zod'
import { VIOLATION_META } from './api'
import type { Severity, ViolationCode } from './types'

export const SEVERITIES: readonly Severity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
export const SEVERITY_RANK: Record<Severity, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 }

/** Per-exam violation policy. Default: two MEDIUM+ events warn, the third HIGH or any CRITICAL auto-submits. */
export interface ViolationPolicy {
  weights: Record<Severity, number>
  maxWarnings: number
  warnFrom: Severity
  autoSubmit: boolean
  autoSubmitFrom: Severity
  autoSubmitOnCritical: boolean
  riskFlagAt: number
  cooldownSec: number
}

export const DEFAULT_POLICY: ViolationPolicy = {
  weights: { LOW: 2, MEDIUM: 8, HIGH: 20, CRITICAL: 50 },
  maxWarnings: 2,
  warnFrom: 'MEDIUM',
  autoSubmit: true,
  autoSubmitFrom: 'HIGH',
  autoSubmitOnCritical: true,
  riskFlagAt: 60,
  cooldownSec: 30,
}

export const clonePolicy = (p: ViolationPolicy): ViolationPolicy => ({ ...p, weights: { ...p.weights } })

const sev = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
const weight = z.number().int('Use whole numbers').min(0, 'Weights cannot be negative').max(100, 'Weights are capped at 100')

export const policySchema = z
  .object({
    weights: z.object({ LOW: weight, MEDIUM: weight, HIGH: weight, CRITICAL: weight }),
    maxWarnings: z.number().int().min(0, 'Warnings cannot be negative').max(5, 'Allow at most 5 warnings'),
    warnFrom: sev,
    autoSubmit: z.boolean(),
    autoSubmitFrom: sev,
    autoSubmitOnCritical: z.boolean(),
    riskFlagAt: z.number().int().min(10, 'Risk flag must be at least 10').max(100, 'Risk flag cannot exceed 100'),
    cooldownSec: z.number().int().min(0).max(300, 'Cooldown is capped at 300 seconds'),
  })
  .refine((p) => p.weights.LOW <= p.weights.MEDIUM && p.weights.MEDIUM <= p.weights.HIGH && p.weights.HIGH <= p.weights.CRITICAL, {
    path: ['weights'],
    message: 'Risk points must not decrease as severity increases.',
  })
  .refine((p) => SEVERITY_RANK[p.autoSubmitFrom] >= SEVERITY_RANK[p.warnFrom], {
    path: ['autoSubmitFrom'],
    message: 'The auto-submit severity must be at least as high as the warning severity.',
  })

export function describePolicy(p: ViolationPolicy): string[] {
  const lines = [
    p.maxWarnings === 0
      ? 'No warnings are shown to candidates.'
      : `Warns on ${p.warnFrom.toLowerCase()} severity and above, up to ${p.maxWarnings} time${p.maxWarnings > 1 ? 's' : ''}.`,
    p.autoSubmit
      ? `Auto-submits on ${p.autoSubmitFrom.toLowerCase()} events once warnings are used up${p.autoSubmitOnCritical ? ', and immediately on any critical event' : ''}.`
      : 'Auto-submit is off. Mentors terminate sessions manually.',
    `Sessions are flagged for mentor review at a risk score of ${p.riskFlagAt}.`,
  ]
  if (p.cooldownSec > 0) lines.push(`Identical events within ${p.cooldownSec} seconds count once.`)
  return lines
}

/* ------------------------------ Simulation ------------------------------ */

export interface SimEvent {
  id: number
  code: ViolationCode
  atSec: number
}
export type SimOutcome = 'LOGGED' | 'SUPPRESSED' | 'WARNING' | 'AUTO_SUBMIT' | 'AFTER_SUBMIT'
export interface SimStep {
  event: SimEvent
  severity: Severity
  outcome: SimOutcome
  warnings: number
  risk: number
  flagged: boolean
  note: string
}
export interface SimResult {
  steps: SimStep[]
  submittedAtStep: number | null
  warnings: number
  risk: number
  flagged: boolean
}

export function simulateSession(policy: ViolationPolicy, events: SimEvent[]): SimResult {
  const steps: SimStep[] = []
  const lastSeen = new Map<ViolationCode, number>()
  let warnings = 0
  let risk = 0
  let submittedAt: number | null = null

  events.forEach((event, index) => {
    const severity = VIOLATION_META[event.code].severity
    const finish = (outcome: SimOutcome, note: string) =>
      steps.push({ event, severity, outcome, warnings, risk, flagged: risk >= policy.riskFlagAt, note })

    if (submittedAt !== null) return finish('AFTER_SUBMIT', 'The session had already ended.')
    const last = lastSeen.get(event.code)
    if (last !== undefined && event.atSec - last < policy.cooldownSec) {
      return finish('SUPPRESSED', `Same event within ${policy.cooldownSec}s counts once.`)
    }
    lastSeen.set(event.code, event.atSec)
    risk = Math.min(100, risk + policy.weights[severity])

    const rank = SEVERITY_RANK[severity]
    if (policy.autoSubmit && policy.autoSubmitOnCritical && severity === 'CRITICAL') {
      submittedAt = index
      return finish('AUTO_SUBMIT', 'Critical events end the session immediately.')
    }
    if (rank >= SEVERITY_RANK[policy.warnFrom]) {
      if (warnings < policy.maxWarnings) {
        warnings++
        return finish('WARNING', `Warning ${warnings} of ${policy.maxWarnings} sent to the candidate.`)
      }
      if (policy.autoSubmit && rank >= SEVERITY_RANK[policy.autoSubmitFrom]) {
        submittedAt = index
        return finish('AUTO_SUBMIT', 'Warnings are used up, so the exam is submitted automatically.')
      }
      return finish('LOGGED', 'Warnings are used up, but this severity is below the auto-submit level.')
    }
    return finish('LOGGED', 'Below the warning level. It only adds to the risk score.')
  })

  return { steps, submittedAtStep: submittedAt, warnings, risk, flagged: risk >= policy.riskFlagAt }
}
