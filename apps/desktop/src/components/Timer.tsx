import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { AlarmClock } from 'lucide-react'

interface TimerProps {
  /** Epoch ms when the exam ends. Using a deadline instead of a counter prevents drift. */
  endsAt: number
  /** While paused (offline) the clock holds its value and never expires; the caller moves endsAt on resume. */
  paused?: boolean
  onExpire: () => void
  onThreshold?: (minutesLeft: 10 | 5 | 1) => void
}

const THRESHOLDS = [10, 5, 1] as const

export function formatClock(totalSec: number): string {
  const s = Math.max(0, totalSec)
  const h = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

const TONES = {
  normal: 'border-border bg-white text-ink',
  warn: 'border-amber-200 bg-amber-50 text-amber-700',
  urgent: 'border-orange-300 bg-orange-50 text-orange-700',
  danger: 'border-red-300 bg-red-50 text-danger',
} as const

export default function Timer({ endsAt, paused = false, onExpire, onThreshold }: TimerProps) {
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)))
  const [notice, setNotice] = useState<string | null>(null)
  const fired = useRef(new Set<number>())
  const primed = useRef(false)
  const expired = useRef(false)
  const callbacks = useRef({ onExpire, onThreshold })
  callbacks.current = { onExpire, onThreshold }
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (paused) {
      setLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)))
      return
    }
    fired.current = new Set()
    primed.current = false
    expired.current = false
    let noticeTimer = 0

    const tick = () => {
      const rem = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
      setLeft(rem)
      if (!primed.current) {
        // Resuming mid-exam must not replay thresholds that were already passed.
        primed.current = true
        THRESHOLDS.forEach((t) => {
          if (rem <= t * 60) fired.current.add(t)
        })
      } else {
        for (const t of THRESHOLDS) {
          if (rem > 0 && rem <= t * 60 && !fired.current.has(t)) {
            fired.current.add(t)
            setNotice(t === 1 ? 'Only 1 minute left. Your exam will be submitted automatically.' : `${t} minutes remaining. Review your flagged questions.`)
            window.clearTimeout(noticeTimer)
            noticeTimer = window.setTimeout(() => setNotice(null), 7000)
            callbacks.current.onThreshold?.(t)
          }
        }
      }
      if (rem === 0 && !expired.current) {
        expired.current = true
        callbacks.current.onExpire()
      }
    }

    tick()
    const id = window.setInterval(tick, 250)
    return () => {
      window.clearInterval(id)
      window.clearTimeout(noticeTimer)
    }
  }, [endsAt, paused])

  const tone = left <= 60 ? 'danger' : left <= 300 ? 'urgent' : left <= 600 ? 'warn' : 'normal'
  const pulse = left > 0 && left <= 60 && !reduceMotion

  return (
    <div className="relative">
      <motion.div
        role="timer"
        aria-label={`Time remaining: ${Math.floor(left / 60)} minutes ${left % 60} seconds${paused ? ', paused' : ''}`}
        animate={pulse ? { scale: [1, 1.07, 1] } : { scale: 1 }}
        transition={pulse ? { repeat: Infinity, duration: 1, ease: 'easeInOut' } : { duration: 0.2 }}
        className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 ${TONES[tone]}`}
      >
        <AlarmClock className="h-4 w-4" aria-hidden />
        <span className="font-heading text-lg font-semibold tabular-nums">{formatClock(left)}</span>
        {paused && <span className="text-[11px] font-semibold uppercase tracking-wide">Paused</span>}
      </motion.div>
      <AnimatePresence>
        {notice && (
          <motion.p
            role="status"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`absolute right-0 top-full z-40 mt-2 w-64 rounded-xl border px-3 py-2 text-xs font-medium shadow-lg ${TONES[tone]}`}
          >
            {notice}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}
