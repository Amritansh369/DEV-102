import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AlertTriangle, BarChart3, Eye, Globe, ScanFace, ShieldAlert, WifiOff, type LucideIcon } from "lucide-react";
import { CtaBanner } from "@/components/marketing/CtaBanner";
import { ComparisonTable } from "@/components/marketing/ComparisonTable";

export const metadata: Metadata = {
  title: "Features | DEV102 Smart Proctoring",
  description: "AI proctoring, a monitored exam app, AI tool and search tracking, evidence-backed flags, offline mode and reports for MCQ assessments.",
};

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05),0_24px_48px_-16px_rgba(10,77,166,0.25)]">
      <div className="flex items-center gap-2 border-b border-border bg-soft px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
        <span className="ml-2 text-xs font-medium text-slate-500">{title}</span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Chip({ tone, children }: { tone: "danger" | "warning" | "success" | "info"; children: ReactNode }) {
  const cls = {
    danger: "bg-red-50 text-danger",
    warning: "bg-amber-50 text-amber-700",
    success: "bg-green-50 text-success",
    info: "bg-blue-50 text-primary-600",
  }[tone];
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>{children}</span>;
}

function ProctorPanel() {
  return (
    <Panel title="Live proctoring · Aarav Sharma">
      <div className="flex gap-4">
        <div className="relative aspect-[4/3] w-1/2 rounded-xl bg-gradient-to-br from-slate-200 to-slate-300">
          <div className="absolute left-[28%] top-[18%] h-[52%] w-[40%] rounded-lg border-2 border-success" />
          <div className="absolute right-[6%] top-[30%] h-[34%] w-[22%] rounded-lg border-2 border-danger" />
          <span className="absolute bottom-2 left-2 rounded bg-slate-900/70 px-1.5 py-0.5 text-[10px] text-white">2 faces</span>
        </div>
        <div className="flex-1 space-y-2">
          <p className="text-xs font-medium text-slate-500">Risk score</p>
          <div className="h-2 rounded-full bg-slate-100">
            <div className="h-2 w-[72%] rounded-full bg-gradient-to-r from-warning to-danger" />
          </div>
          <p className="font-heading text-2xl font-semibold text-slate-900">72</p>
          <div className="flex flex-wrap gap-1.5">
            <Chip tone="danger">Multiple faces</Chip>
            <Chip tone="warning">Gaze away 4s</Chip>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function ExamPanel() {
  return (
    <Panel title="Exam · Screen shared">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-900">Question 14 of 60</p>
        <span className="rounded-lg bg-primary px-2.5 py-1 font-mono text-sm text-white">42:18</span>
      </div>
      <div className="mt-3 grid grid-cols-10 gap-1.5" aria-hidden>
        {Array.from({ length: 30 }, (_, i) => (
          <span
            key={i}
            className={`flex h-6 items-center justify-center rounded text-[10px] font-medium ${
              i < 13 ? "bg-success/15 text-success" : i === 13 ? "bg-primary text-white" : i % 7 === 0 ? "bg-cta/30 text-amber-800" : "bg-slate-100 text-slate-500"
            }`}
          >
            {i + 1}
          </span>
        ))}
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
        <Eye className="h-3.5 w-3.5 text-primary" aria-hidden /> Every tab, app and AI chat is seen by the proctor
      </p>
    </Panel>
  );
}

function SearchPanel() {
  const rows = [
    { t: "10:42:08", u: "docs.python.org/3/library/heapq.html", ai: false },
    { t: "10:43:51", u: "google.com/search?q=time+complexity+heap+sort", ai: false },
    { t: "10:44:30", u: "chat.openai.com", ai: true },
  ];
  return (
    <Panel title="Activity log">
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.t} className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-xs ${r.ai ? "border-danger/30 bg-red-50" : "border-border"}`}>
            <span className="font-mono text-slate-500">{r.t}</span>
            <span className="flex-1 truncate text-slate-900">{r.u}</span>
            {r.ai && <Chip tone="danger">AI site</Chip>}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function WarningPanel() {
  const steps = [
    { label: "Warning 1 of 2", sub: "Gaze away · MEDIUM", tone: "bg-warning" },
    { label: "Warning 2 of 2", sub: "AI site opened · HIGH", tone: "bg-cta" },
    { label: "Auto-submitted", sub: "Third HIGH event", tone: "bg-danger" },
  ];
  return (
    <Panel title="Violation policy">
      <ol className="space-y-3">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center gap-3">
            <span className={`h-3 w-3 rounded-full ${s.tone}`} />
            <div>
              <p className="text-sm font-semibold text-slate-900">{s.label}</p>
              <p className="text-xs text-slate-500">{s.sub}</p>
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function OfflinePanel() {
  return (
    <Panel title="Connection">
      <div className="flex items-center gap-3 rounded-xl bg-amber-50 p-3">
        <WifiOff className="h-5 w-5 text-warning" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-slate-900">Network lost · 00:42</p>
          <p className="text-xs text-slate-500">Timer continues. Answers are saved on this device.</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <span>6 answers queued</span>
        <span className="font-medium text-primary-600">Syncing on reconnect</span>
      </div>
    </Panel>
  );
}

function ReportPanel() {
  const bars = [38, 64, 82, 55, 91, 47, 70];
  return (
    <Panel title="Results · JEE Mock Test 4">
      <div className="flex h-28 items-end gap-2" aria-hidden>
        {bars.map((h, i) => (
          <div key={i} className="flex-1 rounded-t-md bg-gradient-to-t from-primary to-accent" style={{ height: `${h}%` }} />
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Chip tone="success">Avg 68.4%</Chip>
        <Chip tone="warning">17 flagged</Chip>
        <Chip tone="info">CSV · PDF</Chip>
      </div>
    </Panel>
  );
}

interface Feature {
  id: string;
  icon: LucideIcon;
  title: string;
  body: string;
  points: string[];
  panel: ReactNode;
}

const FEATURES: Feature[] = [
  { id: "ai-proctoring", icon: ScanFace, title: "AI proctoring that watches the room, not the person", body: "MediaPipe-based analysis runs on the candidate's webcam stream and raises graded events instead of blunt pass or fail verdicts.", points: ["Multiple faces, no face, face mismatch and gaze away", "Risk score recalculated every few seconds", "Evidence snapshots attached to each event"], panel: <ProctorPanel /> },
  { id: "exam", icon: Eye, title: "Monitored exam app", body: "Candidates share their entire screen and work freely. Nothing is blocked or interrupted: what is on screen goes to the proctor, with a picture as proof.", points: ["Which AI tool was open, read from window titles", "Tab switches, other apps and extra monitors flagged at once", "No warnings on screen, marks deducted after proctor review"], panel: <ExamPanel /> },
  { id: "search", icon: Globe, title: "Search and browsing tracking", body: "Candidates can use anything. AI tools and searches are read from window titles, and the shared screen shows the rest.", points: ["Nothing is blocked", "AI tools flagged when they are seen", "Full log available to proctors during and after the exam"], panel: <SearchPanel /> },
  { id: "warnings", icon: AlertTriangle, title: "Warnings and disqualification", body: "A clear, configurable policy so candidates know where they stand and proctors do not have to improvise.", points: ["Default: two warnings, then auto-submit", "Critical events can submit immediately", "Proctors can send manual warnings or terminate"], panel: <WarningPanel /> },
  { id: "offline", icon: WifiOff, title: "Offline mode for unstable networks", body: "A dropped connection should not ruin an exam. Answers autosave locally and sync once the network returns.", points: ["Network loss logged as a low-severity event", "Timer stays authoritative", "Sync status always visible"], panel: <OfflinePanel /> },
  { id: "reports", icon: BarChart3, title: "Reports organizations can act on", body: "Scores, question analysis and a per-candidate violation timeline, ready to export for the placement cell or the institute.", points: ["Result and violation reports", "Review and overrule penalties with evidence", "CSV and PDF export"], panel: <ReportPanel /> },
];

export default function FeaturesPage() {
  return (
    <main>
      <section className="bg-gradient-to-b from-soft to-white px-4 pb-12 pt-20 text-center sm:px-6">
        <p className="mx-auto inline-flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-sm font-medium text-primary shadow-sm ring-1 ring-border">
          <ShieldAlert className="h-4 w-4" aria-hidden /> Everything an MCQ exam needs
        </p>
        <h1 className="mx-auto mt-5 max-w-3xl font-heading text-4xl font-semibold text-slate-900 sm:text-5xl">Proctoring built for fair, large-scale assessments</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-500">From the first system check to the final report, every step is monitored, explained to the candidate and open to human review.</p>
        <nav aria-label="Feature sections" className="mx-auto mt-8 flex max-w-3xl flex-wrap justify-center gap-2">
          {FEATURES.map((f) => (
            <a key={f.id} href={`#${f.id}`} className="rounded-full border border-border bg-white px-4 py-1.5 text-sm text-slate-900 transition hover:border-accent hover:text-primary-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30">
              {f.title.split(" ").slice(0, 2).join(" ")}
            </a>
          ))}
        </nav>
      </section>

      {FEATURES.map((f, i) => (
        <section key={f.id} id={f.id} aria-labelledby={`${f.id}-h`} className={`scroll-mt-20 px-4 py-16 sm:px-6 ${i % 2 === 1 ? "bg-soft" : "bg-white"}`}>
          <div className={`mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 [&>*]:min-w-0 ${i % 2 === 1 ? "lg:[&>div:first-child]:order-2" : ""}`}>
            <div>
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <f.icon className="h-6 w-6" aria-hidden />
              </span>
              <h2 id={`${f.id}-h`} className="mt-4 font-heading text-2xl font-semibold text-slate-900 sm:text-3xl">{f.title}</h2>
              <p className="mt-3 text-slate-500">{f.body}</p>
              <ul className="mt-5 space-y-2">
                {f.points.map((p) => (
                  <li key={p} className="flex gap-2 text-sm text-slate-900">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" /> {p}
                  </li>
                ))}
              </ul>
            </div>
            <div>{f.panel}</div>
          </div>
        </section>
      ))}

      <section aria-labelledby="compare-h" className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <h2 id="compare-h" className="text-center font-heading text-3xl font-semibold text-slate-900">How we compare</h2>
          <p className="mx-auto mb-8 mt-3 max-w-2xl text-center text-slate-500">Most online test tools stop at a browser tab and a few snapshots. Here is what changes with a dedicated secure app.</p>
          <ComparisonTable />
        </div>
      </section>

      <CtaBanner title="See it on your next exam" description="Run a pilot with 50 candidates and review every violation with your own proctors." primary={{ label: "Request a demo", href: "/login" }} secondary={{ label: "Read the security model", href: "/security" }} />
    </main>
  );
}
