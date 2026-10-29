'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { animate, motion, useInView, useReducedMotion } from 'framer-motion';
import {
  Bot, Camera, ClipboardCheck, Globe2, Gauge, LayoutGrid, Lock, MonitorSmartphone, RefreshCw, ScanFace, TriangleAlert, Users, type LucideIcon,
} from 'lucide-react';
import { getPlatformStats, type PlatformStats } from '@/lib/api';

interface Feature { icon: LucideIcon; title: string; body: string }

const FEATURES: Feature[] = [
  { icon: Lock, title: 'Kiosk-mode exam browser', body: 'Full-screen lock-down blocks shortcuts, task switching, screenshots and clipboard access during the test.' },
  { icon: ScanFace, title: 'Face verification', body: 'Candidates are matched to their registered photo before the exam and re-checked continuously.' },
  { icon: Camera, title: 'Webcam and gaze tracking', body: 'Detects missing faces, extra people and sustained looking-away, with a snapshot as evidence.' },
  { icon: MonitorSmartphone, title: 'Entire-screen capture', body: 'Mentors see live screens. Stopping the share, mirroring or adding a monitor raises an alert at once.' },
  { icon: Globe2, title: 'Sandboxed research tabs', body: 'Every URL, search and chat query inside the exam browser is logged for later review.' },
  { icon: Bot, title: 'AI-site detection', body: 'ChatGPT, Gemini, Claude and other assistants are flagged the moment they are opened or queried.' },
  { icon: TriangleAlert, title: 'Policy-based warnings', body: 'Two warnings, then auto-submit on a serious breach. Thresholds are configurable for every exam.' },
  { icon: LayoutGrid, title: 'Live mentor dashboard', body: 'A grid of candidates with risk scores, a violation feed, instant warnings and one-click termination.' },
  { icon: ClipboardCheck, title: 'Review and overrule', body: 'Confirm or overrule each penalty with evidence in view, so honest candidates are never punished by a glitch.' },
  { icon: Users, title: 'Bulk onboarding', body: 'Import candidates and MCQs from CSV or Excel, generate credentials and email them with per-row status.' },
];

function FeatureCard({ f, index }: { f: Feature; index: number }) {
  const Icon = f.icon;
  return (
    <motion.li
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.45, delay: (index % 5) * 0.06 }}
      className="group relative overflow-hidden rounded-2xl border border-border bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.08)] transition duration-300 hover:-translate-y-1.5 hover:border-accent/40 hover:shadow-[0_24px_48px_-20px_rgba(30,111,240,0.35)] focus-within:-translate-y-1.5 focus-within:border-accent/40"
    >
      <span className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-accent/10 opacity-0 blur-2xl transition duration-500 group-hover:opacity-100" aria-hidden />
      <span className="relative grid h-12 w-12 place-items-center rounded-xl bg-soft text-primary transition duration-300 group-hover:bg-primary group-hover:text-white group-hover:shadow-lg group-hover:shadow-primary/30">
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <h3 className="relative mt-5 font-heading text-base font-semibold text-text">{f.title}</h3>
      <p className="relative mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
    </motion.li>
  );
}

/* ---------------------------------------------------------------- stats strip */

function CountUp({ to, decimals = 0, suffix = '' }: { to: number; decimals?: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [value, setValue] = useState(reduce ? to : 0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) { setValue(to); return; }
    const controls = animate(0, to, { duration: 1.6, ease: 'easeOut', onUpdate: setValue });
    return () => controls.stop();
  }, [inView, to, reduce]);

  return (
    <span ref={ref} className="tabular-nums">
      {value.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}
    </span>
  );
}

export function StatsStrip() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setStats(null);
    getPlatformStats().then(setStats, (e: unknown) => setError(e instanceof Error ? e.message : 'Could not load statistics.'));
  }, []);
  useEffect(load, [load]);

  const items = stats
    ? [
        { label: 'Exams conducted', node: <CountUp to={stats.examsConducted} suffix="+" /> },
        { label: 'Candidates proctored', node: <CountUp to={stats.candidatesProctored} suffix="+" /> },
        { label: 'Violations caught', node: <CountUp to={stats.violationsCaught} suffix="+" /> },
        { label: 'Platform uptime', node: <CountUp to={stats.uptimePct} decimals={2} suffix="%" /> },
      ]
    : [];

  return (
    <div className="relative mx-auto max-w-7xl px-5 lg:px-8" aria-live="polite">
      <div className="rounded-3xl bg-[linear-gradient(135deg,#0A4DA6,#1E6FF0)] px-6 py-10 text-white shadow-[0_30px_60px_-25px_rgba(10,77,166,0.7)] sm:px-12">
        {error ? (
          <div role="alert" className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-white/90">{error}</p>
            <button type="button" onClick={load} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              <RefreshCw className="h-4 w-4" aria-hidden /> Retry
            </button>
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-8 text-center lg:grid-cols-4" aria-busy={!stats}>
            {stats
              ? items.map((it) => (
                  <div key={it.label} className="flex flex-col-reverse">
                    <dt className="mt-1 text-sm text-white/80">{it.label}</dt>
                    <dd className="font-heading text-3xl font-bold sm:text-4xl">{it.node}</dd>
                  </div>
                ))
              : [0, 1, 2, 3].map((i) => (
                  <div key={i} className="mx-auto space-y-2" aria-hidden>
                    <div className="mx-auto h-9 w-28 animate-pulse rounded-lg bg-white/25" />
                    <div className="mx-auto h-4 w-32 animate-pulse rounded bg-white/15" />
                  </div>
                ))}
          </dl>
        )}
      </div>
    </div>
  );
}

export default function FeatureGrid() {
  return (
    <section id="features" aria-labelledby="features-title" className="bg-soft py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-primary-600"><Gauge className="h-4 w-4" aria-hidden /> Built for integrity</p>
          <h2 id="features-title" className="mt-3 font-heading text-3xl font-bold text-text sm:text-4xl">Ten layers that keep every exam honest</h2>
          <p className="mt-4 text-muted">Proctoring that mentors can trust and candidates can understand, from the first system check to the final penalty review.</p>
        </div>
        <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {FEATURES.map((f, i) => <FeatureCard key={f.title} f={f} index={i} />)}
        </ul>
      </div>
    </section>
  );
}
