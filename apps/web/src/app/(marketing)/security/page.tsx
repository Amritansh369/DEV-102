import type { Metadata } from "next";
import { Camera, Eye, FileSearch, Fingerprint, Globe, Monitor, ScanFace, Scale, ShieldCheck, UserCheck, type LucideIcon } from "lucide-react";
import { CtaBanner } from "@/components/marketing/CtaBanner";

export const metadata: Metadata = {
  title: "Security & Privacy | DEV102 Smart Proctoring",
  description: "How DEV102 layers its anti-cheating controls, what we monitor, what we promise, and where the limits are.",
};

const LAYERS: { icon: LucideIcon; name: string; what: string }[] = [
  { icon: Fingerprint, name: "Identity", what: "Credentials from email, OTP and live face match against the registered photo." },
  { icon: Monitor, name: "Environment", what: "Blacklisted apps closed, VMs and remote desktops refused, one display, no mirroring." },
  { icon: Monitor, name: "Monitored exam", what: "Entire-screen sharing on every display, isolated browser tabs, and a picture kept with each flag." },
  { icon: Camera, name: "Behaviour", what: "Faces, gaze and screen-share continuity analysed during the exam." },
  { icon: Globe, name: "Browsing", what: "Allow-listed sites only; every URL and query logged; AI sites flagged." },
  { icon: UserCheck, name: "Human review", what: "Proctors watch live and confirm or overrule every penalty." },
];

const MONITORED = [
  "Webcam video during the exam (analysed live; snapshots stored only for flagged events)",
  "Your entire screen while the exam is open",
  "Microphone level, not the content of speech",
  "Running applications, display count and virtualisation signals",
  "AI tools and searches, read from window titles and the shared screen",
];

const NOT_MONITORED = [
  "Files, photos or messages on your device",
  "Anything after you submit or the exam ends",
  "Your browsing outside the exam window",
  "Keystrokes in other applications",
];

const LIMITS = [
  "No software can stop a second phone held out of the camera's view. We flag the behaviour that usually comes with it, such as repeated gaze away, and leave the judgement to a human.",
  "AI flags are probabilistic. A low light room or a shared household can cause false alarms, which is why no penalty is final without review.",
  "Network quality is outside our control. Offline mode protects answers but cannot protect the live monitoring signal.",
  "A determined attacker with dedicated hardware may still succeed. The goal is to make cheating costly and visible, not impossible.",
];

const REVIEW_STEPS = [
  { t: "Event detected", d: "A violation is logged with severity, time and a snapshot." },
  { t: "Policy applied", d: "The event adds to the risk score, and the proctor sees it at once with its proof." },
  { t: "Proctor review", d: "The proctor sees evidence and the browsing log in session detail." },
  { t: "Confirmed or overruled", d: "Overruled penalties are reversed and recorded in the audit trail." },
];

export default function SecurityPage() {
  return (
    <main>
      <section className="bg-gradient-to-b from-primary to-primary-600 px-4 pb-24 pt-20 text-center text-white sm:px-6">
        <ShieldCheck className="mx-auto h-10 w-10 text-cta" aria-hidden />
        <h1 className="mx-auto mt-4 max-w-3xl font-heading text-4xl font-semibold sm:text-5xl">Security you can explain to a candidate</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-blue-100">Layered controls, a plain-language consent screen and people in the loop for every penalty.</p>
      </section>

      <section aria-labelledby="layers-h" className="-mt-12 px-4 sm:px-6">
        <div className="mx-auto max-w-6xl rounded-3xl border border-border bg-white p-6 shadow-[0_24px_60px_-20px_rgba(10,77,166,0.35)] sm:p-10">
          <h2 id="layers-h" className="font-heading text-2xl font-semibold text-slate-900">Six layers of anti-cheating</h2>
          <p className="mt-2 text-slate-500">Each layer assumes the one before it can fail.</p>
          <ol className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {LAYERS.map((l, i) => (
              <li key={l.name} className="relative rounded-2xl border border-border bg-soft p-5 transition hover:-translate-y-0.5 hover:shadow-md">
                <span className="absolute right-4 top-3 font-heading text-4xl font-bold text-primary/10">{i + 1}</span>
                <l.icon className="h-6 w-6 text-primary" aria-hidden />
                <h3 className="mt-3 font-heading font-semibold text-slate-900">{l.name}</h3>
                <p className="mt-1 text-sm text-slate-500">{l.what}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="privacy-h" className="px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <h2 id="privacy-h" className="font-heading text-3xl font-semibold text-slate-900">Privacy and consent promises</h2>
          <p className="mt-2 max-w-2xl text-slate-500">Candidates see this list on the consent screen and must accept it before the exam starts.</p>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">
              <h3 className="flex items-center gap-2 font-heading font-semibold text-slate-900"><Eye className="h-5 w-5 text-primary" aria-hidden /> What we monitor</h3>
              <ul className="mt-4 space-y-3">
                {MONITORED.map((m) => (
                  <li key={m} className="flex gap-2 text-sm text-slate-900"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />{m}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">
              <h3 className="flex items-center gap-2 font-heading font-semibold text-slate-900"><ShieldCheck className="h-5 w-5 text-success" aria-hidden /> What we never do</h3>
              <ul className="mt-4 space-y-3">
                {NOT_MONITORED.map((m) => (
                  <li key={m} className="flex gap-2 text-sm text-slate-900"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />{m}</li>
                ))}
              </ul>
              <p className="mt-5 rounded-xl bg-soft p-3 text-xs text-slate-500">Evidence is retained for the period set by your institute and then deleted. Only organizations and assigned proctors can view it.</p>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="limits-h" className="bg-soft px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <h2 id="limits-h" className="flex items-center gap-3 font-heading text-3xl font-semibold text-slate-900"><Scale className="h-7 w-7 text-warning" aria-hidden /> Honest limits</h2>
          <p className="mt-2 text-slate-500">Proctoring is risk reduction, not a guarantee. Here is what we cannot promise.</p>
          <ul className="mt-6 space-y-3">
            {LIMITS.map((l) => (
              <li key={l} className="rounded-2xl border border-border border-l-4 border-l-warning bg-white p-4 text-sm text-slate-900 shadow-sm">{l}</li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="review-h" className="px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <h2 id="review-h" className="flex items-center gap-3 font-heading text-3xl font-semibold text-slate-900"><FileSearch className="h-7 w-7 text-primary" aria-hidden /> Evidence and human review</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-4">
            {REVIEW_STEPS.map((s, i) => (
              <li key={s.t} className="relative rounded-2xl border border-border bg-white p-5 shadow-sm">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary font-heading text-sm font-semibold text-white">{i + 1}</span>
                <h3 className="mt-3 font-heading font-semibold text-slate-900">{s.t}</h3>
                <p className="mt-1 text-sm text-slate-500">{s.d}</p>
              </li>
            ))}
          </ol>
          <p className="mt-6 flex items-center gap-2 text-sm text-slate-500"><ScanFace className="h-4 w-4" aria-hidden /> Candidates can request a review of any decision through their institute.</p>
        </div>
      </section>

      <CtaBanner title="Questions from your IT or legal team?" description="We will walk them through the data flow, retention and consent text before you run a single exam." primary={{ label: "Talk to us", href: "/login" }} secondary={{ label: "Download the app", href: "/download" }} />
    </main>
  );
}
