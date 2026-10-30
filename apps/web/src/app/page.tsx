import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Building2, Download, GraduationCap, LayoutDashboard, ShieldCheck, Video, type LucideIcon } from 'lucide-react';
import Hero from '@/components/marketing/Hero';
import FlowSteps from '@/components/marketing/FlowSteps';
import FeatureGrid, { StatsStrip } from '@/components/marketing/FeatureGrid';

export const metadata: Metadata = {
  title: 'Smart Proctoring Browser for Online Assessments | Where U Elevate',
  description:
    'Run secure MCQ exams with a monitored exam browser, AI face and gaze checks, full browsing and AI chat logs, live proctor monitoring and marks deducted by your policy.',
};

interface Audience { icon: LucideIcon; title: string; body: string; points: string[]; href: string; cta: string }

const AUDIENCES: Audience[] = [
  {
    icon: GraduationCap, title: 'Candidates', href: '/download', cta: 'Get the exam app',
    body: 'A clear, guided path to the exam with nothing hidden.',
    points: ['Step-by-step system check', 'Exact list of what is monitored', 'Autosave if the network drops'],
  },
  {
    icon: Video, title: 'Proctors', href: '/login?role=proctor', cta: 'Open live monitor',
    body: 'Watch many candidates at once and act within seconds.',
    points: ['Live screens and webcam grid', 'Risk scores and violation feed', 'Warn or terminate in one click'],
  },
  {
    icon: LayoutDashboard, title: 'Organizations', href: '/login?role=organization', cta: 'Go to organization panel',
    body: 'Set up, run and report on exams without spreadsheets.',
    points: ['Exam wizard with violation policy', 'CSV and Excel import with preview', 'Results and violation reports'],
  },
];

function Audiences() {
  return (
    <section aria-labelledby="audiences-title" className="bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary-600">One platform, three roles</p>
          <h2 id="audiences-title" className="mt-3 font-heading text-3xl font-bold text-text sm:text-4xl">Everyone gets the right workspace</h2>
        </div>
        <ul className="mt-12 grid gap-6 md:grid-cols-3">
          {AUDIENCES.map(({ icon: Icon, title, body, points, href, cta }) => (
            <li key={title} className="flex flex-col rounded-3xl border border-border bg-white p-8 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_16px_40px_-20px_rgba(15,23,42,0.15)] transition hover:-translate-y-1 hover:shadow-[0_28px_56px_-24px_rgba(10,77,166,0.35)]">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-white"><Icon className="h-6 w-6" aria-hidden /></span>
              <h3 className="mt-5 font-heading text-xl font-semibold text-text">{title}</h3>
              <p className="mt-2 text-sm text-muted">{body}</p>
              <ul className="mt-5 flex-1 space-y-2.5">
                {points.map((p) => (
                  <li key={p} className="flex items-center gap-2.5 text-sm text-text"><ShieldCheck className="h-4 w-4 shrink-0 text-accent" aria-hidden /> {p}</li>
                ))}
              </ul>
              <Link href={href} className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
                {cta} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function CtaBand() {
  return (
    <section aria-labelledby="cta-title" className="bg-white px-5 pb-20 lg:px-8 lg:pb-28">
      <div className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#0A4DA6,#0B5BD3_60%,#1E6FF0)] px-8 py-14 text-center text-white sm:px-16">
        <div className="pointer-events-none absolute -left-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" aria-hidden />
        <h2 id="cta-title" className="relative font-heading text-3xl font-bold sm:text-4xl">Ready to run your next assessment securely?</h2>
        <p className="relative mx-auto mt-4 max-w-xl text-white/85">Set up an exam in minutes, invite candidates in bulk, and watch the session live from any browser.</p>
        <div className="relative mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link href="/login?role=organization" className="inline-flex items-center gap-2 rounded-xl bg-cta px-6 py-3.5 text-sm font-bold text-slate-900 shadow-xl shadow-black/15 transition hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            <Building2 className="h-4 w-4" aria-hidden /> For Organization
          </Link>
          <Link href="/download" className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-bold text-primary transition hover:bg-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            <Download className="h-4 w-4" aria-hidden /> Download the app
          </Link>
        </div>
      </div>
    </section>
  );
}

const FOOTER_LINKS = [
  { href: '#journey', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '/security', label: 'Security' },
  { href: '/download', label: 'Download App' },
  { href: '/download#extension', label: 'Use Extension' },
  { href: '/login', label: 'Log in' },
];

function Footer() {
  return (
    <footer className="border-t border-border bg-soft">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 px-5 py-8 text-sm text-muted md:flex-row lg:px-8">
        <p>© {new Date().getFullYear()} Where U Elevate. All rights reserved.</p>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            {FOOTER_LINKS.map((l) => (
              <li key={l.href}><Link href={l.href} className="rounded transition hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">{l.label}</Link></li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}

export default function HomePage() {
  return (
    <main id="main" className="bg-white text-text">
      <Hero />
      <div className="-mt-6 pb-6"><StatsStrip /></div>
      <FlowSteps />
      <FeatureGrid />
      <Audiences />
      <CtaBand />
      <Footer />
    </main>
  );
}
