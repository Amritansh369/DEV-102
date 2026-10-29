import { motion } from 'framer-motion'

interface SpeedGaugeProps {
  value: number
  max?: number
  running?: boolean
  latencyMs?: number
}

export default function SpeedGauge({ value, max = 100, running = false, latencyMs }: SpeedGaugeProps) {
  const frac = Math.min(1, Math.max(0, value / max))
  const color = value < 2 ? '#DC2626' : value < 5 ? '#F59E0B' : '#1E6FF0'
  const arc = 'M 20 110 A 90 90 0 0 1 200 110'

  return (
    <div className="flex items-center gap-4" role="img" aria-label={`Network speed ${value.toFixed(1)} megabits per second`}>
      <svg viewBox="0 0 220 125" className="w-48 shrink-0">
        <path d={arc} fill="none" stroke="#E2E8F0" strokeWidth={14} strokeLinecap="round" />
        <motion.path d={arc} fill="none" stroke={color} strokeWidth={14} strokeLinecap="round" pathLength={1} animate={{ pathLength: frac }} transition={{ type: 'spring', stiffness: 80, damping: 18 }} />
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const a = Math.PI * (1 - t)
          return (
            <text key={t} x={110 + 104 * Math.cos(a)} y={112 - 104 * Math.sin(a) + 4} fontSize={8} fill="#64748B" textAnchor="middle">
              {Math.round(max * t)}
            </text>
          )
        })}
        <motion.g style={{ transformOrigin: '110px 110px' }} animate={{ rotate: -90 + frac * 180 }} transition={{ type: 'spring', stiffness: 80, damping: 14 }}>
          <line x1={110} y1={110} x2={110} y2={38} stroke="#0F172A" strokeWidth={3} strokeLinecap="round" />
        </motion.g>
        <circle cx={110} cy={110} r={7} fill="#0A4DA6" />
      </svg>
      <div>
        <p className="font-heading text-3xl font-semibold text-ink tabular-nums">
          {value.toFixed(1)} <span className="text-sm font-medium text-muted">Mbps</span>
        </p>
        <p className="text-xs text-muted">{running ? 'Measuring download speed…' : 'Download speed'}</p>
        {latencyMs !== undefined && <p className="mt-1 text-xs text-muted">Latency {latencyMs} ms</p>}
      </div>
    </div>
  )
}
