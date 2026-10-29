'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Camera, CheckCircle2, FileCheck2, KeyRound, Mail, MonitorCheck, MonitorUp, Pause, Play, ScanFace, ShieldAlert, type LucideIcon,
} from 'lucide-react';

interface Step {
  id: string;
  title: string;
  short: string;
  icon: LucideIcon;
  detail: string;
  bullets: string[];
}

const STEPS: Step[] = [
  {
    id: 'email', title: 'Credentials by email', short: 'Email', icon: Mail,
    detail: 'Each candidate receives an Exam ID, User ID and password from the organiser, with the exam time and a link to download the app.',
    bullets: ['Per-candidate credentials, generated in bulk', 'Delivery status tracked per row', 'Resend failed emails in one click'],
  },
  {
    id: 'login', title: 'Install and sign in', short: 'Login', icon: KeyRound,
    detail: 'The website only verifies the login. To continue, the candidate installs the secure exam app and signs in there.',
    bullets: ['Install gate on the web lobby', 'Single active login per candidate', 'Device is bound to the session'],
  },
  {
    id: 'check', title: 'System check', short: 'System', icon: MonitorCheck,
    detail: 'The app tests the camera, microphone level and network speed, closes blacklisted apps, and rejects virtual machines, remote desktops and extra displays.',
    bullets: ['Camera, mic and bandwidth test', 'Blacklisted apps found and closed', 'One display, no mirroring'],
  },
  {
    id: 'verify', title: 'Face and OTP verification', short: 'Verify', icon: ScanFace,
    detail: 'A live face capture is matched to the registered photo, followed by a one-time password sent to the candidate’s email.',
    bullets: ['Liveness-checked face match', '5-minute OTP validity', 'Reference photo stored for the session'],
  },
  {
    id: 'consent', title: 'Consent and screen share', short: 'Consent', icon: MonitorUp,
    detail: 'Candidates see exactly what is monitored, accept it, then share their entire screen. Sharing a single window is not accepted.',
    bullets: ['Plain-language list of monitoring', 'Entire-screen share enforced', 'Stopping the share is flagged instantly'],
  },
  {
    id: 'exam', title: 'Secure kiosk exam', short: 'Exam', icon: Camera,
    detail: 'The exam runs full-screen with a timer, question palette, mark-for-review and autosave. Research happens only inside a sandboxed browser where every URL and search is logged.',
    bullets: ['AI sites flagged on open', 'Warnings, then auto-submit by policy', 'Mentors watch live and can intervene'],
  },
  {
    id: 'done', title: 'Submitted and reviewed', short: 'Done', icon: FileCheck2,
    detail: 'Answers are submitted, the candidate sees a confirmation, and the organiser gets results with a violation report that mentors can confirm or overrule.',
    bullets: ['Rank-wise results', 'Evidence-backed violation reports', 'Penalty review before publishing'],
  },
];

const INTERVAL_MS = 4500;

