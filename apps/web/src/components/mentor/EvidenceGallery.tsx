"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Download, ImageOff, Maximize2, ScanSearch, X, ZoomIn, ZoomOut } from "lucide-react";
import type { Severity, ViolationCode } from "@/lib/types";
import { VIOLATION_LABEL, formatClock } from "./meta";
import { SeverityChip } from "./MentorShell";
import { useDialog } from "./useDialog";

/** One item per violation; `id` is the violation id so other components can open it. */
export interface EvidenceItem {
  id: string;
  url: string;
  code: ViolationCode;
  severity: Severity;
  at: string;
  caption: string;
}

interface EvidenceGalleryProps {
  items: EvidenceItem[];
  /** Controlled lightbox: pass both to open it from elsewhere (for example the timeline). */
  openId?: string | null;
  onOpenIdChange?: (id: string | null) => void;
  onJumpToViolation?: (violationId: string) => void;
}

interface LightboxProps {
  items: EvidenceItem[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  onJump?: (violationId: string) => void;
}

function Lightbox({ items, index, onIndex, onClose, onJump }: LightboxProps) {
  const ref = useDialog(onClose);
  const [zoom, setZoom] = useState(false);
  const count = items.length;
  const item = items[index];

  const go = useCallback(
    (target: number) => {
      setZoom(false);
      onIndex(((target % count) + count) % count);
    },
    [count, onIndex],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") { e.preventDefault(); go(index + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(index - 1); }
      else if (e.key === "Home") { e.preventDefault(); go(0); }
      else if (e.key === "End") { e.preventDefault(); go(count - 1); }
      else if (e.key === "z" || e.key === "Z") setZoom((z) => !z);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [go, index, count]);

  const label = VIOLATION_LABEL[item.code];
  const btn = "rounded-lg p-2 text-slate-600 hover:bg-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/85 p-3 backdrop-blur-sm sm:p-6">
      <div ref={ref} role="dialog" aria-modal="true" aria-label={`Evidence ${index + 1} of ${count}: ${label}`} tabIndex={-1} className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl outline-none">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <h3 className="font-heading text-base font-semibold text-slate-900">{label}</h3>
          <SeverityChip severity={item.severity} />
          <time dateTime={item.at} className="font-mono text-xs text-slate-500">{formatClock(item.at)}</time>
          <span className="ml-auto text-xs font-medium text-slate-500" aria-live="polite">{index + 1} / {count}</span>
          <button type="button" onClick={() => setZoom((z) => !z)} aria-pressed={zoom} aria-label={zoom ? "Zoom out (Z)" : "Zoom in (Z)"} className={btn}>
            {zoom ? <ZoomOut className="h-5 w-5" aria-hidden /> : <ZoomIn className="h-5 w-5" aria-hidden />}
          </button>
          <a href={item.url} download={`evidence-${item.id}.svg`} aria-label="Download this image" className={btn}><Download className="h-5 w-5" aria-hidden /></a>
          {onJump && (
            <button type="button" onClick={() => { onClose(); onJump(item.id); }} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30">
              <ScanSearch className="h-4 w-4" aria-hidden /> Go to event
            </button>
          )}
          <button type="button" data-autofocus onClick={onClose} aria-label="Close evidence viewer" className={btn}><X className="h-5 w-5" aria-hidden /></button>
        </div>

        <div className="relative flex min-h-[16rem] flex-1 items-center justify-center overflow-auto bg-slate-900">
          <img src={item.url} alt={`${label}: ${item.caption}`} onClick={() => setZoom((z) => !z)} className={zoom ? "w-[200%] max-w-none cursor-zoom-out" : "max-h-[56vh] w-auto max-w-full cursor-zoom-in"} />
          {count > 1 && (
            <>
              <button type="button" onClick={() => go(index - 1)} aria-label="Previous evidence" className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/40"><ChevronLeft className="h-5 w-5" aria-hidden /></button>
              <button type="button" onClick={() => go(index + 1)} aria-label="Next evidence" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/40"><ChevronRight className="h-5 w-5" aria-hidden /></button>
            </>
          )}
        </div>

        <p className="border-t border-border px-4 py-3 text-sm text-slate-700">{item.caption}</p>
        <div role="group" aria-label="Evidence thumbnails" className="flex gap-2 overflow-x-auto border-t border-border bg-soft p-3">
          {items.map((t, i) => (
            <button key={t.id} type="button" onClick={() => go(i)} aria-label={`Show evidence ${i + 1}: ${VIOLATION_LABEL[t.code]}`} aria-current={i === index ? "true" : undefined} className={`h-14 w-24 shrink-0 overflow-hidden rounded-lg border-2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/40 ${i === index ? "border-primary" : "border-transparent opacity-70 hover:opacity-100"}`}>
              <img src={t.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
        <p className="sr-only">Use the left and right arrow keys to move between images, Z to zoom and Escape to close.</p>
      </div>
    </motion.div>
  );
}

export function EvidenceGallery({ items, openId, onOpenIdChange, onJumpToViolation }: EvidenceGalleryProps) {
  const [inner, setInner] = useState<string | null>(null);
  const active = openId !== undefined ? openId : inner;
  const setActive = (id: string | null) => (onOpenIdChange ? onOpenIdChange(id) : setInner(id));
  const index = active ? items.findIndex((i) => i.id === active) : -1;

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-soft px-6 py-12 text-center">
        <ImageOff className="h-8 w-8 text-slate-500" aria-hidden />
        <p className="mt-3 font-heading font-semibold">No evidence captured</p>
        <p className="mt-1 text-sm text-slate-500">Snapshots are stored only for flagged events.</p>
      </div>
    );
  }

  return (
    <>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <li key={item.id}>
            <button type="button" onClick={() => setActive(item.id)} aria-label={`Open evidence: ${VIOLATION_LABEL[item.code]} at ${formatClock(item.at)}`} className="group block w-full overflow-hidden rounded-2xl border border-border bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/40">
              <div className="relative aspect-[16/10] bg-slate-100">
                <img src={item.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                <span className="absolute left-2 top-2"><SeverityChip severity={item.severity} /></span>
                <span className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 opacity-0 shadow transition group-hover:opacity-100 group-focus-visible:opacity-100"><Maximize2 className="h-3.5 w-3.5 text-slate-700" aria-hidden /></span>
              </div>
              <div className="p-3">
                <p className="text-sm font-semibold text-slate-900">{VIOLATION_LABEL[item.code]}</p>
                <p className="font-mono text-xs text-slate-500">{formatClock(item.at)}</p>
              </div>
            </button>
          </li>
        ))}
      </ul>
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {index >= 0 && <Lightbox key="lightbox" items={items} index={index} onIndex={(i) => setActive(items[i].id)} onClose={() => setActive(null)} onJump={onJumpToViolation} />}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
