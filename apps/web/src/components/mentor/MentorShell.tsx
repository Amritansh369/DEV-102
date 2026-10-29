"use client";

import Link from "next/link";
import { useRequireRole, useSession } from "@/lib/session";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, LogOut, ShieldCheck, TriangleAlert, X, type LucideIcon } from "lucide-react";
import type { Severity, Session } from "@/lib/types";
import { useMentorStore, type ToastTone } from "@/lib/mentorStore";
import { SEVERITY_STYLE, avatarTone, initials } from "./meta";

const TOAST_TONE: Record<ToastTone, { icon: LucideIcon; cls: string }> = {
  success: { icon: CheckCircle2, cls: "text-success" },
  error: { icon: TriangleAlert, cls: "text-danger" },
  info: { icon: Info, cls: "text-primary-600" },
};

function Toaster() {
  const toasts = useMentorStore((s) => s.toasts);
  const dismiss = useMentorStore((s) => s.dismissToast);
  return (
    <div role="region" aria-label="Notifications" aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,22rem)] flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const { icon: Icon, cls } = TOAST_TONE[t.tone];
          return (
            <motion.div key={t.id} layout initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 40 }} className="pointer-events-auto flex gap-3 rounded-2xl border border-border bg-white p-4 shadow-[0_12px_32px_-12px_rgba(15,23,42,0.35)]">
              <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${cls}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">{t.title}</p>
                {t.description && <p className="mt-0.5 text-xs text-slate-500">{t.description}</p>}
              </div>
              <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss notification" className="rounded-md p-1 text-slate-500 hover:bg-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function Logo() {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white">
        <ShieldCheck className="h-5 w-5" aria-hidden />
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/images/logo.png" alt="" className="h-9 w-auto" onError={() => setFailed(true)} />;
}

export function MentorShell({ children }: { children: ReactNode }) {
  useRequireRole(["MENTOR", "ADMIN"]);
  const pathname = usePathname();
  const me = useSession((st) => st.user);
  const name = me?.name ?? "Proctor";
  return (
    <div className="min-h-screen bg-soft text-slate-900">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-white">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-border bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link href="/proctor" aria-label="Proctor console home" className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30">
            <Logo />
            <span className="hidden font-heading text-sm font-semibold text-primary sm:inline">Proctor console</span>
          </Link>
          <nav aria-label="Proctor" className="ml-4 flex gap-1">
            <Link href="/proctor" aria-current={pathname === "/proctor" ? "page" : undefined} className={`rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30 ${pathname === "/proctor" ? "bg-primary/10 text-primary" : "text-slate-600 hover:bg-soft"}`}>
              Review queue
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-right leading-tight sm:block">
              <span className="block text-sm font-semibold">{name}</span>
              <span className="block text-xs text-slate-500">Proctor</span>
            </span>
            <Avatar name={name.replace(/^(Dr|Prof)\.?\s+/, "")} />
            <Link href="/login" aria-label="Sign out" className="rounded-lg p-2 text-slate-500 hover:bg-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30">
              <LogOut className="h-5 w-5" aria-hidden />
            </Link>
          </div>
        </div>
      </header>
      <main id="main">{children}</main>
      <Toaster />
    </div>
  );
}

const AVATAR_SIZE = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-16 w-16 text-xl" };

export function Avatar({ name, size = "md", src }: { name: string; size?: keyof typeof AVATAR_SIZE; src?: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived API URL
    return <img src={src} alt="" className={`shrink-0 rounded-full object-cover ring-2 ring-white shadow-sm ${AVATAR_SIZE[size]}`} />;
  }
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center justify-center rounded-full font-heading font-semibold ${AVATAR_SIZE[size]} ${avatarTone(name)}`}>
      {initials(name)}
    </span>
  );
}

export function SeverityChip({ severity }: { severity: Severity }) {
  const s = SEVERITY_STYLE[severity];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${s.chip}`}>{s.label}</span>;
}

const STATUS: Record<Session["status"], { label: string; cls: string; dot?: string }> = {
  WAITING: { label: "Waiting", cls: "bg-slate-100 text-slate-700" },
  LIVE: { label: "Live", cls: "bg-green-50 text-success", dot: "bg-success animate-pulse" },
  SUBMITTED: { label: "Submitted", cls: "bg-blue-50 text-primary-600" },
  TERMINATED: { label: "Terminated", cls: "bg-red-50 text-danger" },
};

export function StatusChip({ status }: { status: Session["status"] }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${s.cls}`}>
      {s.dot && <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />}
      {s.label}
    </span>
  );
}
