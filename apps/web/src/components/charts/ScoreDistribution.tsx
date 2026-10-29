'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'

interface ScoreDistributionProps {
  scores: number[]
  maxScore?: number
  /** Pass mark as a percentage (0-100). */
  passMark?: number
  /** Histogram bucket width as a percentage. */
  binSize?: number
}

const W = 420
const H = 210
const PAD = { l: 30, r: 10, t: 14, b: 30 }

export default function ScoreDistribution({ scores, maxScore = 100, passMark = 40, binSize = 10 }: ScoreDistributionProps) {
  const { bins, stats } = useMemo(() => {
    const count = Math.ceil(100 / binSize)
    const b = Array.from({ length: count }, (_, i) => ({ from: i * binSize, to: Math.min(100, (i + 1) * binSize), n: 0 }))
    const pcts = scores.map((s) => Math.min(100, Math.max(0, (s / maxScore) * 100)))
    pcts.forEach((p) => {
      b[Math.min(count - 1, Math.floor(p / binSize))].n++
    })
    const sorted = [...pcts].sort((a, c) => a - c)
    const mid = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : 0
    return {
      bins: b,
      stats: {
        mean: pcts.length ? pcts.reduce((a, c) => a + c, 0) / pcts.length : 0,
        median: mid,
        high: sorted.length ? sorted[sorted.length - 1] : 0,
        low: sorted.length ? sorted[0] : 0,
      },
    }
  }, [scores, maxScore, binSize])

  const peak = Math.max(1, ...bins.map((b) => b.n))
  const yMax = Math.ceil(peak / 4) * 4 || 4
  const plotW = W - PAD.l - PAD.r
  const plotH = H - PAD.t - PAD.b
  const bw = plotW / bins.length
  const base = PAD.t + plotH
  const passX = PAD.l + (passMark / 100) * plotW

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Score distribution of ${scores.length} candidates`}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = base - t * plotH
          return (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} stroke="#E2E8F0" strokeDasharray={t === 0 ? undefined : '3 3'} />
              <text x={PAD.l - 6} y={y + 3} fontSize={9} fill="#64748B" textAnchor="end">
                {Math.round(yMax * t)}
              </text>
            </g>
          )
        })}
        {bins.map((b, i) => {
          const h = (b.n / yMax) * plotH
          const x = PAD.l + i * bw + 3
          const passed = b.from >= passMark
          return (
            <g key={b.from}>
              <motion.rect
                x={x}
                width={bw - 6}
                rx={4}
                fill={passed ? '#1E6FF0' : '#F59E0B'}
                initial={{ height: 0, y: base }}
                animate={{ height: h, y: base - h }}
                transition={{ type: 'spring', stiffness: 110, damping: 20, delay: i * 0.03 }}
              >
                <title>{`${b.from}–${b.to}%: ${b.n} candidate${b.n === 1 ? '' : 's'}`}</title>
              </motion.rect>
              {b.n > 0 && (
                <text x={x + (bw - 6) / 2} y={base - h - 4} fontSize={9} fill="#0F172A" textAnchor="middle" fontWeight={600}>
                  {b.n}
                </text>
              )}
              <text x={PAD.l + i * bw + bw / 2} y={base + 13} fontSize={8.5} fill="#64748B" textAnchor="middle">
                {b.from}
              </text>
            </g>
          )
        })}
        <text x={W - PAD.r} y={base + 13} fontSize={8.5} fill="#64748B" textAnchor="end">
          100%
        </text>
        <line x1={passX} x2={passX} y1={PAD.t - 4} y2={base} stroke="#DC2626" strokeWidth={1.5} strokeDasharray="4 3" />
        <text x={passX + 4} y={PAD.t + 4} fontSize={9} fill="#DC2626" fontWeight={600}>
          Pass {passMark}%
        </text>
      </svg>
      <dl className="mt-2 grid grid-cols-4 gap-2 text-center">
        {[
          ['Mean', stats.mean],
          ['Median', stats.median],
          ['Highest', stats.high],
          ['Lowest', stats.low],
        ].map(([k, v]) => (
          <div key={k as string} className="rounded-lg bg-soft px-2 py-1.5">
            <dt className="text-[10px] uppercase tracking-wide text-muted">{k as string}</dt>
            <dd className="font-heading text-sm font-semibold text-ink tabular-nums">{(v as number).toFixed(1)}%</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
