import { useEffect, useState } from 'react'
import type { Session, Severity, ViolationCode } from './types'

export const VIOLATION_META: Record<ViolationCode, { label: string; severity: Severity }> = {
  MULTIPLE_FACES: { label: 'Multiple faces in frame', severity: 'HIGH' },
  NO_FACE: { label: 'No face detected', severity: 'MEDIUM' },
  GAZE_AWAY: { label: 'Looking away from screen', severity: 'LOW' },
  FACE_MISMATCH: { label: 'Face does not match registered photo', severity: 'CRITICAL' },
  AI_SITE_OPENED: { label: 'AI website opened', severity: 'HIGH' },
  AI_QUERY_DETECTED: { label: 'AI assistant query typed', severity: 'HIGH' },
  BLACKLISTED_APP: { label: 'Blacklisted app running', severity: 'HIGH' },
  SCREEN_MIRRORING: { label: 'Screen mirroring detected', severity: 'CRITICAL' },
  MULTI_MONITOR: { label: 'Extra monitor connected', severity: 'HIGH' },
  VM_DETECTED: { label: 'Virtual machine detected', severity: 'CRITICAL' },
  REMOTE_DESKTOP: { label: 'Remote desktop active', severity: 'CRITICAL' },
  EXTERNAL_DEVICE: { label: 'External device attached', severity: 'MEDIUM' },
  CLIPBOARD_USE: { label: 'Clipboard use attempted', severity: 'LOW' },
  SHORTCUT_BLOCKED: { label: 'Blocked shortcut pressed', severity: 'LOW' },
  SCREEN_SHARE_STOPPED: { label: 'Screen sharing stopped', severity: 'HIGH' },
  CAMERA_BLOCKED: { label: 'Camera blocked or covered', severity: 'HIGH' },
  MULTI_LOGIN: { label: 'Second login detected', severity: 'CRITICAL' },
  NETWORK_LOST: { label: 'Network connection lost', severity: 'LOW' },
  WINDOW_BLUR: { label: 'Exam window lost focus', severity: 'MEDIUM' },
  VOICE_DETECTED: { label: 'Voice detected', severity: 'MEDIUM' },
  MIC_BLOCKED: { label: 'Microphone muted or disconnected', severity: 'HIGH' },
  PHONE_DETECTED: { label: 'Phone visible on camera', severity: 'HIGH' },
  NOTES_DETECTED: { label: 'Book or notes visible on camera', severity: 'MEDIUM' },
}

export const SEVERITY_WEIGHT: Record<Severity, number> = { LOW: 4, MEDIUM: 10, HIGH: 18, CRITICAL: 30 }

export const STATUS_LABEL: Record<Session['status'], string> = {
  WAITING: 'Waiting',
  LIVE: 'Live',
  SUBMITTED: 'Submitted',
  TERMINATED: 'Terminated',
}

export function timeAgo(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

export const formatClock = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

/** Re-renders the caller on an interval so relative timestamps stay fresh. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}