/** A small contextual illustration per step, built from CSS so it never depends on image files. */
function StepVisual({ id }: { id: string }) {
  switch (id) {
    case 'email':
      return (
        <div className="space-y-2 rounded-2xl border border-border bg-white p-4 text-xs shadow-sm">
          <p className="font-semibold text-text">Your exam credentials · Campus Placement Test</p>
          {[['Exam ID', 'CPA-26'], ['User ID', 'WUE261004'], ['Password', 'Mango@4821']].map(([k, v]) => (
            <div key={k} className="flex justify-between rounded-lg bg-soft px-3 py-2"><span className="text-muted">{k}</span><b className="font-mono text-text">{v}</b></div>
          ))}
          <p className="flex items-center gap-1.5 text-success"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Delivered to ananya.iyer@gmail.com</p>
        </div>
      );
    case 'login':
      return (
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-2xl border border-border bg-white p-4 shadow-sm"><p className="font-semibold text-text">Website</p><p className="mt-1 text-muted">Install the app to continue</p><span className="mt-3 inline-block rounded-lg bg-cta px-3 py-1.5 font-bold text-slate-900">Download</span></div>
          <div className="rounded-2xl border border-primary/30 bg-soft p-4 shadow-sm"><p className="font-semibold text-primary">Desktop app</p><p className="mt-1 text-muted">Sign in with User ID</p><span className="mt-3 inline-block rounded-lg bg-primary px-3 py-1.5 font-bold text-white">Continue</span></div>
        </div>
      );
    case 'check':
      return (
        <ul className="space-y-2 rounded-2xl border border-border bg-white p-4 text-xs shadow-sm">
          {['Camera working', 'Microphone level good', 'Network 24 Mbps', '2 blacklisted apps closed', 'Single display, not mirrored', 'No virtual machine'].map((t, i) => (
            <motion.li key={t} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.12 }} className="flex items-center gap-2 text-text">
              <CheckCircle2 className="h-4 w-4 text-success" aria-hidden /> {t}
            </motion.li>
          ))}
        </ul>
      );
    case 'verify':
      return (
        <div className="flex items-center gap-4 rounded-2xl border border-border bg-white p-4 shadow-sm">
          <div className="relative grid h-24 w-24 place-items-center rounded-full bg-soft ring-4 ring-accent/30">
            <ScanFace className="h-10 w-10 text-primary" aria-hidden />
            <motion.span className="absolute inset-x-2 h-0.5 rounded bg-accent" animate={{ top: ['15%', '80%', '15%'] }} transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }} />
          </div>
          <div className="text-xs"><p className="font-semibold text-text">Match 97.4%</p><p className="mb-2 text-muted">Enter the OTP sent to your email</p>
            <div className="flex gap-1.5">{[4, 8, 2, 1, 7, 9].map((n, i) => <span key={i} className="grid h-8 w-7 place-items-center rounded-md border border-border bg-soft font-mono font-bold text-primary">{n}</span>)}</div>
          </div>
        </div>
      );
    case 'consent':
      return (
        <div className="rounded-2xl border border-border bg-white p-4 text-xs shadow-sm">
          <p className="mb-2 font-semibold text-text">We will monitor</p>
          {['Webcam video and face', 'Your entire screen', 'Websites and searches in the exam browser', 'Running apps and connected devices'].map((t) => (
            <p key={t} className="flex items-center gap-2 py-1 text-muted"><CheckCircle2 className="h-3.5 w-3.5 text-accent" aria-hidden /> {t}</p>
          ))}
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 font-semibold text-white"><MonitorUp className="h-3.5 w-3.5" aria-hidden /> Share entire screen</span>
        </div>
      );
    case 'exam':
      return (
        <div className="grid grid-cols-[1fr_auto] gap-3 rounded-2xl border border-border bg-white p-4 text-xs shadow-sm">
          <div><div className="mb-2 flex justify-between"><b className="text-text">Question 12 of 20</b><span className="font-mono font-semibold text-danger">12:41</span></div>
            <p className="rounded-lg bg-soft p-2 text-muted">The worst-case time complexity of quicksort is…</p>
            <p className="mt-2 flex items-center gap-1.5 text-danger"><ShieldAlert className="h-3.5 w-3.5" aria-hidden /> Warning 1 of 3: window lost focus</p></div>
          <div className="grid grid-cols-4 gap-1">{Array.from({ length: 12 }, (_, i) => (
            <span key={i} className={`grid h-5 w-5 place-items-center rounded text-[9px] font-bold ${i < 7 ? 'bg-success text-white' : i === 11 ? 'bg-primary text-white' : i === 8 ? 'bg-warning text-ink' : 'bg-soft text-muted'}`}>{i + 1}</span>
          ))}</div>
        </div>
      );
    default:
      return (
        <div className="grid place-items-center rounded-2xl border border-border bg-white p-6 text-center shadow-sm">
          <motion.span initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 220 }} className="grid h-16 w-16 place-items-center rounded-full bg-success/15 text-success"><CheckCircle2 className="h-9 w-9" aria-hidden /></motion.span>
          <p className="mt-3 font-heading text-sm font-semibold text-text">Exam submitted</p>
          <p className="text-xs text-muted">20 of 20 answered · Results after review</p>
        </div>
      );
  }
}

