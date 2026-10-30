"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { animate, motion, useReducedMotion } from "framer-motion";
import { AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, CalendarClock, ChevronLeft, ChevronRight, ClipboardCheck, Download, Flag, Gauge, ListChecks, Radio, RefreshCw, Search, SearchX, Users, X, type LucideIcon } from "lucide-react";
import type { Exam, Severity, ViolationCode } from "@/lib/types";
import { ApiError, getMentorDashboard, pollLiveEvent, type MentorDashboardData, type QueueItem } from "@/lib/api";
import { effectiveVerdict, useMentorStore } from "@/lib/mentorStore";
import { MentorShell, Avatar, StatusChip } from "@/components/mentor/MentorShell";
import { SEVERITY_RANK, SEVERITY_STYLE, VIOLATION_LABEL, adjustRisk, downloadCsv, formatDateTime, formatRelative, riskBand, riskTone, type RiskBand, type VerdictOf } from "@/components/mentor/meta";

type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: MentorDashboardData };
type RiskFilter = "ALL" | RiskBand;
type ReviewFilter = "ALL" | "PENDING" | "DONE";
type SortKey = "risk" | "name" | "pending" | "recent";
type SortDir = "asc" | "desc";

interface Row {
  item: QueueItem;
  adjusted: number;
  reviewed: number;
  total: number;
  pending: number;
  top: Array<{ code: ViolationCode; severity: Severity }>;
}

const PAGE_SIZE = 8;
const card = "rounded-2xl border border-border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05),0_12px_32px_-16px_rgba(10,77,166,0.18)]";
const focusRing = "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/40";

const EXAM_STATUS: Record<Exam["status"], string> = {
  DRAFT: "bg-amber-50 text-amber-700",
  SCHEDULED: "bg-blue-50 text-primary-600",
  LIVE: "bg-green-50 text-success",
  COMPLETED: "bg-slate-100 text-slate-700",
};

export default function MentorDashboardPage() {
  return (
    <MentorShell>
      <Dashboard />
    </MentorShell>
  );
}

function Dashboard() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    getMentorDashboard()
      .then((data) => !cancelled && setState({ status: "ready", data }))
      .catch((e: unknown) => !cancelled && setState({ status: "error", message: e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong." }));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (state.status === "ready") return <DashboardView initial={state.data} />;

  if (state.status === "error") {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <div role="alert" className={`${card} p-8`}>
          <AlertCircle className="mx-auto h-10 w-10 text-danger" aria-hidden />
          <h1 className="mt-3 font-heading text-xl font-semibold">Could not load your review queue</h1>
          <p className="mt-1 text-sm text-slate-500">{state.message}</p>
          <button type="button" onClick={() => setAttempt((a) => a + 1)} className={`mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white ${focusRing}`}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6" role="status" aria-label="Loading review queue">
      <div className="h-12 w-72 animate-pulse rounded-xl bg-white" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-white" />)}</div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-white" />)}</div>
      <div className="space-y-2 rounded-2xl bg-white p-4">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-soft" />)}</div>
    </div>
  );
}

/* ---------------- small pieces ---------------- */

function CountUp({ value, suffix = "" }: { value: number; suffix?: string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const controls = animate(prev.current, value, { duration: reduce ? 0 : 0.6, ease: "easeOut", onUpdate: (n) => setShown(Math.round(n)) });
    prev.current = value;
    return () => controls.stop();
  }, [value, reduce]);
  return (
    <>
      <span aria-hidden>{shown}{suffix}</span>
      <span className="sr-only">{value}{suffix}</span>
    </>
  );
}

