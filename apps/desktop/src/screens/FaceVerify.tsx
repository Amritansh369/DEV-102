import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ArrowLeft, ArrowRight, Camera, CheckCircle2, Eye, Loader2, Mail, RefreshCw, ScanFace, ShieldCheck, type LucideIcon } from 'lucide-react'
import { api, devOtpHint } from '../lib/api'
import { FaceOverlay, type DetectionMode, type LivenessStep, type OverlayStatus } from '../components/FaceOverlay'
import { OtpInput } from '../components/OtpInput'

type Phase = 'intro' | 'liveness' | 'matching' | 'result' | 'otp' | 'done'
type CamState = 'requesting' | 'ready' | 'denied' | 'error'
type Notify = (kind: 'success' | 'error' | 'info', message: string) => void

interface FaceVerifyProps {
  onVerified: () => void
  onBack?: () => void
  notify?: Notify
}

const HOLD_MS = 1800
const MIN_CONFIDENCE = 0.85
const MAX_ATTEMPTS = 3

const STEPS: { id: LivenessStep; label: string; hint: string; Icon: LucideIcon }[] = [
  { id: 'centre', label: 'Centre your face', hint: 'Look straight at the camera inside the oval.', Icon: ScanFace },
  { id: 'left', label: 'Turn your head left', hint: 'Slowly turn to your left and hold still.', Icon: ArrowLeft },
  { id: 'right', label: 'Turn your head right', hint: 'Slowly turn to your right and hold still.', Icon: ArrowRight },
  { id: 'blink', label: 'Blink twice', hint: 'Look at the camera and blink naturally.', Icon: Eye },
]

function ProgressRing({ value }: { value: number }) {
  const r = 38
  const c = 2 * Math.PI * r
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-label="Liveness progress">
      <circle cx="48" cy="48" r={r} fill="none" stroke="#E2E8F0" strokeWidth="8" />
      <circle cx="48" cy="48" r={r} fill="none" stroke="#1E6FF0" strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value)} transform="rotate(-90 48 48)" style={{ transition: 'stroke-dashoffset 0.15s linear' }} />
      <text x="48" y="54" textAnchor="middle" className="fill-text font-heading text-lg font-semibold">{Math.round(value * 100)}%</text>
    </svg>
  )
}

