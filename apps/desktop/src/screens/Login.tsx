import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { AlertCircle, Clock3, Eye, EyeOff, Loader2, Lock, ShieldCheck, Video, Wifi, WifiOff } from 'lucide-react'
import { api } from '../lib/api'

const schema = z.object({
  examId: z.string().trim().min(3, 'Choose your exam').regex(/^[A-Za-z0-9-]+$/, 'Select a valid exam'),
  userId: z.string().trim().min(3, 'User ID must be at least 3 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  remember: z.boolean(),
})
type FormValues = z.infer<typeof schema>

const MAX_ATTEMPTS = 5
const LOCK_SECONDS = 30
const REMEMBER_KEY = 'dev102.examId'

interface LoginProps {
  onLoggedIn: (session: { examId: string; userId: string }) => void
}

interface ServerState {
  online: boolean
  latencyMs: number
}

type TimeTheme = 'morning' | 'evening' | 'night'

function getTimeTheme(date: Date): TimeTheme {
  const hour = date.getHours()
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 18) return 'evening'
  return 'night'
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function Login({ onLoggedIn }: LoginProps) {
  const [showPw, setShowPw] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [attempts, setAttempts] = useState(0)
  const [lockUntil, setLockUntil] = useState<number | null>(null)
  const [remaining, setRemaining] = useState(0)
  const [server, setServer] = useState<ServerState | null>(null)
  const [exams, setExams] = useState<Awaited<ReturnType<typeof api.availableExams>>>([])
  const [examsLoading, setExamsLoading] = useState(true)
  const [examsError, setExamsError] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())

  const savedExam = typeof localStorage !== 'undefined' ? localStorage.getItem(REMEMBER_KEY) ?? '' : ''
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { examId: savedExam, userId: '', password: '', remember: savedExam !== '' },
  })

  const pingServer = useCallback(async () => {
    try {
      setServer(await api.serverStatus())
    } catch {
      setServer({ online: false, latencyMs: 0 })
    }
  }, [])

  const loadExams = useCallback(async () => {
    setExamsLoading(true)
    setExamsError(null)
    try {
      const list = await api.availableExams()
      setExams(list)
      if (savedExam && !list.some((exam) => exam.code === savedExam)) setValue('examId', '')
    } catch (e) {
      setExamsError(e instanceof Error ? e.message : 'Could not load available exams.')
    } finally {
      setExamsLoading(false)
    }
  }, [savedExam, setValue])

  useEffect(() => {
    void pingServer()
    const id = window.setInterval(() => void pingServer(), 15000)
    return () => window.clearInterval(id)
  }, [pingServer])

  useEffect(() => {
    void loadExams()
  }, [loadExams])

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!lockUntil) return
    const tick = () => {
      const left = Math.ceil((lockUntil - Date.now()) / 1000)
      if (left <= 0) {
        setLockUntil(null)
        setAttempts(0)
        setRemaining(0)
        setFormError(null)
      } else setRemaining(left)
    }
    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [lockUntil])

  const locked = lockUntil !== null
  const offline = server?.online === false
  const timeTheme = getTimeTheme(now)
  const backgroundImage = `/images/${timeTheme}.png`
  const timeLabel = timeTheme === 'morning' ? 'Good morning' : timeTheme === 'evening' ? 'Good evening' : 'Good night'

  const onSubmit = async (v: FormValues) => {
    setFormError(null)
    try {
      await api.login({ examId: v.examId, userId: v.userId, password: v.password })
      if (v.remember) localStorage.setItem(REMEMBER_KEY, v.examId)
      else localStorage.removeItem(REMEMBER_KEY)
      onLoggedIn({ examId: v.examId, userId: v.userId })
    } catch (e) {
      const next = attempts + 1
      setAttempts(next)
      if (next >= MAX_ATTEMPTS) {
        setLockUntil(Date.now() + LOCK_SECONDS * 1000)
        setFormError('Too many failed attempts. Sign-in is temporarily locked.')
      } else {
        const msg = e instanceof Error ? e.message : 'Sign-in failed'
        setFormError(`${msg} (${MAX_ATTEMPTS - next} attempt${MAX_ATTEMPTS - next === 1 ? '' : 's'} left)`)
      }
    }
  }

  const inputCls = (bad: boolean) =>
    `mt-1 w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/70 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:bg-soft ${bad ? 'border-danger' : 'border-border'}`

  return (
    <div className="grid h-full min-h-[700px] grid-cols-1 bg-white lg:grid-cols-[1.05fr_1fr]">
      <aside
        className="relative hidden overflow-hidden bg-cover bg-center p-12 text-white transition-[background-image] duration-700 lg:flex lg:flex-col lg:justify-between"
        style={{ backgroundImage: `linear-gradient(135deg, rgba(10, 77, 166, .9), rgba(11, 91, 211, .72) 55%, rgba(30, 111, 240, .78)), url('${backgroundImage}')` }}
      >
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:22px_22px]" aria-hidden />
        <div className="relative flex items-center gap-3">
          <img src="/images/logo.png" alt="Where U Elevate" className="h-10 w-auto rounded bg-white/90 p-1" onError={(e) => (e.currentTarget.style.display = 'none')} />
          <span className="font-heading text-lg font-semibold">Smart Proctor</span>
        </div>
        <div className="relative max-w-md">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium ring-1 ring-white/20 backdrop-blur">
            <Clock3 className="h-3.5 w-3.5" aria-hidden /> {timeLabel} · {formatTime(now)}
          </p>
          <h1 className="font-heading text-4xl font-semibold leading-tight">Your secure exam, one sign-in away.</h1>
          <p className="mt-4 text-white/80">Use the Exam ID and credentials from your invitation email. The app locks your device into exam mode once checks are complete.</p>
          <ul className="mt-8 space-y-3 text-sm">
            {[
              [ShieldCheck, 'Encrypted, tamper-aware exam browser'],
              [Video, 'Webcam and screen monitoring during the test'],
              [Lock, 'Only approved sites open inside the sandbox'],
            ].map(([Icon, text]) => {
              const I = Icon as typeof ShieldCheck
              return (
                <li key={text as string} className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15"><I className="h-4 w-4" aria-hidden /></span>
                  {text as string}
                </li>
              )
            })}
          </ul>
        </div>
        <p className="relative text-xs text-white/60">© Where U Elevate · DEV102 Assessment Platform</p>
      </aside>

      <main className="flex items-center justify-center p-8">
        <motion.form
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="w-full max-w-sm"
          aria-label="Candidate sign in"
        >
          <div className="mb-6 flex items-center justify-between">
            <h2 className="font-heading text-2xl font-semibold text-ink">Candidate sign in</h2>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${server === null ? 'bg-soft text-muted' : offline ? 'bg-red-50 text-danger' : 'bg-green-50 text-success'}`}
              role="status"
            >
              {offline ? <WifiOff className="h-3 w-3" aria-hidden /> : <Wifi className="h-3 w-3" aria-hidden />}
              {server === null ? 'Checking server…' : offline ? 'Server offline' : `Server online · ${server.latencyMs} ms`}
            </span>
          </div>

          <label className="block text-sm font-medium text-ink">
            Select exam
            {/* required makes the select :invalid while the placeholder is shown, which greys it; the form is noValidate. */}
            <select {...register('examId')} required disabled={locked || examsLoading || exams.length === 0} aria-invalid={!!errors.examId} className={`${inputCls(!!errors.examId)} invalid:text-muted/70`}>
              {/* Shown while nothing is selected, but not offered in the list. */}
              <option value="" disabled hidden>{examsLoading ? 'Loading exams…' : 'Choose your exam'}</option>
              {exams.map((exam) => (
                <option key={exam.id} value={exam.code} className="text-ink">{exam.code} · {exam.title}</option>
              ))}
            </select>
            {errors.examId && <span className="mt-1 block text-xs text-danger">{errors.examId.message}</span>}
            {examsError && <span role="alert" className="mt-1 block text-xs text-danger">{examsError}</span>}
            {!examsLoading && !examsError && exams.length === 0 && <span className="mt-1 block text-xs text-muted">No scheduled or live exams are available right now.</span>}
            {examsError && <button type="button" onClick={() => void loadExams()} className="mt-1 text-xs font-medium text-accent underline">Retry loading exams</button>}
          </label>

          <label className="mt-4 block text-sm font-medium text-ink">
            User ID
            <input {...register('userId')} disabled={locked} autoComplete="username" placeholder="e.g. WUE24-0381" aria-invalid={!!errors.userId} className={inputCls(!!errors.userId)} />
            {errors.userId && <span className="mt-1 block text-xs text-danger">{errors.userId.message}</span>}
          </label>

          <label className="mt-4 block text-sm font-medium text-ink">
            Password
            <div className="relative">
              <input {...register('password')} type={showPw ? 'text' : 'password'} disabled={locked} autoComplete="current-password" aria-invalid={!!errors.password} className={`${inputCls(!!errors.password)} pr-11`} />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                aria-pressed={showPw}
                className="absolute right-2 top-1/2 mt-0.5 -translate-y-1/2 rounded-md p-1.5 text-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-accent"
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && <span className="mt-1 block text-xs text-danger">{errors.password.message}</span>}
          </label>

          <label className="mt-4 flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" {...register('remember')} className="h-4 w-4 rounded border-border accent-primary-600" />
            Remember exam on this device
          </label>

          {formError && (
            <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-xs text-danger">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                {formError}
                {locked && <strong className="ml-1 tabular-nums">Try again in {remaining}s.</strong>}
              </span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || locked || offline}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-cta px-4 py-3 text-sm font-semibold text-ink shadow-sm transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {locked ? `Locked · ${remaining}s` : isSubmitting ? 'Signing in…' : 'Sign in & start checks'}
          </button>
          {offline && (
            <button type="button" onClick={() => void pingServer()} className="mt-3 w-full text-center text-xs font-medium text-accent underline">
              Server unreachable — retry connection
            </button>
          )}
          <p className="mt-6 text-center text-xs text-muted">Lost your credentials? Contact your exam coordinator.</p>
        </motion.form>
      </main>
    </div>
  )
}
