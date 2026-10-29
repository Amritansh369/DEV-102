'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { animate, motion, useReducedMotion } from 'framer-motion'
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from 'lucide-react'
import { cx } from '@/lib/adminHooks'
import { Skeleton } from './States'

type Tone = 'primary' | 'success' | 'danger' | 'warning'

const TONES: Record<Tone, { stroke: string; chip: string }> = {
  primary: { stroke: '#1E6FF0', chip: 'bg-accent/10 text-primary-600' },
  success: { stroke: '#16A34A', chip: 'bg-success/10 text-success' },
  danger: { stroke: '#DC2626', chip: 'bg-danger/10 text-danger' },
  warning: { stroke: '#F59E0B', chip: 'bg-warning/15 text-warning' },
}

function useAnimatedNumber(target: number): number {
  const reduce = useReducedMotion()
  const [shown, setShown] = useState(reduce ? target : 0)
  const from = useRef(reduce ? target : 0)

  useEffect(() => {
    if (reduce) {
      from.current = target
      setShown(target)
      return
    }
    const controls = animate(from.current, target, {
      duration: 0.9,
      ease: 'easeOut',
      onUpdate: (v) => {
        from.current = v
        setShown(v)
      },
    })
    return () => controls.stop()
  }, [target, reduce])

  return shown
}

function Sparkline({ series, color }: { series: number[]; color: string }) {
  const gid = `spark-${useId().replace(/:/g, '')}`
  if (series.length < 2) return null
  const w = 120
  const h = 40
  const min = Math.min(...series)
  const span = Math.max(...series) - min || 1
  const pts = series.map((v, i) => [(i / (series.length - 1)) * w, h - 4 - ((v - min) / span) * (h - 8)] as const)
  const line = `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')}`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-10 w-28 shrink-0" role="img" aria-label="Trend over the last 14 intervals">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w} ${h} L0 ${h} Z`} fill={`url(#${gid})`} />
      <motion.path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, ease: 'easeOut' }}
      />
    </svg>
  )
}

export interface KpiCardProps {
  label: string
  value: number
  suffix?: string
  deltaPct: number
  /** Whether an increase is a good thing (violations and risk: 'down'). */
  goodWhen?: 'up' | 'down'
  series: number[]
  icon: LucideIcon
  tone?: Tone
  hint?: string
  live?: boolean
}

export function KpiCard({ label, value, suffix, deltaPct, goodWhen = 'up', series, icon: Icon, tone = 'primary', hint = 'vs yesterday', live }: KpiCardProps) {
  const shown = useAnimatedNumber(value)
  const t = TONES[tone]
  const flat = Math.abs(deltaPct) < 0.05
  const favourable = (deltaPct >= 0) === (goodWhen === 'up')
  const TrendIcon = flat ? Minus : deltaPct > 0 ? ArrowUpRight : ArrowDownRight
  const trendText = `${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(1)}%`

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(10,77,166,0.12)]"
    >
      <div className="flex items-center justify-between">
        <span className={cx('grid h-10 w-10 place-items-center rounded-xl', t.chip)}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        {live && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-success">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" aria-hidden="true" /> Live
          </span>
        )}
      </div>
      <p className="mt-4 text-sm font-medium text-muted">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-3">
        <p className="font-heading text-3xl font-semibold tabular-nums tracking-tight text-text" aria-label={`${label}: ${value}${suffix ?? ''}`}>
          {Math.round(shown).toLocaleString('en-IN')}
          {suffix && <span className="ml-1 text-sm font-medium text-muted">{suffix}</span>}
        </p>
        <Sparkline series={series} color={t.stroke} />
      </div>
      <p className="mt-3 flex items-center gap-2 text-xs text-muted">
        <span
          aria-label={`${flat ? 'No change' : deltaPct > 0 ? 'Up' : 'Down'} ${Math.abs(deltaPct).toFixed(1)} percent ${hint}, ${favourable ? 'favourable' : 'unfavourable'}`}
          className={cx(
            'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-semibold',
            flat ? 'bg-slate-100 text-slate-600' : favourable ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger',
          )}
        >
          <TrendIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {trendText}
        </span>
        {hint}
      </p>
    </motion.article>
  )
}

export function KpiCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5" aria-hidden="true">
      <Skeleton className="h-10 w-10 rounded-xl" />
      <Skeleton className="mt-4 h-4 w-28" />
      <div className="mt-2 flex items-end justify-between">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-10 w-28" />
      </div>
      <Skeleton className="mt-3 h-5 w-32 rounded-full" />
    </div>
  )
}