export default function FlowSteps() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [paused, setPaused] = useState(false);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!playing || paused || reduce) return;
    const t = setTimeout(() => setActive((a) => (a + 1) % STEPS.length), INTERVAL_MS);
    return () => clearTimeout(t);
  }, [active, playing, paused, reduce]);

  const step = STEPS[active] as Step;

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? i - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const n = (next + STEPS.length) % STEPS.length;
    setActive(n);
    buttons.current[n]?.focus();
  };

  return (
    <section id="journey" aria-labelledby="journey-title" className="bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary-600">The candidate journey</p>
          <h2 id="journey-title" className="mt-3 font-heading text-3xl font-bold text-text sm:text-4xl">From invitation email to submitted answers</h2>
          <p className="mt-4 text-muted">Seven guided steps, each one verified before the next unlocks, so nobody reaches the question paper without passing every check.</p>
        </div>

        <div className="mt-14 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
          <div role="tablist" aria-label="Candidate journey steps" aria-orientation="vertical" className="relative space-y-2">
            <div className="absolute bottom-6 left-[27px] top-6 w-px bg-border" aria-hidden />
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const done = i < active;
              const current = i === active;
              return (
                <button
                  key={s.id}
                  ref={(el) => { buttons.current[i] = el; }}
                  role="tab"
                  id={`step-tab-${s.id}`}
                  aria-selected={current}
                  aria-controls="step-panel"
                  tabIndex={current ? 0 : -1}
                  onClick={() => setActive(i)}
                  onKeyDown={(e) => onKey(e, i)}
                  className={`relative flex w-full items-center gap-4 rounded-2xl p-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${current ? 'bg-soft shadow-sm ring-1 ring-primary/15' : 'hover:bg-soft/70'}`}
                >
                  <span className={`relative z-10 grid h-11 w-11 shrink-0 place-items-center rounded-xl transition ${current ? 'bg-primary text-white shadow-lg shadow-primary/30' : done ? 'bg-success/15 text-success' : 'bg-white text-muted ring-1 ring-border'}`}>
                    {done ? <CheckCircle2 className="h-5 w-5" aria-hidden /> : <Icon className="h-5 w-5" aria-hidden />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-muted">Step {i + 1}</span>
                    <span className={`block truncate font-heading text-sm font-semibold ${current ? 'text-primary' : 'text-text'}`}>{s.title}</span>
                    {/* Reduced motion hides the bar with CSS rather than a render branch, so server and client markup match. */}
                    {current && playing && !paused && (
                      <span className="mt-2 block h-1 overflow-hidden rounded-full bg-border motion-reduce:hidden">
                        <motion.span key={`${active}-bar`} className="block h-full rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ duration: INTERVAL_MS / 1000, ease: 'linear' }} />
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              className="ml-3 mt-3 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-muted transition hover:bg-soft hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              aria-pressed={!playing}
            >
              {playing ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
              {playing ? 'Pause autoplay' : 'Resume autoplay'}
            </button>
          </div>

          <div id="step-panel" role="tabpanel" aria-labelledby={`step-tab-${step.id}`} className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-soft to-white p-6 shadow-[0_20px_60px_-25px_rgba(10,77,166,0.35)] ring-1 ring-border sm:p-8">
            <AnimatePresence mode="wait">
              <motion.div key={step.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
                <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  <step.icon className="h-3.5 w-3.5" aria-hidden /> {step.short} · {active + 1}/{STEPS.length}
                </span>
                <h3 className="mt-4 font-heading text-2xl font-bold text-text">{step.title}</h3>
                <p className="mt-3 leading-relaxed text-muted">{step.detail}</p>
                <div className="my-6"><StepVisual id={step.id} /></div>
                <ul className="space-y-2">
                  {step.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2.5 text-sm text-text"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden /> {b}</li>
                  ))}
                </ul>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
