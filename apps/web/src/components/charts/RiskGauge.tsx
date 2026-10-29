'use client'

import { motion } from 'framer-motion'

interface RiskGaugeProps {
  /** Risk score from 0 (clean) to 100 (severe). */
  value: number
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
}

const SIZES = { sm: 'w-20', md: 'w-32', lg: 'w-44' } as const

// Text-safe shades (WCAG AA on white and on their own 10% tint): the label and table chips use these as text colour.
export function riskLevel(v: number) {
  if (v >= 65) return { label: 'High', color: '#C81E1E' }
  if (v >= 35) return { label: 'Medium', color: '#A14A07' }
  return { label: 'Low', color: '#137336' }
}

export default function RiskGauge({ value, size = 'md', showLabel = true }: RiskGaugeProps) {
  const v = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0))
  const { label, color } = riskLevel(v)
  const arc = 'M 10 60 A 50 50 0 0 1 110 60'

  return (
    <div className="inline-flex flex-col items-center" role="img" aria-label={`Risk score ${Math.round(v)} out of 100, ${label}`}>
      <svg viewBox="0 0 120 72" className={SIZES[size]}>
        <path d={arc} fill="none" stroke="#E2E8F0" strokeWidth={10} strokeLinecap="round" />
        <motion.path
          d={arc}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeLinecap="round"
          pathLength={1}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: Math.max(0.001, v / 100) }}
          transition={{ type: 'spring', stiffness: 70, damping: 18 }}
        />
        <text x={60} y={57} textAnchor="middle" fontSize={22} fontWeight={600} fill="#0F172A">
          {Math.round(v)}
        </text>
      </svg>
      {showLabel && (
        <span className="-mt-1 text-[11px] font-medium" style={{ color }}>
          {label} risk
        </span>
      )}
    </div>
  )
}
