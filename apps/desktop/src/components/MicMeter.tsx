import { useEffect, useRef, useState } from 'react'

interface MicMeterProps {
  active: boolean
  onPeak?: (peak: number, mode: 'live' | 'mock') => void
}

const SEGMENTS = 24

/** Real input level via Web Audio API; falls back to a simulated signal when no microphone is available. */
export default function MicMeter({ active, onPeak }: MicMeterProps) {
  const [level, setLevel] = useState(0)
  const [mode, setMode] = useState<'live' | 'mock'>('live')
  const peakRef = useRef(0)
  const onPeakRef = useRef(onPeak)
  onPeakRef.current = onPeak

  useEffect(() => {
    if (!active) {
      setLevel(0)
      return
    }
    let cancelled = false
    let raf = 0
    let timer = 0
    let stream: MediaStream | null = null
    let ctx: AudioContext | null = null

    const report = (v: number, m: 'live' | 'mock') => {
      setLevel((prev) => prev * 0.6 + v * 0.4)
      if (v > peakRef.current) {
        peakRef.current = v
        onPeakRef.current?.(v, m)
      }
    }

    const startMock = () => {
      setMode('mock')
      let t = 0
      timer = window.setInterval(() => {
        t += 0.25
        report(Math.min(1, Math.max(0, 0.35 + Math.sin(t) * 0.25 + Math.random() * 0.2)), 'mock')
      }, 80)
    }

    navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((tr) => tr.stop())
          return
        }
        stream = s
        setMode('live')
        ctx = new AudioContext()
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        ctx.createMediaStreamSource(s).connect(analyser)
        const data = new Uint8Array(analyser.fftSize)
        const loop = () => {
          analyser.getByteTimeDomainData(data)
          let sum = 0
          for (let i = 0; i < data.length; i++) {
            const n = (data[i] - 128) / 128
            sum += n * n
          }
          report(Math.min(1, Math.sqrt(sum / data.length) * 4), 'live')
          raf = requestAnimationFrame(loop)
        }
        loop()
      })
      .catch(() => {
        if (!cancelled) startMock()
      })
    if (!navigator.mediaDevices) startMock()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      window.clearInterval(timer)
      stream?.getTracks().forEach((tr) => tr.stop())
      void ctx?.close()
      peakRef.current = 0
    }
  }, [active])

  const lit = Math.round(level * SEGMENTS)
  return (
    <div>
      <div className="flex h-6 items-end gap-0.5" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
        {Array.from({ length: SEGMENTS }, (_, i) => {
          const on = i < lit
          const color = i > SEGMENTS * 0.8 ? 'bg-danger' : i > SEGMENTS * 0.6 ? 'bg-warning' : 'bg-success'
          return <span key={i} className={`w-full rounded-sm transition-all duration-75 ${on ? color : 'bg-soft'}`} style={{ height: `${40 + (i / SEGMENTS) * 60}%` }} />
        })}
      </div>
      <p className="mt-1 text-[11px] text-muted">
        {mode === 'mock' ? 'Simulated signal (no microphone detected in this environment)' : 'Say “Hello” in your normal voice'}
      </p>
    </div>
  )
}
