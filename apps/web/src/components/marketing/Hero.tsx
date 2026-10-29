'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { homeFor, useSession } from '@/lib/session';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Activity, ArrowRight, Building2, Download, Eye, LockKeyhole, Menu, ShieldCheck, Sparkles, X } from 'lucide-react';

const ROLE_HOME_LABEL = { ADMIN: 'Admin panel', MENTOR: 'Live monitor', CANDIDATE: 'My exam' } as const;

/** Signed-in visitors get a link to their dashboard instead of "Log in" (read after mount to avoid hydration mismatch). */
function useAccountLink(): { href: string; label: string } {
  const user = useSession((st) => st.user);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted && user ? { href: homeFor(user.role), label: ROLE_HOME_LABEL[user.role] } : { href: '/login', label: 'Log in' };
}

const NAV = [
  { href: '#journey', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '/security', label: 'Security' },
  { href: '/download', label: 'Download App' },
];

function LogoMark() {
  const [broken, setBroken] = useState(false);
  return broken ? (
    <span className="grid h-10 w-10 place-items-center rounded-xl bg-white font-heading text-lg font-bold text-primary">W</span>
  ) : (
    <Image src="/images/logo.png" alt="Where U Elevate" width={140} height={40} className="h-10 w-auto" priority onError={() => setBroken(true)} />
  );
}

function Nav() {
  const [open, setOpen] = useState(false);
  const account = useAccountLink();
  return (
    <header className="relative z-20">
      <nav aria-label="Primary" className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 lg:px-8">
        <Link href="/" className="flex items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white" aria-label="Where U Elevate home">
          <LogoMark />
          <span className="hidden font-heading text-sm font-semibold text-white sm:block">Smart Proctoring</span>
        </Link>
        <ul className="hidden items-center gap-8 md:flex">
          {NAV.map((n) => (
            <li key={n.href}>
              <Link href={n.href} className="rounded-md text-sm font-medium text-white/85 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
                {n.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="hidden items-center gap-3 md:flex">
          <Link href={account.href} className="rounded-xl px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/40 transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            {account.label}
          </Link>
          <Link href="/login?role=admin" className="inline-flex items-center gap-2 rounded-xl bg-cta px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg shadow-black/10 transition hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            <Building2 className="h-4 w-4" aria-hidden /> For Organization
          </Link>
        </div>
        <button
          type="button"
          className="grid h-11 w-11 place-items-center rounded-xl text-white ring-1 ring-white/30 md:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>
      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mx-5 rounded-2xl bg-white p-3 shadow-2xl md:hidden"
          >
            {[...NAV, account].map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="block rounded-xl px-4 py-3 text-sm font-medium text-text hover:bg-soft">
                {n.label}
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

/** Subtle network of dots and connecting lines; coordinates are fixed so SSR and client agree. */
const NODES: [number, number][] = [
  [60, 80], [180, 40], [300, 120], [430, 60], [560, 150], [690, 70], [820, 130], [950, 50], [1080, 110],
  [1200, 60], [1320, 140], [110, 220], [260, 260], [400, 200], [540, 280], [700, 230], [860, 290], [1010, 220], [1150, 270], [1290, 230],
];
const EDGES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10], [0, 11], [2, 12], [3, 13], [4, 14], [5, 15],
  [6, 16], [8, 17], [9, 18], [10, 19], [11, 12], [12, 13], [13, 14], [14, 15], [15, 16], [16, 17], [17, 18], [18, 19],
];
function NetworkPattern() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-30" viewBox="0 0 1400 400" preserveAspectRatio="xMidYMid slice" aria-hidden>
      {EDGES.map(([a, b]) => (
        <line key={`${a}-${b}`} x1={NODES[a]?.[0]} y1={NODES[a]?.[1]} x2={NODES[b]?.[0]} y2={NODES[b]?.[1]} stroke="white" strokeWidth="0.8" strokeOpacity="0.5" />
      ))}
      {NODES.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 4 === 0 ? 4 : 2.5} fill="white" />
      ))}
    </svg>
  );
}

/* ---------------------------------------------------------------- live proctoring card */

interface Tile { name: string; initials: string; risk: number; hue: number; photo: string }
const TILES: Tile[] = [
  { name: 'Ananya Iyer', initials: 'AI', risk: 12, hue: 210, photo: '/images/people/women-12.jpg' },
  { name: 'Rohan Mehta', initials: 'RM', risk: 34, hue: 190, photo: '/images/people/men-32.jpg' },
  { name: 'Kavya Reddy', initials: 'KR', risk: 8, hue: 225, photo: '/images/people/women-24.jpg' },
  { name: 'Arjun Singh', initials: 'AS', risk: 58, hue: 200, photo: '/images/people/men-7.jpg' },
];
const FEED: { who: string; text: string; tone: 'warn' | 'danger' | 'info' }[] = [
  { who: 'Arjun Singh', text: 'Opened chatgpt.com in sandbox tab', tone: 'danger' },
  { who: 'Rohan Mehta', text: 'Looking away from screen (6 s)', tone: 'info' },
  { who: 'Kavya Reddy', text: 'Copy shortcut blocked', tone: 'warn' },
  { who: 'Arjun Singh', text: 'Second face detected in frame', tone: 'danger' },
  { who: 'Ananya Iyer', text: 'Network dropped, answers cached', tone: 'info' },
];
const TONE = { warn: 'bg-warning/15 text-amber-800', danger: 'bg-danger/10 text-danger', info: 'bg-accent/10 text-primary-600' } as const;
const riskColor = (r: number) => (r >= 50 ? 'bg-danger' : r >= 25 ? 'bg-warning' : 'bg-success');

