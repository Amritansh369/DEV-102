import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from 'react'
import { motion, useAnimationControls } from 'framer-motion'

interface OtpInputProps {
  length?: number
  disabled?: boolean
  /** Increment to trigger the shake + clear animation after a failed attempt. */
  errorSignal?: number
  resendSeconds?: number
  onComplete: (code: string) => void
  onResend: () => void | Promise<void>
}

export function OtpInput({ length = 6, disabled = false, errorSignal = 0, resendSeconds = 30, onComplete, onResend }: OtpInputProps) {
  const [digits, setDigits] = useState<string[]>(() => Array<string>(length).fill(''))
  const [hasError, setHasError] = useState(false)
  const [left, setLeft] = useState(resendSeconds)
  const [resending, setResending] = useState(false)
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const controls = useAnimationControls()

  useEffect(() => {
    if (!errorSignal) return
    setHasError(true)
    setDigits(Array<string>(length).fill(''))
    void controls.start({ x: [0, -10, 10, -8, 8, -4, 4, 0], transition: { duration: 0.45 } })
    refs.current[0]?.focus()
  }, [errorSignal, controls, length])

  useEffect(() => {
    if (left <= 0) return
    const id = window.setTimeout(() => setLeft((s) => s - 1), 1000)
    return () => window.clearTimeout(id)
  }, [left])

  useEffect(() => {
    refs.current[0]?.focus()
  }, [])

  // Writes a run of digits starting at `start`; used for typing, autofill and paste.
  const fill = useCallback(
    (raw: string, start: number) => {
      const clean = raw.replace(/\D/g, '').slice(0, length - start)
      if (!clean) return
      setHasError(false)
      const next = [...digits]
      clean.split('').forEach((ch, k) => {
        next[start + k] = ch
      })
      setDigits(next)
      const focusAt = Math.min(start + clean.length, length - 1)
      refs.current[focusAt]?.focus()
      if (next.every((d) => d !== '')) onComplete(next.join(''))
    },
    [digits, length, onComplete],
  )

  const onChange = (i: number) => (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.value === '') {
      const next = [...digits]
      next[i] = ''
      setDigits(next)
      return
    }
    fill(e.target.value.slice(-length), i)
  }

  const onKeyDown = (i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && digits[i] === '' && i > 0) {
      e.preventDefault()
      const next = [...digits]
      next[i - 1] = ''
      setDigits(next)
      refs.current[i - 1]?.focus()
    } else if (e.key === 'ArrowLeft' && i > 0) {
      e.preventDefault()
      refs.current[i - 1]?.focus()
    } else if (e.key === 'ArrowRight' && i < length - 1) {
      e.preventDefault()
      refs.current[i + 1]?.focus()
    }
  }

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    fill(e.clipboardData.getData('text'), 0)
  }

  const resend = async () => {
    setResending(true)
    try {
      await onResend()
      setDigits(Array<string>(length).fill(''))
      setHasError(false)
      setLeft(resendSeconds)
      refs.current[0]?.focus()
    } finally {
      setResending(false)
    }
  }

  return (
    <div>
      <motion.div animate={controls} role="group" aria-label={`${length}-digit one-time passcode`} className="flex justify-center gap-3">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el
            }}
            value={d}
            disabled={disabled}
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={length}
            aria-label={`Digit ${i + 1} of ${length}`}
            aria-invalid={hasError}
            onChange={onChange(i)}
            onKeyDown={onKeyDown(i)}
            onPaste={onPaste}
            onFocus={(e) => e.currentTarget.select()}
            className={`h-14 w-12 rounded-xl border bg-white text-center font-heading text-2xl font-semibold text-text shadow-sm outline-none transition focus:ring-4 disabled:opacity-50 ${
              hasError ? 'border-danger ring-danger/20 focus:ring-danger/20' : 'border-border focus:border-accent focus:ring-accent/20'
            }`}
          />
        ))}
      </motion.div>
      <p className="mt-4 text-center text-sm text-muted" aria-live="polite">
        {left > 0 ? (
          <>Resend code in <span className="font-semibold tabular-nums text-text">{left}s</span></>
        ) : (
          <button
            type="button"
            onClick={() => void resend()}
            disabled={resending || disabled}
            className="rounded font-semibold text-accent underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
          >
            {resending ? 'Sending…' : 'Resend code'}
          </button>
        )}
      </p>
    </div>
  )
}
