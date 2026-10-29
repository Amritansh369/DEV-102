'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, Ban, Check, Copy, Loader2, RotateCw, ShieldCheck, UserPlus } from 'lucide-react'
import { inviteProctor, listProctors, resendInvite, revokeInvite, type ProctorInvite } from '@/lib/api'
import type { InviteStatus } from '@/lib/types'

const STATUS: Record<InviteStatus, [string, string]> = {
  PENDING: ['Not used yet', 'bg-amber-50 text-amber-700'],
  USED: ['Signed in', 'bg-green-50 text-success'],
  REVOKED: ['Revoked', 'bg-red-50 text-danger'],
  EXPIRED: ['Expired', 'bg-soft text-muted'],
}

/** Proctors for one exam: invite by email (an account is created when needed), resend or revoke their link. */
export default function ProctorInvites({ examId }: { examId: string }) {
  const [rows, setRows] = useState<ProctorInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [devLink, setDevLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    try {
      setRows(await listProctors(examId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load proctors.')
    } finally {
      setLoading(false)
    }
  }, [examId])

  useEffect(() => {
    void load()
  }, [load])

  const act = async (key: string, fn: () => Promise<string>) => {
    setBusy(key)
    setError(null)
    setNotice(null)
    try {
      setNotice(await fn())
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(null)
    }
  }

  const onInvite = (e: FormEvent) => {
    e.preventDefault()
    void act('invite', async () => {
      const r = await inviteProctor(examId, { name: name.trim(), email: email.trim() })
      setDevLink(r.devLink ?? null)
      setName('')
      setEmail('')
      return r.created ? 'Proctor account created and invitation emailed with a temporary password.' : 'Invitation emailed. The proctor signs in with their existing password.'
    })
  }

  const copyDevLink = async () => {
    if (!devLink) return
    await navigator.clipboard.writeText(devLink)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  const input = 'w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent'

  return (
    <section className="rounded-2xl border border-border bg-white p-5 shadow-sm" aria-label="Proctors">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700"><ShieldCheck className="h-4 w-4" aria-hidden /></span>
        <div>
          <h2 className="font-heading text-base font-semibold text-ink">Proctors</h2>
          <p className="text-xs text-muted">Each proctor gets a personal link for this exam. They paste it in the desktop app, then verify their face and an email code.</p>
        </div>
      </div>

      <form onSubmit={onInvite} className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <label className="sr-only" htmlFor="proctor-name">Proctor name</label>
        <input id="proctor-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className={input} />
        <label className="sr-only" htmlFor="proctor-email">Proctor email</label>
        <input id="proctor-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="proctor@organisation.com" className={input} />
        <button type="submit" disabled={busy !== null || name.trim().length < 2 || !email.includes('@')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50">
          {busy === 'invite' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <UserPlus className="h-4 w-4" aria-hidden />} Invite proctor
        </button>
      </form>

      <AnimatePresence>
        {(error || notice) && (
          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role={error ? 'alert' : 'status'} className={`mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-xs ${error ? 'bg-red-50 text-danger' : 'bg-green-50 text-success'}`}>
            {error ? <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> : <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />} {error ?? notice}
          </motion.p>
        )}
      </AnimatePresence>
      {devLink && (
        <p className="mt-2 flex items-center gap-2 rounded-xl bg-soft px-3 py-2 text-[11px] text-muted">
          <span className="shrink-0 font-semibold">Dev outbox link:</span>
          <span className="min-w-0 flex-1 truncate font-mono">{devLink}</span>
          <button type="button" onClick={() => void copyDevLink()} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-primary hover:bg-white">
            {copied ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />} {copied ? 'Copied' : 'Copy'}
          </button>
        </p>
      )}

      <div className="mt-4 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-soft/60 text-[11px] font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="px-4 py-2.5 text-left">Proctor</th>
              <th scope="col" className="px-4 py-2.5 text-left">Link</th>
              <th scope="col" className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && <tr><td colSpan={3} className="px-4 py-6 text-center text-xs text-muted">Loading proctors…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-xs text-muted">No proctors invited yet. Without an invitation nobody can proctor this exam from the desktop app.</td></tr>}
            {rows.map((r) => (
              <tr key={r.inviteId}>
                <td className="px-4 py-2.5">
                  <p className="font-medium text-ink">{r.name}</p>
                  <p className="text-xs text-muted">{r.email}</p>
                </td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span>
                  {r.deviceBound && <span className="ml-2 text-[11px] text-muted">device locked</span>}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-1.5">
                    <button type="button" disabled={busy !== null} onClick={() => void act(r.inviteId, async () => { setDevLink((await resendInvite(r.inviteId)).devLink ?? null); return `New link emailed to ${r.name}. The previous link no longer works.` })} className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-primary hover:bg-soft focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50" aria-label={`Resend link to ${r.name}`}>
                      <RotateCw className="h-3 w-3" aria-hidden /> Resend
                    </button>
                    {(r.status === 'PENDING' || r.status === 'USED') && (
                      <button type="button" disabled={busy !== null} onClick={() => void act(r.inviteId, async () => { await revokeInvite(r.inviteId); return `${r.name} can no longer proctor this exam.` })} className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-danger hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50" aria-label={`Revoke link for ${r.name}`}>
                        <Ban className="h-3 w-3" aria-hidden /> Revoke
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
