import type { Severity } from '../lib/types'

export const SEVERITY_STYLES: Record<Severity, { label: string; chip: string; dot: string; ring: string; bar: string }> = {
  LOW: { label: 'Low', chip: 'bg-success/10 text-success', dot: 'bg-success', ring: 'ring-success/40', bar: 'bg-success' },
  MEDIUM: { label: 'Medium', chip: 'bg-warning/15 text-amber-700', dot: 'bg-warning', ring: 'ring-warning/60', bar: 'bg-warning' },
  HIGH: { label: 'High', chip: 'bg-danger/10 text-danger', dot: 'bg-danger', ring: 'ring-danger/60', bar: 'bg-danger' },
  CRITICAL: { label: 'Critical', chip: 'bg-danger text-white', dot: 'bg-white', ring: 'ring-danger', bar: 'bg-danger' },
}

export function riskLevel(score: number): Severity {
  if (score >= 80) return 'CRITICAL'
  if (score >= 60) return 'HIGH'
  if (score >= 30) return 'MEDIUM'
  return 'LOW'
}

export function RiskBadge({ score, compact = false }: { score: number; compact?: boolean }) {
  const rounded = Math.round(score)
  const level = riskLevel(rounded)
  const st = SEVERITY_STYLES[level]
  return (
    <span role="img" aria-label={`Risk score ${rounded} out of 100, ${st.label}`} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums shadow-sm ${st.chip} ${compact ? 'bg-white/95 backdrop-blur' : ''}`.replace(compact && level !== 'CRITICAL' ? '' : 'bg-white/95 backdrop-blur', '')}>
      <span className={`h-1.5 w-1.5 rounded-full ${level === 'CRITICAL' ? 'bg-white' : st.dot}`} aria-hidden="true" />
      {rounded}
      {!compact && <span className="font-medium opacity-80">{st.label}</span>}
    </span>
  )
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const st = SEVERITY_STYLES[severity]
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${st.chip}`}>{st.label}</span>
}
