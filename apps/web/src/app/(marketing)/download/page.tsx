"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Download, ExternalLink, HardDrive, Loader2, MonitorCheck, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { Faq, type FaqItem } from "@/components/marketing/Faq";
import { CtaBanner } from "@/components/marketing/CtaBanner";
import { OrgBackdrop } from "@/components/layout/OrgBackdrop";
import { getDesktopDownloads, type DesktopDownloads } from "@/lib/api";
import { API_ORIGIN } from "@/lib/http";

type OS = "Windows" | "macOS" | "Linux" | "Other";
type CheckStatus = "ok" | "warn" | "fail";

interface HintCheck {
  label: string;
  value: string;
  status: CheckStatus;
  hint: string;
}

interface NavigatorExtras extends Navigator {
  deviceMemory?: number;
  connection?: { downlink?: number; effectiveType?: string };
}

/** Registered by the installer (electron-builder.yml `protocols`); opening it launches or focuses the installed app. */
const APP_LINK = "dev102://open";
/** Set once this browser downloaded the installer or opened the app, so the page leads with "Open the app" next time. */
const INSTALLED_KEY = "dev102.appInstalled";

/** API-relative installer links (a local build) go to the API; GitHub Releases links are absolute. */
const absolute = (url: string) => (url.startsWith("/") ? `${API_ORIGIN}${url}` : url);

function detectOS(ua: string): OS {
  if (/Windows/i.test(ua)) return "Windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "macOS";
  if (/Linux|X11/i.test(ua) && !/Android/i.test(ua)) return "Linux";
  return "Other";
}

const STEPS = [
  { t: "Download the installer", d: "Save the setup file. Windows may say it is from an unknown publisher: choose More info, then Run anyway." },
  { t: "Run the setup", d: "Double-click the file and choose Install. Administrator rights are not required." },
  { t: "Join with your exam link", d: "Paste the exam link and enter the password from your invitation email." },
  { t: "Complete the system check", d: "Allow camera and microphone and test your network. Do this the day before." },
];

const FAQS: FaqItem[] = [
  { id: "os", q: "Does the app run on Mac, Linux or a phone?", a: "Not yet. The secure exam browser currently supports Windows 10 and 11 only. Please use a Windows laptop or ask your institute for a lab machine." },
  { id: "av", q: "My antivirus warns about the installer. Is it safe?", a: "The installer is not code-signed yet, so Windows SmartScreen may show an unknown-publisher warning, and some antivirus tools flag any app that watches the screen. Download it only from this page. If your antivirus blocks it, contact your exam coordinator before turning protection off." },
  { id: "cam", q: "Why does the app need my camera and microphone?", a: "The camera verifies your identity and detects multiple people. The microphone only measures sound level. The consent screen lists everything before the exam begins." },
  { id: "apps", q: "Will the app close my other programs?", a: "No. Nothing is closed or blocked. Your entire screen is shared with your proctor, and other apps, tabs and AI tools are reported to them." },
  { id: "net", q: "What if my internet drops during the exam?", a: "Your timer pauses and answers are saved on your device. They sync when you reconnect, and you get the lost time back while the exam window is open. Outages are reported to the proctor." },
  { id: "second", q: "Can I use an external monitor?", a: "Yes. Your proctor sees every connected display, and an extra monitor is flagged." },
  { id: "uninstall", q: "How do I remove the app after the exam?", a: "Open Settings, then Apps, and uninstall DEV102 Proctor. No background service is left behind." },
];

const REQUIREMENTS = ["Windows 10 (64-bit) or 11", "4 GB RAM minimum, 8 GB recommended", "Webcam and microphone", "Screen of 1366 × 768 or larger", "Stable 2 Mbps+ connection"];

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === "ok") return <CheckCircle2 className="h-5 w-5 text-success" aria-hidden />;
  if (status === "warn") return <TriangleAlert className="h-5 w-5 text-warning" aria-hidden />;
  return <AlertCircle className="h-5 w-5 text-danger" aria-hidden />;
}

