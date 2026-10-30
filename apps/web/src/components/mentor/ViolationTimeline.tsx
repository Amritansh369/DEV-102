"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowDownUp, CheckCircle2, Clock, ImageIcon, MessageSquareQuote, SearchX, ShieldAlert, Undo2 } from "lucide-react";
import type { Severity, Violation } from "@/lib/types";
import type { ReviewRecord } from "@/lib/api";
import { SEVERITIES, SEVERITY_STYLE, VIOLATION_LABEL, formatClock, offsetFrom, type Verdict, type VerdictOf } from "./meta";
import { SeverityChip } from "./MentorShell";

type StatusFilter = "ALL" | "PENDING" | "CONFIRMED" | "OVERRULED";

interface ViolationTimelineProps {
  violations: Violation[];
  startedAt: string;
  verdictOf: VerdictOf;
  reviews: Record<string, ReviewRecord>;
  highlightId?: string | null;
  onReview: (violation: Violation) => void;
  onOpenEvidence: (violation: Violation) => void;
}

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "OVERRULED", label: "Overruled" },
];

function VerdictBadge({ verdict, marks }: { verdict?: Verdict; marks?: number }) {
  if (verdict === "CONFIRMED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-danger">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> {marks ? `Confirmed, −${marks} marks` : "Penalty confirmed"}
      </span>
    );
  }
  if (verdict === "OVERRULED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-success">
        <Undo2 className="h-3.5 w-3.5" aria-hidden /> Overruled
      </span>
    );
  }
  return <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Pending review</span>;
}

export function ViolationTimeline({ violations, startedAt, verdictOf, reviews, highlightId, onReview, onOpenEvidence }: ViolationTimelineProps) {
  const reduce = useReducedMotion();
  const [severities, setSeverities] = useState<Severity[]>([]);
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [newestFirst, setNewestFirst] = useState(false);

  const counts = useMemo(() => {
    const c: Record<Severity, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    violations.forEach((v) => {
      c[v.severity] += 1;
    });
    return c;
  }, [violations]);

  const visible = useMemo(() => {
    const list = violations.filter((v) => {
      if (severities.length > 0 && !severities.includes(v.severity)) return false;
      const verdict = verdictOf(v);
      if (status === "PENDING") return !verdict;
      if (status === "CONFIRMED" || status === "OVERRULED") return verdict === status;
      return true;
    });
    return list.sort((a, b) => (Date.parse(a.at) - Date.parse(b.at)) * (newestFirst ? -1 : 1));
  }, [violations, severities, status, newestFirst, verdictOf]);

  const toggleSeverity = (s: Severity) => setSeverities((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  const filtersActive = severities.length > 0 || status !== "ALL";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Filter by severity" className="flex flex-wrap gap-1.5">
          {SEVERITIES.map((s) => {
            const on = severities.includes(s);
            return (
              <button key={s} type="button" aria-pressed={on} onClick={() => toggleSeverity(s)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30 ${on ? "border-primary bg-primary text-white" : "border-border bg-white text-slate-700 hover:border-accent"}`}>
                <span className={`h-2 w-2 rounded-full ${SEVERITY_STYLE[s].dot}`} aria-hidden />
                {SEVERITY_STYLE[s].label}
                <span className={on ? "text-blue-100" : "text-slate-500"}>{counts[s]}</span>
              </button>
            );
          })}
        </div>
        <div role="group" aria-label="Filter by review status" className="inline-flex rounded-xl border border-border bg-white p-0.5">
          {STATUS_OPTIONS.map((o) => (
            <button key={o.value} type="button" aria-pressed={status === o.value} onClick={() => setStatus(o.value)} className={`rounded-lg px-3 py-1 text-xs font-semibold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30 ${status === o.value ? "bg-primary/10 text-primary" : "text-slate-600 hover:bg-soft"}`}>
              {o.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setNewestFirst((v) => !v)} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30">
          <ArrowDownUp className="h-3.5 w-3.5" aria-hidden /> {newestFirst ? "Newest first" : "Oldest first"}
        </button>
      </div>

      <p className="mt-3 text-xs text-slate-500" role="status" aria-live="polite">
        Showing {visible.length} of {violations.length} events
      </p>

      {visible.length === 0 ? (
        <div className="mt-4 flex flex-col items-center rounded-2xl border border-dashed border-border bg-soft px-6 py-12 text-center">
          <SearchX className="h-8 w-8 text-slate-500" aria-hidden />
          <p className="mt-3 font-heading font-semibold">{violations.length === 0 ? "No violations recorded" : "No events match these filters"}</p>
          <p className="mt-1 text-sm text-slate-500">{violations.length === 0 ? "This session has a clean record so far." : "Try removing a filter to see more events."}</p>
          {filtersActive && (
            <button type="button" onClick={() => { setSeverities([]); setStatus("ALL"); }} className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/40">
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <ol className="relative mt-4 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-px before:bg-border">
          {visible.map((v, i) => {
            const verdict = verdictOf(v);
            const style = SEVERITY_STYLE[v.severity];
            const record = reviews[v.id];
            const label = VIOLATION_LABEL[v.code];
            return (
              <motion.li key={v.id} id={`violation-${v.id}`} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: Math.min(i, 8) * 0.03 }} className="relative pb-4 pl-11 last:pb-0">
                <span className={`absolute left-0 top-3 flex h-7 w-7 items-center justify-center rounded-full ring-4 ring-white ${style.dot}`}>
                  <ShieldAlert className="h-3.5 w-3.5 text-white" aria-hidden />
                </span>
                <div className={`rounded-2xl border bg-white p-4 shadow-sm transition ${highlightId === v.id ? "border-accent ring-4 ring-accent/20" : "border-border"} ${verdict === "OVERRULED" ? "opacity-75" : ""}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-heading text-sm font-semibold text-slate-900">{label}</h4>
                    <SeverityChip severity={v.severity} />
                    <VerdictBadge verdict={verdict} marks={v.penaltyMarks} />
                    <span className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500">
                      <Clock className="h-3.5 w-3.5" aria-hidden />
                      <time dateTime={v.at} className="font-mono">{formatClock(v.at)}</time>
                      <span aria-hidden>·</span>
                      <span>{offsetFrom(startedAt, v.at)}</span>
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{v.message}</p>
                  {record && (
                    <p className="mt-3 flex gap-2 rounded-xl bg-soft p-3 text-xs text-slate-700">
                      <MessageSquareQuote className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                      <span><span className="font-semibold">Proctor note:</span> {record.reason}</span>
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {v.evidenceUrl && (
                      <button type="button" onClick={() => onOpenEvidence(v)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-accent hover:text-primary-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30">
                        <ImageIcon className="h-3.5 w-3.5" aria-hidden /> View evidence
                      </button>
                    )}
                    <button type="button" onClick={() => onReview(v)} aria-label={`${verdict ? "Change review for" : "Review"} ${label} at ${formatClock(v.at)}`} className={`ml-auto rounded-lg px-3 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/40 ${verdict ? "text-primary hover:bg-primary/10" : "bg-primary text-white hover:bg-primary-600"}`}>
                      {verdict ? "Change review" : "Review"}
                    </button>
                  </div>
                </div>
              </motion.li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
