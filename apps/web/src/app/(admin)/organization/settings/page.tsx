'use client'

import { useState, type FormEvent } from 'react'
import { KeyRound, Loader2, UserRound } from 'lucide-react'
import { Field, btnPrimary, cardCls, inputCls } from '@/components/admin/FormControls'
import { toast } from '@/lib/adminStore'
import { changePassword, updateProfile } from '@/lib/api'
import { useSession } from '@/lib/session'

const MIN_PASSWORD = 10

function ProfileCard() {
  const user = useSession((s) => s.user)
  const setUser = useSession((s) => s.setUser)
  const [name, setName] = useState(user?.name ?? '')
  const [busy, setBusy] = useState(false)
  const trimmed = name.trim()

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const updated = await updateProfile(trimmed)
      if (user) setUser({ ...user, name: updated.name })
      toast.success('Profile saved', 'Your name is updated.')
    } catch (err) {
      toast.error('Could not save', err instanceof Error ? err.message : 'Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(e) => void save(e)} className={`${cardCls} space-y-4 p-6`}>
      <h2 className="flex items-center gap-2 font-heading text-lg font-semibold text-text"><UserRound className="h-5 w-5 text-accent" aria-hidden="true" /> Profile</h2>
      <Field id="settings-name" label="Name" required>
        <input id="settings-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" className={inputCls} />
      </Field>
      <Field id="settings-email" label="Email" hint="This is the address you sign in with.">
        <input id="settings-email" value={user?.email ?? ''} readOnly className={`${inputCls} bg-soft text-muted`} />
      </Field>
      <button type="submit" disabled={busy || trimmed.length < 2 || trimmed === user?.name} className={btnPrimary}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Save profile
      </button>
    </form>
  )
}

function PasswordCard() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const tooShort = next.length > 0 && next.length < MIN_PASSWORD ? `Use at least ${MIN_PASSWORD} characters.` : undefined
  const mismatch = repeat.length > 0 && repeat !== next ? 'The passwords do not match.' : undefined

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await changePassword(current, next)
      setCurrent('')
      setNext('')
      setRepeat('')
      toast.success('Password changed', 'Other devices were signed out.')
    } catch (err) {
      toast.error('Could not change the password', err instanceof Error ? err.message : 'Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(e) => void save(e)} className={`${cardCls} space-y-4 p-6`}>
      <h2 className="flex items-center gap-2 font-heading text-lg font-semibold text-text"><KeyRound className="h-5 w-5 text-accent" aria-hidden="true" /> Password</h2>
      <Field id="settings-current" label="Current password" required>
        <input id="settings-current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" className={inputCls} />
      </Field>
      <Field id="settings-new" label="New password" required error={tooShort}>
        <input id="settings-new" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" maxLength={128} className={inputCls} />
      </Field>
      <Field id="settings-repeat" label="Repeat new password" required error={mismatch}>
        <input id="settings-repeat" type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" maxLength={128} className={inputCls} />
      </Field>
      <button type="submit" disabled={busy || !current || next.length < MIN_PASSWORD || next !== repeat} className={btnPrimary}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Change password
      </button>
    </form>
  )
}

export default function OrganizationSettingsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header>
        <h1 className="font-heading text-2xl font-semibold text-text">Settings</h1>
        <p className="mt-1 text-sm text-muted">Your organization account. Marks, risk points and exam rules are set on each exam.</p>
      </header>
      <div className="grid gap-6 lg:grid-cols-2">
        <ProfileCard />
        <PasswordCard />
      </div>
    </div>
  )
}
