import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Gauge, Mic, RotateCw } from 'lucide-react'
import CheckRow, { CheckStatus } from '../components/CheckRow'
import MicMeter from '../components/MicMeter'
import SpeedGauge from '../components/SpeedGauge'
import { measureNetwork } from '../lib/http'

type CheckId = 'camera' | 'mic' | 'network'
interface Result {
  status: CheckStatus
  detail?: string
  hint?: string
}

const ORDER: CheckId[] = ['camera', 'mic', 'network']
const MIC_WINDOW_MS = 6000
const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms))

interface SystemCheckProps {
  onContinue: () => void
  onBack?: () => void
}

export default function SystemCheck({ onContinue, onBack }: SystemCheckProps) {
  const [results, setResults] = useState<Record<CheckId, Result>>(() => Object.fromEntries(ORDER.map((id) => [id, { status: 'idle' }])) as Record<CheckId, Result>)
  const [progress, setProgress] = useState<Partial<Record<CheckId, number>>>({})
  const [speed, setSpeed] = useState({ value: 0, latency: undefined as number | undefined })
  const [micActive, setMicActive] = useState(false)
  const [running, setRunning] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const micPeak = useRef(0)
  const cancelled = useRef(false)

  const set = useCallback((id: CheckId, r: Result) => setResults((prev) => ({ ...prev, [id]: r })), [])
  const prog = useCallback((id: CheckId, v: number) => setProgress((p) => ({ ...p, [id]: v })), [])

  const checks: Record<CheckId, () => Promise<Result>> = {
    async camera() {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
        const label = stream.getVideoTracks()[0]?.label || 'Webcam'
        return { status: 'pass', detail: `${label} is working` }
      } catch (e) {
        const denied = e instanceof DOMException && e.name === 'NotAllowedError'
        return {
          status: 'fail',
          detail: denied ? 'Camera permission was denied' : 'No camera could be opened',
          hint: denied ? 'Allow camera access in system privacy settings, then press Retry.' : 'Plug in a webcam, close other apps using it (Zoom, Teams) and press Retry.',
        }
      }
    },
    async mic() {
      micPeak.current = 0
      setMicActive(true)
      const start = Date.now()
      while (Date.now() - start < MIC_WINDOW_MS && micPeak.current < 0.12 && !cancelled.current) {
        prog('mic', ((Date.now() - start) / MIC_WINDOW_MS) * 100)
        await wait(100)
      }
      const heard = micPeak.current >= 0.12
      if (!heard) setMicActive(false)
      return heard
        ? { status: 'pass', detail: 'Voice detected at a healthy level' }
        : { status: 'warn', detail: 'No clear voice detected', hint: 'Speak at normal volume, check that the right microphone is selected and it is not muted, then Retry.' }
    },
    async network() {
      setSpeed({ value: 0, latency: undefined })
      try {
        const r = await measureNetwork((mbps, pct) => {
          setSpeed({ value: mbps, latency: undefined })
          prog('network', pct)
        })
        setSpeed({ value: r.mbps, latency: r.latencyMs })
        if (r.mbps < 5 || r.latencyMs > 400) return { status: 'warn', detail: `${r.mbps.toFixed(1)} Mbps · ${r.latencyMs} ms latency is borderline`, hint: 'At least 5 Mbps is recommended for webcam and screen streaming. Close other network-heavy apps and Retry.' }
        return { status: 'pass', detail: `${r.mbps.toFixed(1)} Mbps · ${r.latencyMs} ms latency to the exam server` }
      } catch {
        return { status: 'fail', detail: 'The exam server could not be reached', hint: 'Check your internet connection, then Retry.' }
      }
    },
  }

  const runOne = useCallback(
    async (id: CheckId) => {
      set(id, { status: 'running' })
      prog(id, 0)
      try {
        set(id, await checksRef.current[id]())
      } catch {
        set(id, { status: 'fail', detail: 'The check could not complete', hint: 'Press Retry. If it keeps failing, restart the app.' })
      }
      if (id === 'mic') setMicActive(false)
    },
    [set, prog],
  )
  const checksRef = useRef(checks)
  checksRef.current = checks

  const runAll = useCallback(async () => {
    cancelled.current = false
    setRunning(true)
    for (const id of ORDER) {
      if (cancelled.current) break
      await runOne(id)
      await wait(250)
    }
    setRunning(false)
  }, [runOne])

  useEffect(() => {
    void runAll()
    return () => {
      cancelled.current = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [runAll])

  const passed = ORDER.filter((id) => results[id].status === 'pass').length
  // Only a camera that will not open or an unreachable server stop the exam; anything else is just shown.
  const canContinue = !running && ORDER.every((id) => results[id].status !== 'fail' && results[id].status !== 'idle')
  const rowProps = (id: CheckId) => ({ status: results[id].status, detail: results[id].detail, hint: results[id].hint, progress: progress[id], onRetry: () => void runOne(id) })

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-white/85 px-8 py-5 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-6">
          <div>
            <h1 className="font-heading text-xl font-semibold text-ink">System check</h1>
            <p className="text-sm text-muted">We check that your camera, microphone and connection work.</p>
          </div>
          <div className="w-64">
            <div className="flex justify-between text-xs font-medium text-muted">
              <span>{passed} of {ORDER.length} passed</span>
              <span>{Math.round((passed / ORDER.length) * 100)}%</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-soft" role="progressbar" aria-valuenow={passed} aria-valuemin={0} aria-valuemax={ORDER.length}>
              <div className="h-full rounded-full bg-gradient-to-r from-primary-600 to-accent transition-all duration-500" style={{ width: `${(passed / ORDER.length) * 100}%` }} />
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-2">
          <CheckRow title="Camera" description="Your face must be clearly visible" icon={<Camera className="h-5 w-5" />} {...rowProps('camera')}>
            <video ref={videoRef} autoPlay muted playsInline aria-label="Camera preview" className="aspect-video w-full rounded-xl bg-ink/90 object-cover [transform:scaleX(-1)]" />
          </CheckRow>

          <CheckRow title="Microphone" description="Speak to test your input level" icon={<Mic className="h-5 w-5" />} {...rowProps('mic')}>
            <MicMeter active={micActive || results.mic.status === 'running'} onPeak={(p) => { micPeak.current = Math.max(micPeak.current, p) }} />
          </CheckRow>

          <CheckRow title="Network speed" description="Minimum 5 Mbps recommended" icon={<Gauge className="h-5 w-5" />} {...rowProps('network')}>
            <SpeedGauge value={speed.value} running={results.network.status === 'running'} latencyMs={speed.latency} />
          </CheckRow>
        </div>
      </main>

      <footer className="border-t border-border bg-white px-8 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex gap-2">
            {onBack && <button type="button" onClick={onBack} className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted hover:bg-soft focus-visible:outline-2 focus-visible:outline-accent">Back</button>}
            <button type="button" onClick={() => void runAll()} disabled={running} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-primary hover:bg-soft focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50">
              <RotateCw className={`h-4 w-4 ${running ? 'animate-spin' : ''}`} aria-hidden /> Run all again
            </button>
          </div>
          <div className="flex items-center gap-3">
            {!canContinue && <span className="text-xs text-muted">{running ? 'Running checks…' : 'Fix the failed check to continue'}</span>}
            <button type="button" onClick={onContinue} disabled={!canContinue} className="rounded-xl bg-cta px-6 py-2.5 text-sm font-semibold text-ink shadow-sm hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50">
              Continue to face verification
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}