export default function DownloadPage() {
  const [os, setOs] = useState<OS | null>(null);
  const [checks, setChecks] = useState<HintCheck[] | null>(null);
  const [release, setRelease] = useState<DesktopDownloads | null>(null);
  const [releaseError, setReleaseError] = useState(false);

  useEffect(() => {
    let alive = true;
    getDesktopDownloads().then((r) => { if (alive) setRelease(r); }, () => { if (alive) setReleaseError(true); });
    return () => { alive = false; };
  }, []);
  const windows = release?.builds.find((b) => b.os === "windows");
  // Browsers cannot tell a page whether an app is installed (on Windows an unknown app link even opens a system
  // dialog), so the page remembers, per browser, that the app was downloaded or opened before.
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    try { setInstalled(window.localStorage.getItem(INSTALLED_KEY) === "1"); } catch { /* storage blocked: lead with download */ }
  }, []);
  const rememberInstalled = () => {
    try { window.localStorage.setItem(INSTALLED_KEY, "1"); } catch { /* storage blocked */ }
  };

  useEffect(() => {
    document.title = "Download the Exam App | DEV102 Smart Proctoring";
    let cancelled = false;
    const nav = navigator as NavigatorExtras;
    const detected = detectOS(nav.userAgent);
    setOs(detected);

    const run = async () => {
      let cams = 0;
      try {
        const devices = await navigator.mediaDevices?.enumerateDevices();
        cams = devices ? devices.filter((d) => d.kind === "videoinput").length : 0;
      } catch {
        cams = 0;
      }
      const cores = nav.hardwareConcurrency ?? 0;
      const mem = nav.deviceMemory;
      const w = window.screen.width * (window.devicePixelRatio || 1);
      const h = window.screen.height * (window.devicePixelRatio || 1);
      const link = nav.connection?.downlink;
      const list: HintCheck[] = [
        { label: "Operating system", value: detected, status: detected === "Windows" ? "ok" : "fail", hint: detected === "Windows" ? "Supported" : "Only Windows 10 and 11 are supported right now." },
        { label: "Camera", value: cams > 0 ? `${cams} detected` : "None detected", status: cams > 0 ? "ok" : "fail", hint: cams > 0 ? "You will be asked for permission in the app." : "Connect or enable a webcam." },
        { label: "CPU threads", value: cores ? String(cores) : "Unknown", status: cores >= 4 ? "ok" : cores > 0 ? "warn" : "warn", hint: cores >= 4 ? "Good for live analysis." : "4 or more is recommended." },
        { label: "Memory", value: mem ? `${mem} GB (approx.)` : "Not reported", status: mem === undefined ? "warn" : mem >= 4 ? "ok" : "fail", hint: mem === undefined ? "Your browser does not share this. Check Task Manager." : "At least 4 GB is required." },
        { label: "Screen size", value: `${Math.round(w)} × ${Math.round(h)}`, status: w >= 1366 && h >= 768 ? "ok" : "fail", hint: "1366 × 768 or larger." },
        { label: "Connection", value: link ? `~${link} Mbps` : "Not reported", status: link === undefined ? "warn" : link >= 2 ? "ok" : "warn", hint: "The app runs a precise speed test during the system check." },
      ];
      if (!cancelled) setChecks(list);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const supported = os === "Windows";

  return (
    <main>
      <section className="relative overflow-hidden px-4 pb-16 pt-20 sm:px-6">
        <OrgBackdrop look="student" tone="light" />
        <div className="relative mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-sm font-medium text-primary shadow-sm ring-1 ring-border">
            <ShieldCheck className="h-4 w-4" aria-hidden /> Required for every exam
          </span>
          <h1 className="mt-5 font-heading text-4xl font-semibold text-slate-900 sm:text-5xl">Download the DEV102 Exam App</h1>
          <p className="mt-4 text-lg text-slate-500">Your exam runs inside this app. Install it before exam day so the checks are not a last-minute surprise.</p>

          <div className="mx-auto mt-8 max-w-md rounded-2xl border border-border bg-white p-6 shadow-[0_24px_48px_-20px_rgba(10,77,166,0.35)]">
            {os === null ? (
              <div className="flex items-center justify-center gap-2 py-4 text-slate-500" role="status">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Detecting your system…
              </div>
            ) : (
              <>
                {windows?.available ? (
                  installed ? (
                    <>
                      <a href={APP_LINK} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cta px-6 py-3.5 font-semibold text-slate-900 shadow-md transition hover:-translate-y-0.5 hover:brightness-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cta/40">
                        <ExternalLink className="h-5 w-5" aria-hidden /> Open the app
                      </a>
                      <a href={absolute(windows.url)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-white px-6 py-3 font-semibold text-primary transition hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">
                        <RefreshCw className="h-5 w-5" aria-hidden /> Update to v{release?.version}
                      </a>
                      <p className="mt-2 text-sm text-slate-500">The update installs over your current version and replaces it, so nothing old is left behind. The app also updates itself when it opens and offers to restart.</p>
                    </>
                  ) : (
                    <>
                      <a href={absolute(windows.url)} onClick={rememberInstalled} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cta px-6 py-3.5 font-semibold text-slate-900 shadow-md transition hover:-translate-y-0.5 hover:brightness-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cta/40">
                        <Download className="h-5 w-5" aria-hidden /> Download for Windows
                      </a>
                      <a href={APP_LINK} onClick={() => { rememberInstalled(); setInstalled(true); }} className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-2 hover:underline">
                        <ExternalLink className="h-4 w-4" aria-hidden /> Already installed? Open the app
                      </a>
                    </>
                  )
                ) : (
                  <p role="status" className="flex items-center justify-center gap-2 rounded-xl bg-slate-50 px-4 py-3.5 text-sm text-slate-600">
                    {release || releaseError ? <><TriangleAlert className="h-4 w-4 text-warning" aria-hidden /> {releaseError ? "Could not reach the download server. Try again in a minute." : "The installer is not published yet. Ask your exam coordinator for the link."}</> : <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Finding the latest version…</>}
                  </p>
                )}
                {windows?.available && release && (
                  <p className="mt-3 flex items-center justify-center gap-3 text-sm text-slate-500">
                    <span>Version {release.version}</span>
                    {windows.sizeMb > 0 && <><span aria-hidden>•</span><span className="inline-flex items-center gap-1"><HardDrive className="h-3.5 w-3.5" aria-hidden /> {windows.sizeMb} MB</span></>}
                  </p>
                )}
                {release?.beta && (
                  <p className="mt-2 text-xs text-slate-500">
                    Testing a new version? <a href={release.beta.url} className="font-medium text-primary underline-offset-2 hover:underline">Download test version {release.beta.version}</a> (it updates to newer test versions automatically).
                  </p>
                )}
                {!supported && (
                  <p role="alert" className="mt-4 flex gap-2 rounded-xl bg-amber-50 p-3 text-left text-sm text-slate-900">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                    We detected {os}. The exam app is Windows-only, so download it on the Windows laptop you will use for the exam.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="steps-h" className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <h2 id="steps-h" className="text-center font-heading text-3xl font-semibold text-slate-900">Install in four steps</h2>
          <ol className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.t} className="rounded-2xl border border-border bg-white p-5 shadow-sm">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary font-heading font-semibold text-white">{i + 1}</span>
                <h3 className="mt-3 font-heading font-semibold text-slate-900">{s.t}</h3>
                <p className="mt-1 text-sm text-slate-500">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="req-h" className="bg-soft px-4 py-16 sm:px-6">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <h2 id="req-h" className="font-heading text-3xl font-semibold text-slate-900">System requirements</h2>
            <ul className="mt-5 space-y-3">
              {REQUIREMENTS.map((r) => (
                <li key={r} className="flex gap-2 text-sm text-slate-900"><CheckCircle2 className="h-5 w-5 shrink-0 text-primary" aria-hidden />{r}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-border bg-white p-6 shadow-sm lg:col-span-3">
            <h3 className="flex items-center gap-2 font-heading font-semibold text-slate-900"><MonitorCheck className="h-5 w-5 text-primary" aria-hidden /> Quick check of this device</h3>
            <p className="mt-1 text-xs text-slate-500">Hints from your browser only. The app performs the full system check.</p>
            {checks === null ? (
              <div className="mt-4 space-y-3" role="status" aria-label="Checking your device">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />
                ))}
              </div>
            ) : (
              <ul className="mt-4 divide-y divide-border">
                {checks.map((c) => (
                  <li key={c.label} className="flex items-center gap-3 py-3">
                    <StatusIcon status={c.status} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">{c.label}: <span className="font-normal">{c.value}</span></p>
                      <p className="text-xs text-slate-500">{c.hint}</p>
                    </div>
                    <span className="sr-only">{c.status === "ok" ? "Passed" : c.status === "warn" ? "Needs attention" : "Failed"}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="faq-h" className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <h2 id="faq-h" className="mb-8 text-center font-heading text-3xl font-semibold text-slate-900">Frequently asked questions</h2>
          <Faq items={FAQS} />
        </div>
      </section>

      <CtaBanner title="Installed already?" description="Head back to the candidate lobby and sign in with your Exam ID to continue." primary={{ label: "Go to login", href: "/login" }} secondary={{ label: "How proctoring works", href: "/security" }} />
    </main>
  );
 }