export default function FaceVerify({ onVerified, onBack, notify }: FaceVerifyProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cam, setCam] = useState<CamState>('requesting')
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState('')
  const [phase, setPhase] = useState<Phase>('intro')
  const [stepIndex, setStepIndex] = useState(0)
  const [hold, setHold] = useState(0)
  const [found, setFound] = useState(false)
  const [mode, setMode] = useState<DetectionMode>('simulated')
  const [attempts, setAttempts] = useState(0)
  const [result, setResult] = useState<{ match: boolean; confidence: number } | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<string | null>(null)
  const [maskedEmail, setMaskedEmail] = useState('')
  const [devCode, setDevCode] = useState<string | undefined>(undefined)
  const [otpError, setOtpError] = useState(0)
  const [otpBusy, setOtpBusy] = useState(false)
  const [otpLocked, setOtpLocked] = useState(false)

  const say = useCallback<Notify>((k, m) => notify?.(k, m), [notify])

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  const startCamera = useCallback(async (id?: string) => {
    stopStream()
    setCam('requesting')
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: id ? { exact: id } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      })
      streamRef.current = s
      if (videoRef.current) {
        videoRef.current.srcObject = s
        await videoRef.current.play().catch(() => undefined)
      }
      setDeviceId(s.getVideoTracks()[0]?.getSettings().deviceId ?? '')
      setDevices((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput'))
      setCam('ready')
    } catch (e) {
      setCam(e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'denied' : 'error')
    }
  }, [])

  useEffect(() => {
    void startCamera()
    return stopStream
  }, [startCamera])

  const onDetection = useCallback((f: boolean, m: DetectionMode) => {
    setFound(f)
    setMode(m)
  }, [])

  // Grab a mirrored frame and reject obviously unusable images (too dark / blown out).
  const captureFrame = (): { ok: true; dataUrl: string } | { ok: false; reason: string } => {
    const v = videoRef.current
    if (!v || v.videoWidth === 0) return { ok: false, reason: 'The camera is not delivering frames.' }
    const c = document.createElement('canvas')
    c.width = 640
    c.height = Math.round((640 * v.videoHeight) / v.videoWidth)
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return { ok: false, reason: 'Could not process the camera image.' }
    ctx.translate(c.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(v, 0, 0, c.width, c.height)
    const { data } = ctx.getImageData(0, 0, c.width, c.height)
    let sum = 0
    for (let i = 0; i < data.length; i += 16) sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
    const mean = sum / (data.length / 16)
    if (mean < 35) return { ok: false, reason: 'The image is too dark. Face a light source and try again.' }
    if (mean > 235) return { ok: false, reason: 'The image is overexposed. Move away from direct light and try again.' }
    return { ok: true, dataUrl: c.toDataURL('image/jpeg', 0.85) }
  }

  const runMatch = useCallback(async () => {
    setPhase('matching')
    setResult(null)
    setFailure(null)
    setAttempts((a) => a + 1)
    const frame = captureFrame()
    if (!frame.ok) {
      setFailure(frame.reason)
      setPhase('result')
      return
    }
    setSnapshot(frame.dataUrl)
    try {
      const r = await api.verifyFace({ image: frame.dataUrl })
      setResult(r)
      if (r.reason) say(r.match ? 'info' : 'error', r.reason)
    } catch {
      setFailure('We could not reach the verification service. Check your connection and retry.')
    }
    setPhase('result')
  }, [say])

  // Liveness: accumulate hold time while a face is present; reset if it disappears.
  useEffect(() => {
    if (phase !== 'liveness') return
    const id = window.setInterval(() => {
      setHold((h) => {
        if (!found) return 0
        return Math.min(h + 100, HOLD_MS)
      })
    }, 100)
    return () => window.clearInterval(id)
  }, [phase, found])

  useEffect(() => {
    if (phase !== 'liveness' || hold < HOLD_MS) return
    if (stepIndex < STEPS.length - 1) {
      setStepIndex((i) => i + 1)
      setHold(0)
    } else {
      void runMatch()
    }
  }, [hold, phase, stepIndex, runMatch])

  const beginLiveness = () => {
    setStepIndex(0)
    setHold(0)
    setResult(null)
    setFailure(null)
    setPhase('liveness')
  }

  const passed = result !== null && result.match && result.confidence >= MIN_CONFIDENCE
  const exhausted = !passed && attempts >= MAX_ATTEMPTS

  const sendOtp = useCallback(async () => {
    try {
      const r = await api.requestOtp()
      setMaskedEmail(r.sentTo)
      // Only a non-production API returns the code.
      setDevCode(devOtpHint())
      say('info', `A 6-digit code was sent to ${r.sentTo}`)
    } catch {
      say('error', 'Could not send the code. Please tap Resend.')
    }
  }, [say])

  useEffect(() => {
    if (phase === 'otp') void sendOtp()
  }, [phase, sendOtp])

  const submitOtp = async (code: string) => {
    setOtpBusy(true)
    try {
      const r = await api.verifyOtp(code)
      if (r.ok) {
        setPhase('done')
        say('success', 'Identity verified')
        window.setTimeout(onVerified, 900)
      } else {
        setOtpError((n) => n + 1)
        if (r.attemptsLeft === 0) setOtpLocked(true)
        say('error', r.attemptsLeft !== undefined ? `Incorrect code. ${r.attemptsLeft} attempt(s) left.` : 'Incorrect code.')
      }
    } catch {
      setOtpError((n) => n + 1)
      say('error', 'Verification failed. Please try again.')
    } finally {
      setOtpBusy(false)
    }
  }

  const overlayStatus: OverlayStatus = useMemo(() => {
    if (phase === 'liveness' || phase === 'matching') return 'scanning'
    if (phase === 'result') return passed ? 'captured' : 'failed'
    if (phase === 'otp' || phase === 'done') return 'captured'
    return 'idle'
  }, [phase, passed])

  const ringValue = phase === 'liveness' ? (stepIndex + hold / HOLD_MS) / STEPS.length : phase === 'intro' ? 0 : 1
  const current = STEPS[stepIndex]

  return (
    <div className="mx-auto grid min-h-full w-full max-w-6xl grid-cols-1 gap-8 p-8 lg:grid-cols-[1.25fr_1fr]">
      {/* Camera stage */}
      <section aria-label="Camera preview">
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-slate-900 shadow-xl ring-1 ring-border">
          <video ref={videoRef} muted playsInline className="absolute inset-0 h-full w-full -scale-x-100 object-cover" aria-label="Your webcam preview" />
          {cam === 'ready' && <FaceOverlay videoRef={videoRef} step={current.id} status={overlayStatus} onDetection={onDetection} />}
          {cam === 'requesting' && (
            <div className="absolute inset-0 grid place-items-center bg-slate-900 text-white" role="status">
              <div className="flex flex-col items-center gap-3"><Loader2 className="h-8 w-8 animate-spin" /><span className="text-sm">Starting camera…</span></div>
            </div>
          )}
          {(cam === 'denied' || cam === 'error') && (
            <div className="absolute inset-0 grid place-items-center bg-slate-900 p-8 text-center text-white" role="alert">
              <div className="max-w-sm space-y-3">
                <Camera className="mx-auto h-10 w-10 text-warning" />
                <p className="font-heading text-lg font-semibold">{cam === 'denied' ? 'Camera access is blocked' : 'No working camera found'}</p>
                <p className="text-sm text-slate-300">{cam === 'denied' ? 'Allow camera access for this app in your system privacy settings, then retry.' : 'Connect a webcam or close other apps that may be using it, then retry.'}</p>
                <button onClick={() => void startCamera(deviceId || undefined)} className="inline-flex items-center gap-2 rounded-xl bg-cta px-4 py-2 text-sm font-semibold text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-cta/40"><RefreshCw className="h-4 w-4" />Retry camera</button>
              </div>
            </div>
          )}
          {phase === 'liveness' && cam === 'ready' && (
            <div className="absolute inset-x-0 bottom-4 flex justify-center">
              <motion.div key={current.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-sm font-semibold text-text shadow-lg" role="status">
                <current.Icon className="h-4 w-4 text-accent" />{found ? current.label : 'Face not detected, move into the oval'}
              </motion.div>
            </div>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-muted">
          <span>{mode === 'face-api' ? 'On-device face landmarks active' : 'Simulated landmark preview'}</span>
          {devices.length > 1 && (
            <label className="flex items-center gap-2">
              <span className="sr-only">Choose camera</span>
              <select value={deviceId} onChange={(e) => { setDeviceId(e.target.value); void startCamera(e.target.value) }} disabled={phase === 'liveness' || phase === 'matching'} className="rounded-lg border border-border bg-white px-2 py-1 text-xs text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                {devices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>)}
              </select>
            </label>
          )}
        </div>
      </section>

      {/* Step panel */}
      <section className="flex flex-col rounded-2xl border border-border bg-white p-8 shadow-sm" aria-live="polite">
        <AnimatePresence mode="wait">
          {phase === 'intro' && (
            <motion.div key="intro" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-soft text-primary"><ScanFace className="h-6 w-6" /></div>
              <h1 className="font-heading text-2xl font-semibold text-text">Verify your identity</h1>
              <p className="text-muted">We compare a live capture with the photo registered for your exam. It takes about 10 seconds.</p>
              <ul className="space-y-2 text-sm text-text">
                {['Sit in a well-lit room, facing the light', 'Remove caps, masks and sunglasses', 'Keep your face inside the oval throughout'].map((t) => (
                  <li key={t} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success" />{t}</li>
                ))}
              </ul>
              <div className="flex gap-3 pt-2">
                {onBack && <button onClick={onBack} className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-text hover:bg-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/30">Back</button>}
                <button onClick={beginLiveness} disabled={cam !== 'ready'} className="flex-1 rounded-xl bg-cta px-5 py-2.5 text-sm font-semibold text-slate-900 shadow-sm transition hover:brightness-95 focus:outline-none focus-visible:ring-4 focus-visible:ring-cta/40 disabled:cursor-not-allowed disabled:opacity-50">Start face check</button>
              </div>
            </motion.div>
          )}

          {phase === 'liveness' && (
            <motion.div key="live" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
              <div className="flex items-center gap-4">
                <ProgressRing value={ringValue} />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-accent">Step {stepIndex + 1} of {STEPS.length}</p>
                  <h2 className="font-heading text-xl font-semibold text-text">{current.label}</h2>
                  <p className="text-sm text-muted">{current.hint}</p>
                </div>
              </div>
              <ol className="space-y-2">
                {STEPS.map((s, i) => (
                  <li key={s.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm ${i === stepIndex ? 'border-accent bg-soft text-text' : i < stepIndex ? 'border-success/30 bg-success/5 text-text' : 'border-border text-muted'}`}>
                    {i < stepIndex ? <CheckCircle2 className="h-4 w-4 text-success" /> : <s.Icon className="h-4 w-4" />}{s.label}
                  </li>
                ))}
              </ol>
            </motion.div>
          )}

          {phase === 'matching' && (
            <motion.div key="match" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center" role="status">
              <Loader2 className="h-10 w-10 animate-spin text-accent" />
              <p className="font-heading text-lg font-semibold text-text">Matching with your registered photo…</p>
              <p className="text-sm text-muted">Please keep your face in view.</p>
            </motion.div>
          )}

          {phase === 'result' && (
            <motion.div key="result" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
              {failure ? (
                <div role="alert" className="flex gap-3 rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-text"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />{failure}</div>
              ) : result && (
                <>
                  <div className="flex items-center gap-4">
                    {snapshot && <img src={snapshot} alt="Captured verification frame" className="h-20 w-20 rounded-xl object-cover ring-2 ring-border" />}
                    <div>
                      <p className={`flex items-center gap-2 font-heading text-xl font-semibold ${passed ? 'text-success' : 'text-danger'}`}>
                        {passed ? <ShieldCheck className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}{passed ? 'Face matched' : 'Face did not match'}
                      </p>
                      <p className="text-sm text-muted">Confidence {(result.confidence * 100).toFixed(1)}% (needs {Math.round(MIN_CONFIDENCE * 100)}%+)</p>
                    </div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-border" aria-hidden="true">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${result.confidence * 100}%` }} className={`h-full ${passed ? 'bg-success' : 'bg-danger'}`} />
                  </div>
                </>
              )}
              {exhausted && <p role="alert" className="text-sm text-danger">Maximum attempts reached. Please contact your invigilator for manual verification.</p>}
              <div className="flex gap-3">
                {passed ? (
                  <button onClick={() => setPhase('otp')} className="flex-1 rounded-xl bg-cta px-5 py-2.5 text-sm font-semibold text-slate-900 shadow-sm hover:brightness-95 focus:outline-none focus-visible:ring-4 focus-visible:ring-cta/40">Continue to OTP</button>
                ) : (
                  <button onClick={beginLiveness} disabled={exhausted} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/40 disabled:opacity-50"><RefreshCw className="h-4 w-4" />Try again ({Math.max(MAX_ATTEMPTS - attempts, 0)} left)</button>
                )}
              </div>
            </motion.div>
          )}

          {phase === 'otp' && (
            <motion.div key="otp" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-soft text-primary"><Mail className="h-6 w-6" /></div>
              <div>
                <h2 className="font-heading text-2xl font-semibold text-text">Enter the one-time code</h2>
                <p className="mt-1 text-sm text-muted">{maskedEmail ? <>We sent a 6-digit code to <span className="font-semibold text-text">{maskedEmail}</span>.</> : 'Sending your code…'}</p>
              </div>
              {devCode && (
                <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <span className="text-xs font-medium text-amber-800">Test server code</span>
                  <span className="font-heading text-xl font-semibold tracking-[0.3em] text-amber-900 tabular-nums">{devCode}</span>
                </div>
              )}
              <OtpInput disabled={otpBusy || otpLocked} errorSignal={otpError} onComplete={(c) => void submitOtp(c)} onResend={sendOtp} />
              {otpBusy && <p className="flex items-center justify-center gap-2 text-sm text-muted" role="status"><Loader2 className="h-4 w-4 animate-spin" />Verifying…</p>}
              {otpLocked && <p role="alert" className="text-center text-sm text-danger">Too many incorrect attempts. Contact your invigilator.</p>}
            </motion.div>
          )}

          {phase === 'done' && (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center" role="status">
              <CheckCircle2 className="h-14 w-14 text-success" />
              <p className="font-heading text-xl font-semibold text-text">You're verified</p>
              <p className="text-sm text-muted">Taking you to the consent screen…</p>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  )
}