function Stat({ icon: Icon, label, value, suffix, hint }: { icon: LucideIcon; label: string; value: number; suffix?: string; hint: string }) {
  return (
    <div className={`${card} p-5`}>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" aria-hidden /></span>
        <p className="text-sm font-medium text-slate-500">{label}</p>
      </div>
      <p className="mt-3 font-heading text-3xl font-semibold text-slate-900"><CountUp value={value} suffix={suffix} /></p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-xl border border-border bg-white p-0.5">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${focusRing} ${value === o.value ? "bg-primary text-white" : "text-slate-600 hover:bg-soft"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SortTh({ label, k, sortKey, dir, onSort }: { label: string; k: SortKey; sortKey: SortKey; dir: SortDir; onSort: (k: SortKey) => void }) {
  const active = sortKey === k;
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"} className="px-4 py-3">
      <button type="button" onClick={() => onSort(k)} className={`inline-flex items-center gap-1 rounded font-semibold uppercase ${focusRing}`}>
        {label} <Icon className="h-3.5 w-3.5" aria-hidden />
      </button>
    </th>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-border bg-soft px-1.5 py-0.5 font-mono text-[10px] text-slate-600">{children}</kbd>;
}

/* ---------------- dashboard ---------------- */

function DashboardView({ initial }: { initial: MentorDashboardData }) {
  const router = useRouter();
  const reviews = useMentorStore((s) => s.reviews);
  const toast = useMentorStore((s) => s.toast);
  const searchRef = useRef<HTMLInputElement>(null);

  const [queue, setQueue] = useState<QueueItem[]>(initial.queue);
  const [live, setLive] = useState(true);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [examId, setExamId] = useState("ALL");
  const [risk, setRisk] = useState<RiskFilter>("ALL");
  const [code, setCode] = useState<ViolationCode | "ALL">("ALL");
  const [review, setReview] = useState<ReviewFilter>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("risk");
  const [dir, setDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  /* realtime simulation */
  useEffect(() => {
    if (!live) return;
    let stopped = false;
    const timer = setInterval(() => {
      pollLiveEvent()
        .then((ev) => {
          if (stopped || !ev) return;
          setQueue((cur) => cur.map((it) => (it.session.id === ev.sessionId ? { ...it, session: { ...it.session, riskScore: ev.riskScore, warnings: ev.warnings }, violations: [...it.violations, ev.violation] } : it)));
          setFlashId(ev.sessionId);
          toast({ tone: "info", title: `${ev.candidateName}: ${VIOLATION_LABEL[ev.violation.code]}`, description: `${SEVERITY_STYLE[ev.violation.severity].label} severity · risk now ${ev.riskScore}` });
        })
        .catch(() => undefined);
    }, 8000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [live, toast]);

  useEffect(() => {
    if (!flashId) return;
    const t = setTimeout(() => setFlashId(null), 2500);
    return () => clearTimeout(t);
  }, [flashId]);

  const rows = useMemo<Row[]>(() => {
    const verdictOf: VerdictOf = (v) => effectiveVerdict(v, reviews);
    return queue.map((item) => {
      const reviewed = item.violations.filter((v) => verdictOf(v)).length;
      const seen = new Set<ViolationCode>();
      const top: Row["top"] = [];
      [...item.violations].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]).forEach((v) => {
        if (!seen.has(v.code)) {
          seen.add(v.code);
          top.push({ code: v.code, severity: v.severity });
        }
      });
      return { item, adjusted: adjustRisk(item.session.riskScore, item.violations, verdictOf), reviewed, total: item.violations.length, pending: item.violations.length - reviewed, top };
    });
  }, [queue, reviews]);

  const presentCodes = useMemo(() => {
    const set = new Set<ViolationCode>();
    queue.forEach((it) => it.violations.forEach((v) => set.add(v.code)));
    return Array.from(set).sort((a, b) => VIOLATION_LABEL[a].localeCompare(VIOLATION_LABEL[b]));
  }, [queue]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = rows.filter((r) => {
      const { candidate, session, violations } = r.item;
      if (examId !== "ALL" && session.examId !== examId) return false;
      if (risk !== "ALL" && riskBand(r.adjusted) !== risk) return false;
      if (code !== "ALL" && !violations.some((v) => v.code === code)) return false;
      if (review === "PENDING" && r.pending === 0) return false;
      if (review === "DONE" && r.pending > 0) return false;
      return !t || `${candidate.name} ${candidate.userId} ${candidate.email}`.toLowerCase().includes(t);
    });
    const sign = dir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      switch (sortKey) {
        case "name": return a.item.candidate.name.localeCompare(b.item.candidate.name) * sign;
        case "pending": return (a.pending - b.pending) * sign;
        case "recent": return (Date.parse(a.item.session.startedAt) - Date.parse(b.item.session.startedAt)) * sign;
        default: return (a.adjusted - b.adjusted) * sign;
      }
    });
  }, [rows, examId, risk, code, review, q, sortKey, dir]);

  useEffect(() => setPage(1), [q, examId, risk, code, review, sortKey, dir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const totals = useMemo(() => {
    const total = rows.reduce((s, r) => s + r.total, 0);
    const reviewed = rows.reduce((s, r) => s + r.reviewed, 0);
    const awaiting = rows.filter((r) => r.pending > 0).length;
    const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.adjusted, 0) / rows.length) : 0;
    return { total, reviewed, awaiting, avg, pct: total ? Math.round((reviewed / total) * 100) : 100 };
  }, [rows]);

  const nextRow = useMemo(() => rows.filter((r) => r.pending > 0).sort((a, b) => b.adjusted - a.adjusted)[0], [rows]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "n" && nextRow) {
        router.push(`/proctor/sessions/${nextRow.item.session.id}`);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [nextRow, router]);

  const onSort = (k: SortKey) => {
    if (k === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setDir(k === "name" ? "asc" : "desc");
    }
  };

  const filtersActive = q !== "" || examId !== "ALL" || risk !== "ALL" || code !== "ALL" || review !== "ALL";
  const clearFilters = () => { setQ(""); setExamId("ALL"); setRisk("ALL"); setCode("ALL"); setReview("ALL"); };

  const pageIds = pageRows.map((r) => r.item.session.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPage = pageIds.some((id) => selected.has(id));
  const toggleAll = () => setSelected((cur) => {
    const next = new Set(cur);
    pageIds.forEach((id) => (allOnPage ? next.delete(id) : next.add(id)));
    return next;
  });
  const toggleOne = (id: string) => setSelected((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const exportSelected = () => {
    const chosen = rows.filter((r) => selected.has(r.item.session.id));
    downloadCsv("flagged-sessions.csv", [
      ["Candidate", "Candidate ID", "Exam", "Risk (adjusted)", "Violations", "Pending review", "Status"],
      ...chosen.map((r) => [r.item.candidate.name, r.item.candidate.userId, r.item.examCode, String(r.adjusted), String(r.total), String(r.pending), r.item.session.status]),
    ]);
    toast({ tone: "success", title: `Exported ${chosen.length} ${chosen.length === 1 ? "session" : "sessions"}` });
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold text-slate-900">{greeting}, {initial.mentorName.replace("Prof. ", "Prof. ").split(" ").slice(0, 2).join(" ")}</h1>
          <p className="mt-1 text-slate-500">{totals.awaiting === 0 ? "Everything flagged has been reviewed." : `${totals.awaiting} flagged ${totals.awaiting === 1 ? "session is" : "sessions are"} waiting for your review.`}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" role="switch" aria-checked={live} onClick={() => setLive((v) => !v)} className={`inline-flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-sm font-semibold text-slate-700 ${focusRing}`}>
            <Radio className={`h-4 w-4 ${live ? "text-success" : "text-slate-500"}`} aria-hidden />
            Live updates {live ? "on" : "paused"}
          </button>
          {nextRow ? (
            <Link href={`/proctor/sessions/${nextRow.item.session.id}`} className={`inline-flex items-center gap-2 rounded-xl bg-cta px-4 py-2.5 text-sm font-semibold text-slate-900 shadow transition hover:brightness-105 ${focusRing}`}>
              Review next <Kbd>N</Kbd>
            </Link>
          ) : null}
        </div>
      </header>

      <section aria-label="Quick stats" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Flag} label="Flagged sessions" value={rows.length} hint={`${rows.filter((r) => r.item.session.status === "LIVE").length} still live`} />
        <Stat icon={ClipboardCheck} label="Awaiting review" value={totals.awaiting} hint={`${totals.total - totals.reviewed} violations pending`} />
        <Stat icon={Gauge} label="Average risk" value={totals.avg} hint="After overruled events are removed" />
        <Stat icon={ListChecks} label="Review progress" value={totals.pct} suffix="%" hint={`${totals.reviewed} of ${totals.total} violations reviewed`} />
      </section>

      <section aria-labelledby="exams-h">
        <h2 id="exams-h" className="font-heading text-xl font-semibold">Assigned exams</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {initial.exams.map(({ exam }) => {
            const own = rows.filter((r) => r.item.session.examId === exam.id);
            const total = own.reduce((s, r) => s + r.total, 0);
            const done = own.reduce((s, r) => s + r.reviewed, 0);
            const pct = total ? Math.round((done / total) * 100) : 100;
            const on = examId === exam.id;
            return (
              <motion.button key={exam.id} type="button" whileHover={{ y: -2 }} aria-pressed={on} onClick={() => setExamId(on ? "ALL" : exam.id)} className={`${card} p-5 text-left transition ${focusRing} ${on ? "!border-primary ring-2 ring-primary/20" : ""}`}>
                <span className="flex items-center justify-between gap-2">
                  <span className="rounded bg-soft px-1.5 py-0.5 font-mono text-xs text-slate-500">{exam.code}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${EXAM_STATUS[exam.status]}`}>{exam.status === "LIVE" ? "Live" : exam.status === "SCHEDULED" ? "Scheduled" : exam.status === "COMPLETED" ? "Completed" : "Draft"}</span>
                </span>
                <span className="mt-3 block font-heading text-sm font-semibold leading-snug text-slate-900">{exam.title}</span>
                <span className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"><CalendarClock className="h-3.5 w-3.5" aria-hidden />{formatDateTime(exam.startsAt)}</span>
                <span className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><Users className="h-3.5 w-3.5" aria-hidden />{exam.candidateCount} candidates · {own.length} flagged</span>
                <span className="mt-3 block h-1.5 rounded-full bg-slate-100"><span className="block h-1.5 rounded-full bg-gradient-to-r from-primary-600 to-accent transition-all" style={{ width: `${pct}%` }} /></span>
                <span className="mt-1 block text-xs text-slate-500">{own.length === 0 ? "Nothing flagged yet" : `${pct}% reviewed`}</span>
              </motion.button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="queue-h">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="queue-h" className="font-heading text-xl font-semibold">Flagged sessions</h2>
          <p className="hidden text-xs text-slate-500 sm:block">Press <Kbd>/</Kbd> to search, <Kbd>N</Kbd> for the next session</p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[14rem] flex-1">
            <label htmlFor="queue-search" className="sr-only">Search candidates</label>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
            <input ref={searchRef} id="queue-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, candidate ID or email" className="w-full rounded-xl border border-border bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition placeholder:text-slate-500 focus:border-accent focus:ring-4 focus:ring-accent/20" />
          </div>
          <Segmented<RiskFilter> label="Filter by risk" value={risk} onChange={setRisk} options={[{ value: "ALL", label: "All risk" }, { value: "HIGH", label: "High" }, { value: "MEDIUM", label: "Medium" }, { value: "LOW", label: "Low" }]} />
          <Segmented<ReviewFilter> label="Filter by review state" value={review} onChange={setReview} options={[{ value: "ALL", label: "All" }, { value: "PENDING", label: "Pending" }, { value: "DONE", label: "Reviewed" }]} />
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-500">
            <span className="sr-only sm:not-sr-only">Violation</span>
            <select value={code} onChange={(e) => setCode(e.target.value as ViolationCode | "ALL")} className={`rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-slate-900 ${focusRing}`}>
              <option value="ALL">Any violation</option>
              {presentCodes.map((c) => <option key={c} value={c}>{VIOLATION_LABEL[c]}</option>)}
            </select>
          </label>
          {filtersActive && <button type="button" onClick={clearFilters} className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-semibold text-primary hover:bg-primary/10 ${focusRing}`}><X className="h-3.5 w-3.5" aria-hidden /> Clear</button>}
        </div>

        {selected.size > 0 && (
          <div role="region" aria-label="Bulk actions" className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-primary px-4 py-2.5 text-sm text-white">
            <span className="font-semibold">{selected.size} selected</span>
            <button type="button" onClick={exportSelected} className={`inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 font-semibold hover:bg-white/25 ${focusRing}`}><Download className="h-4 w-4" aria-hidden /> Export CSV</button>
            <button type="button" onClick={() => setSelected(new Set())} className={`ml-auto rounded-lg px-3 py-1.5 font-semibold hover:bg-white/15 ${focusRing}`}>Clear selection</button>
          </div>
        )}

        <p className="mt-3 text-xs text-slate-500" role="status" aria-live="polite">{filtered.length} of {rows.length} sessions</p>

        {rows.length === 0 ? (
          <div className={`${card} mt-4 flex flex-col items-center px-6 py-16 text-center`}>
            <ClipboardCheck className="h-10 w-10 text-success" aria-hidden />
            <p className="mt-3 font-heading text-lg font-semibold">All clear</p>
            <p className="mt-1 text-sm text-slate-500">No sessions have been flagged for your exams.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className={`${card} mt-4 flex flex-col items-center px-6 py-16 text-center`}>
            <SearchX className="h-10 w-10 text-slate-500" aria-hidden />
            <p className="mt-3 font-heading text-lg font-semibold">No sessions match these filters</p>
            <button type="button" onClick={clearFilters} className={`mt-4 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white ${focusRing}`}>Clear filters</button>
          </div>
        ) : (
          <>
            <div className={`${card} relative mt-4 overflow-x-auto`}>
              <table className="w-full min-w-[880px] border-collapse text-left">
                <caption className="sr-only">Flagged sessions awaiting proctor review</caption>
                <thead className="bg-soft text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="w-10 px-4 py-3">
                      <input type="checkbox" aria-label="Select all sessions on this page" checked={allOnPage} ref={(el) => { if (el) el.indeterminate = !allOnPage && someOnPage; }} onChange={toggleAll} className="h-4 w-4 rounded border-border accent-primary" />
                    </th>
                    <SortTh label="Candidate" k="name" sortKey={sortKey} dir={dir} onSort={onSort} />
                    <th scope="col" className="px-4 py-3 font-semibold">Exam</th>
                    <SortTh label="Risk" k="risk" sortKey={sortKey} dir={dir} onSort={onSort} />
                    <th scope="col" className="px-4 py-3 font-semibold">Top violations</th>
                    <SortTh label="Review" k="pending" sortKey={sortKey} dir={dir} onSort={onSort} />
                    <SortTh label="Started" k="recent" sortKey={sortKey} dir={dir} onSort={onSort} />
                    <th scope="col" className="px-4 py-3"><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pageRows.map((r) => {
                    const { candidate, session, examCode } = r.item;
                    const tone = riskTone(r.adjusted);
                    const pct = r.total ? Math.round((r.reviewed / r.total) * 100) : 100;
                    return (
                      <tr key={session.id} className={`transition-colors duration-700 ${flashId === session.id ? "bg-blue-50" : "bg-white hover:bg-soft/60"}`}>
                        <td className="px-4 py-3">
                          <input type="checkbox" aria-label={`Select ${candidate.name}`} checked={selected.has(session.id)} onChange={() => toggleOne(session.id)} className="h-4 w-4 rounded border-border accent-primary" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={candidate.name} size="sm" src={candidate.photoUrl ?? candidate.avatarUrl} />
                            <div className="min-w-0">
                              <Link href={`/proctor/sessions/${session.id}`} className={`rounded text-sm font-semibold text-slate-900 hover:text-primary-600 hover:underline ${focusRing}`}>{candidate.name}</Link>
                              <p className="truncate font-mono text-xs text-slate-500">{candidate.userId}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{examCode}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-20 rounded-full bg-slate-100" aria-hidden><span className={`block h-2 rounded-full transition-all ${tone.bar}`} style={{ width: `${r.adjusted}%` }} /></span>
                            <span className={`font-heading text-sm font-semibold ${tone.text}`}>{r.adjusted}</span>
                            {r.adjusted !== session.riskScore && <span className="text-xs text-slate-500 line-through" aria-label={`Originally ${session.riskScore}`}>{session.riskScore}</span>}
                          </div>
                          <p className="mt-0.5 text-xs text-slate-500">{tone.label} · {session.warnings} {session.warnings === 1 ? "warning" : "warnings"}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex max-w-[16rem] flex-wrap gap-1">
                            {r.top.slice(0, 3).map((t) => <span key={t.code} className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLE[t.severity].chip}`}>{VIOLATION_LABEL[t.code]}</span>)}
                            {r.top.length > 3 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">+{r.top.length - 3}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-slate-900">{r.reviewed} / {r.total}</p>
                          <span className="mt-1 block h-1.5 w-20 rounded-full bg-slate-100" aria-hidden><span className="block h-1.5 rounded-full bg-primary-600" style={{ width: `${pct}%` }} /></span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusChip status={session.status} />
                          <p className="mt-1 text-xs text-slate-500">{formatRelative(session.startedAt)}</p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link href={`/proctor/sessions/${session.id}`} aria-label={`${r.pending > 0 ? "Review" : "Open"} ${candidate.name}`} className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${focusRing} ${r.pending > 0 ? "bg-primary text-white hover:bg-primary-600" : "border border-border text-slate-700 hover:bg-soft"}`}>
                            {r.pending > 0 ? "Review" : "Open"} <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
              <span>Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
              <div className="flex items-center gap-2">
                <span>Page {safePage} of {pageCount}</span>
                <button type="button" onClick={() => setPage(safePage - 1)} disabled={safePage === 1} aria-label="Previous page" className={`rounded-lg border border-border bg-white p-1.5 hover:bg-soft disabled:opacity-40 ${focusRing}`}><ChevronLeft className="h-4 w-4" aria-hidden /></button>
                <button type="button" onClick={() => setPage(safePage + 1)} disabled={safePage === pageCount} aria-label="Next page" className={`rounded-lg border border-border bg-white p-1.5 hover:bg-soft disabled:opacity-40 ${focusRing}`}><ChevronRight className="h-4 w-4" aria-hidden /></button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