function LiveCard() {
  const reduce = useReducedMotion();
  const [risks, setRisks] = useState(() => TILES.map((t) => t.risk));
  const [feedStart, setFeedStart] = useState(0);
  const [elapsed, setElapsed] = useState(2412);

  useEffect(() => {
    if (reduce) return;
    const tick = setInterval(() => {
      setElapsed((e) => e + 1);
    }, 1000);
    const drift = setInterval(() => {
      setRisks((prev) => prev.map((r, i) => Math.max(3, Math.min(92, r + (Math.round(Math.sin(Date.now() / 4000 + i) * 4) + (i === 3 ? 1 : 0))))));
      setFeedStart((s) => (s + 1) % FEED.length);
    }, 2600);
    return () => { clearInterval(tick); clearInterval(drift); };
  }, [reduce]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  const visible = [0, 1, 2].map((o) => FEED[(feedStart + o) % FEED.length] as (typeof FEED)[number]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.2 }}
      className="relative w-full max-w-xl rounded-3xl bg-white p-4 shadow-[0_30px_80px_-20px_rgba(10,30,80,0.55)] ring-1 ring-black/5"
      role="img"
      aria-label="Illustration of a live proctoring dashboard showing four candidate webcams with risk scores and a violation feed"
    >
      <div className="flex items-center justify-between px-1 pb-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-danger" />
          </span>
          <span className="font-heading text-sm font-semibold text-text">Live · Campus Placement Test</span>
        </div>
        <span className="rounded-lg bg-soft px-2.5 py-1 font-mono text-xs font-semibold text-primary">{mm}:{ss}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {TILES.map((t, i) => {
          const risk = risks[i] ?? t.risk;
          return (
            <div key={t.name} className="overflow-hidden rounded-2xl border border-border bg-soft">
              <div className="relative grid aspect-[4/3] place-items-center" style={{ background: `linear-gradient(135deg, hsl(${t.hue} 70% 88%), hsl(${t.hue} 60% 72%))` }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- small static portrait */}
                <img src={t.photo} alt="" className="absolute inset-0 h-full w-full object-cover" />
                <span className="absolute inset-0 bg-gradient-to-t from-slate-950/50 via-transparent to-slate-950/10" aria-hidden />
                {/* Face-tracking corners and a scan line, like the agent's detector overlay */}
                <span className="absolute left-1/2 top-[16%] h-[62%] w-[44%] -translate-x-1/2" aria-hidden>
                  {['left-0 top-0 border-l-2 border-t-2', 'right-0 top-0 border-r-2 border-t-2', 'left-0 bottom-0 border-l-2 border-b-2', 'right-0 bottom-0 border-r-2 border-b-2'].map((c) => (
                    <span key={c} className={`absolute h-3.5 w-3.5 rounded-[3px] ${risk >= 50 ? 'border-amber-300' : 'border-emerald-300'} ${c}`} />
                  ))}
                </span>
                {/* Always rendered so server and client markup match; hidden by CSS when motion is reduced. */}
                <motion.span
                  aria-hidden
                  className="absolute inset-x-0 h-8 bg-gradient-to-b from-transparent via-sky-300/35 to-transparent motion-reduce:hidden"
                  animate={reduce ? undefined : { top: ['-15%', '100%'] }}
                  transition={{ repeat: Infinity, duration: 2.6 + i * 0.4, ease: 'linear' }}
                />
                <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  <Eye className="h-3 w-3" aria-hidden /> Face OK
                </span>
                <span className={`absolute right-2 top-2 rounded-md px-1.5 py-0.5 text-[11px] font-bold ${riskColor(risk)} ${risk >= 25 && risk < 50 ? 'text-ink' : 'text-white'}`}>{risk}</span>
              </div>
              <div className="px-3 py-2">
                <p className="truncate text-xs font-semibold text-ink">{t.name}</p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-border" aria-hidden>
                  <motion.div className={`h-full rounded-full ${riskColor(risk)}`} animate={{ width: `${risk}%` }} transition={{ type: 'spring', stiffness: 80, damping: 18 }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 rounded-2xl border border-border p-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <Activity className="h-3.5 w-3.5" aria-hidden /> Violation feed
        </p>
        <ul className="space-y-2" aria-live="off">
          <AnimatePresence initial={false} mode="popLayout">
            {visible.map((f) => (
              <motion.li
                key={`${feedStart}-${f.who}-${f.text}`}
                layout
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                className="flex items-center gap-2 text-xs"
              >
                <span className={`rounded-md px-1.5 py-0.5 font-semibold ${TONE[f.tone]}`}>{f.who.split(' ')[0]}</span>
                <span className="truncate text-muted">{f.text}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>

      <motion.div
        animate={reduce ? undefined : { y: [0, -6, 0] }}
        transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
        className="absolute -left-6 top-24 hidden items-center gap-2 rounded-2xl bg-white px-3 py-2 shadow-xl ring-1 ring-black/5 lg:flex"
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-success/15 text-success"><ShieldCheck className="h-4 w-4" aria-hidden /></span>
        <span className="text-xs"><b className="block text-text">Screen locked</b><span className="text-muted">Kiosk mode active</span></span>
      </motion.div>
      <motion.div
        animate={reduce ? undefined : { y: [0, 6, 0] }}
        transition={{ repeat: Infinity, duration: 5, ease: 'easeInOut' }}
        className="absolute -right-4 -bottom-5 hidden items-center gap-2 rounded-2xl bg-white px-3 py-2 shadow-xl ring-1 ring-black/5 lg:flex"
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-danger/10 text-danger"><Sparkles className="h-4 w-4" aria-hidden /></span>
        <span className="text-xs"><b className="block text-text">AI site flagged</b><span className="text-muted">Mentor alerted in 1.2 s</span></span>
      </motion.div>
    </motion.div>
  );
}

/* ---------------------------------------------------------------- hero */

const TRUST = [
  { icon: LockKeyhole, label: 'End-to-end encrypted sessions' },
  { icon: Eye, label: 'AI-assisted face and gaze checks' },
  { icon: ShieldCheck, label: 'Kiosk-mode secure browser' },
  { icon: Activity, label: 'Realtime mentor monitoring' },
];

export default function Hero() {
  return (
    <section
      className="relative isolate overflow-hidden bg-[linear-gradient(135deg,#0A4DA6_0%,#0B5BD3_55%,#1E6FF0_100%)] bg-cover bg-center text-white"
      style={{ backgroundImage: "linear-gradient(135deg, rgba(10,77,166,.55), rgba(11,91,211,.35) 55%, rgba(30,111,240,.45)), url('/images/backgrounds/data-rain.svg')" }}
    >
      <NetworkPattern />
      <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-white/10 blur-3xl" aria-hidden />
      <Nav />

      <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-14 px-5 pb-40 pt-10 lg:grid-cols-[1.05fr_1fr] lg:px-8 lg:pb-48 lg:pt-16">
        <div>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-xs font-semibold tracking-wide ring-1 ring-white/25 backdrop-blur"
          >
            <Sparkles className="h-3.5 w-3.5 text-cta" aria-hidden /> Trusted by 120+ colleges and hiring teams
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="font-heading text-4xl font-bold leading-[1.1] tracking-tight text-white drop-shadow-sm sm:text-5xl lg:text-[3.5rem]"
          >
            Conduct online exams that <span className="text-cta">cannot be gamed.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16 }}
            className="mt-6 max-w-xl text-lg leading-relaxed text-white/85"
          >
            A secure exam browser with AI proctoring. Candidates are verified, their screen and webcam are watched, every website and search is logged,
            and mentors step in the moment something looks wrong.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.24 }}
            className="mt-9 flex flex-wrap items-center gap-4"
          >
            <Link href="/download" className="group inline-flex items-center gap-2 rounded-xl bg-cta px-6 py-3.5 text-sm font-bold text-slate-900 shadow-xl shadow-black/15 transition hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              <Download className="h-4 w-4" aria-hidden /> Download the app
            </Link>
            <Link href="/login" className="group inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-bold text-primary shadow-lg transition hover:bg-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              Candidate login <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
            </Link>
            <Link href="/login?role=mentor" className="rounded-xl px-2 py-3.5 text-sm font-semibold text-white/90 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              Mentor sign in
            </Link>
          </motion.div>
        </div>
        <div className="flex justify-center lg:justify-end"><LiveCard /></div>
      </div>

      <div className="relative z-10 mx-auto -mb-1 max-w-7xl px-5 pb-16 lg:px-8">
        <ul className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4" aria-label="Trust highlights">
          {TRUST.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-3 text-sm font-medium text-white/90">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/20"><Icon className="h-4 w-4" aria-hidden /></span>
              {label}
            </li>
          ))}
        </ul>
      </div>

      <svg className="absolute bottom-0 left-0 z-0 w-full text-white" viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden>
        <path fill="currentColor" d="M0,64 C240,120 480,120 720,84 C960,48 1200,8 1440,56 L1440,120 L0,120 Z" />
      </svg>
    </section>
  );
}
