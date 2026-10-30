import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AppWindow, Camera, ChevronDown, Clipboard, EyeOff, FileText, Globe, KeyRound, Keyboard, Mic, Monitor, MonitorSmartphone, ShieldOff, Wifi, type LucideIcon } from 'lucide-react'

export interface ConsentItem {
  id: string
  title: string
  summary: string
  detail: string
  Icon: LucideIcon
}

/** Copy must stay in sync with what the agent actually records; confirm with product/legal before launch. */
export const MONITORED_ITEMS: ConsentItem[] = [
  { id: 'webcam', title: 'Webcam snapshots and face checks', summary: 'Periodic photos of you during the exam.', detail: 'While the exam runs, your webcam is analysed on a schedule to confirm that only you are present, you are facing the screen, you match your registered photo, and no phone, book or notes are in view. Snapshots linked to a flagged event are kept as evidence for your proctor to review.', Icon: Camera },
  { id: 'screen', title: 'Your entire screen', summary: 'A live view of every display, with screenshots kept as proof.', detail: 'Your proctor can see your screen until you finish the exam, including every other program, tab and connected display. Screenshots of what is on screen, with your webcam in the corner, are kept with each flagged event. Close anything private before you start.', Icon: Monitor },
  { id: 'browsing', title: 'Websites, searches and AI chats', summary: 'Every address, search, chat question and AI answer.', detail: 'Any website opens in the exam browser. Each URL, each search or chat question you type there, and what an AI assistant answers, is logged for your proctor. While you are away from the exam, open AI tools and searches are read from window titles and your screen. Your proctor is not limited to what you see here: no warnings are shown during the exam. A person reviews flags before any marks are deducted.', Icon: Globe },
  { id: 'apps', title: 'Running apps and connected displays', summary: 'Other apps, extra monitors, virtual machines.', detail: 'The app notes screen-sharing, messaging and AI tools, extra or mirrored displays, virtual machines and remote-desktop software, and tells your proctor. It reads app names and window titles, not what is inside the apps.', Icon: AppWindow },
  { id: 'input', title: 'Clipboard', summary: 'What you copy during the exam.', detail: 'Copying and pasting works normally. Text you copy on this computer during the exam, up to 300 characters, is recorded for your proctor.', Icon: Clipboard },
  { id: 'focus', title: 'Leaving the exam and connection state', summary: 'When you switch away from the exam, and whether you are online.', detail: 'You can switch to other windows. We record when you leave the exam window and for how long, when your network drops and when the same account logs in elsewhere, so that genuine connectivity problems can be told apart from misconduct.', Icon: Wifi },
  { id: 'mic', title: 'Microphone level (not recordings)', summary: 'Only loudness is measured during the system check.', detail: 'The microphone test measures volume to confirm that it works. No audio is recorded or stored.', Icon: Mic },
]

/** Replaces the system-check microphone item when the exam turns on audio monitoring. */
const AUDIO_ITEM: ConsentItem = { id: 'mic', title: 'Voice and microphone checks (not recordings)', summary: 'Talking and a muted microphone are flagged during the exam.', detail: 'While the exam runs, your computer measures sound levels to notice sustained talking and to confirm the microphone stays on. This happens on your computer: no audio is recorded, stored or sent. Only the event, such as "voice detected", is reported, and a proctor reviews it before any penalty is final.', Icon: Mic }

/** Replaces the microphone item when the exam streams the microphone live to the proctor. */
const LIVE_AUDIO_ITEM: ConsentItem = { id: 'mic', title: 'Live microphone to your proctor', summary: 'Your proctor can listen to your microphone during the exam.', detail: 'While the exam runs, your proctor can listen live to your microphone, together with your screen. It is streamed only while they are watching and is not recorded or stored. Sound levels are also checked on your computer to notice sustained talking.', Icon: Mic }

export const monitoredItems = (audioMonitoring: boolean, liveAudio = false): ConsentItem[] =>
  liveAudio ? MONITORED_ITEMS.map((item) => (item.id === 'mic' ? LIVE_AUDIO_ITEM : item))
    : audioMonitoring ? MONITORED_ITEMS.map((item) => (item.id === 'mic' ? AUDIO_ITEM : item)) : MONITORED_ITEMS

export const NOT_MONITORED_ITEMS: ConsentItem[] = [
  { id: 'files', title: 'Your files and documents', summary: 'Nothing on your disk is read or uploaded.', detail: 'The app does not scan, copy or upload your personal files, photos or downloads. It only sees what appears on your shared screen.', Icon: FileText },
  { id: 'passwords', title: 'Passwords and other browser profiles', summary: 'Saved logins and personal browsing stay private.', detail: 'Exam tabs run in an isolated sandbox with no access to your regular browser history, cookies or saved passwords.', Icon: KeyRound },
  { id: 'keys', title: 'Keystrokes in other apps', summary: 'No keystroke logging outside the exam browser.', detail: 'We do not log what you type in other programs. It is only seen if it appears on your shared screen. Text typed into the exam browser tabs is recorded, as listed above.', Icon: Keyboard },
  { id: 'after', title: 'Anything after you submit', summary: 'Camera and screen sharing stop at submission.', detail: 'When you submit, or your session ends, the webcam and screen share are shut down and the app stops monitoring.', Icon: ShieldOff },
  { id: 'other', title: 'Other devices on your network', summary: 'Your phone, TV or router are not scanned.', detail: 'We check only the computer running the exam, plus connected displays and external devices that are attached to it.', Icon: MonitorSmartphone },
]

interface ConsentListProps {
  title: string
  tone: 'monitored' | 'private'
  items: ConsentItem[]
}

export function ConsentList({ title, tone, items }: ConsentListProps) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const allOpen = open.size === items.length
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const accent = tone === 'monitored' ? 'bg-soft text-primary-600' : 'bg-success/10 text-success'

  return (
    <section aria-label={title}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-heading text-base font-semibold text-text">
          {tone === 'private' && <EyeOff className="h-4 w-4 text-success" />}{title}
          <span className="rounded-full bg-soft px-2 py-0.5 text-xs font-medium text-muted">{items.length}</span>
        </h3>
        <button type="button" onClick={() => setOpen(allOpen ? new Set() : new Set(items.map((i) => i.id)))} className="rounded text-xs font-semibold text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
        {items.map((item) => {
          const isOpen = open.has(item.id)
          return (
            <li key={item.id}>
              <button type="button" onClick={() => toggle(item.id)} aria-expanded={isOpen} aria-controls={`consent-${item.id}`} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${accent}`}><item.Icon className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-text">{item.title}</span>
                  <span className="block truncate text-xs text-muted">{item.summary}</span>
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div id={`consent-${item.id}`} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                    <p className="px-4 pb-4 pl-16 text-sm leading-relaxed text-muted">{item.detail}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
