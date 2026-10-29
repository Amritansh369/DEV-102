"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Bot, ChevronLeft, ChevronRight, Download, Globe, Search, SearchX } from "lucide-react";
import type { BrowsingLog } from "@/lib/types";
import { downloadCsv, formatClock } from "./meta";

type SortKey = "at" | "site";
type SortDir = "asc" | "desc";

const PAGE_SIZES = [8, 15, 30];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function Highlight({ text, term }: { text: string; term: string }) {
  const t = term.trim();
  if (!t) return <>{text}</>;
  const parts = text.split(new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === t.toLowerCase() ? (
          <mark key={i} className="rounded bg-yellow-200 px-0.5 text-slate-900">{p}</mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export function BrowsingLogTable({ logs, candidateName }: { logs: BrowsingLog[]; candidateName: string }) {
  const [term, setTerm] = useState("");
  const [aiOnly, setAiOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("at");
  const [dir, setDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);

  const aiCount = useMemo(() => logs.filter((l) => l.flaggedAi).length, [logs]);
  const queryCount = useMemo(() => logs.filter((l) => l.query).length, [logs]);

  const rows = useMemo(() => {
    const t = term.trim().toLowerCase();
    const list = logs.filter((l) => {
      if (aiOnly && !l.flaggedAi) return false;
      return !t || `${l.url} ${l.title} ${l.query ?? ""}`.toLowerCase().includes(t);
    });
    const sign = dir === "asc" ? 1 : -1;
    return list.sort((a, b) => (sortKey === "at" ? (Date.parse(a.at) - Date.parse(b.at)) * sign : hostOf(a.url).localeCompare(hostOf(b.url)) * sign));
  }, [logs, term, aiOnly, sortKey, dir]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const onSort = (key: SortKey) => {
    if (key === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setDir("asc");
    }
  };

  const exportCsv = () =>
    downloadCsv(`browsing-log-${candidateName.toLowerCase().replace(/\s+/g, "-")}.csv`, [
      ["Time", "URL", "Title", "Query", "AI site"],
      ...rows.map((l) => [l.at, l.url, l.title, l.query ?? "", l.flaggedAi ? "Yes" : "No"]),
    ]);

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown className="h-3.5 w-3.5" aria-hidden />;
    return dir === "asc" ? <ArrowUp className="h-3.5 w-3.5" aria-hidden /> : <ArrowDown className="h-3.5 w-3.5" aria-hidden />;
  };
  const ariaSort = (k: SortKey) => (sortKey === k ? (dir === "asc" ? "ascending" : "descending") : "none");

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[14rem] flex-1">
          <label htmlFor="browsing-search" className="sr-only">Search browsing log</label>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
          <input id="browsing-search" type="search" value={term} onChange={(e) => { setTerm(e.target.value); setPage(1); }} placeholder="Search address, title or typed query" className="w-full rounded-xl border border-border bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition placeholder:text-slate-500 focus:border-accent focus:ring-4 focus:ring-accent/20" />
        </div>
        <button type="button" aria-pressed={aiOnly} onClick={() => { setAiOnly((v) => !v); setPage(1); }} className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30 ${aiOnly ? "border-danger bg-red-50 text-danger" : "border-border bg-white text-slate-700 hover:border-accent"}`}>
          <Bot className="h-4 w-4" aria-hidden /> AI sites only ({aiCount})
        </button>
        <button type="button" onClick={exportCsv} disabled={rows.length === 0} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:border-accent disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30">
          <Download className="h-4 w-4" aria-hidden /> Export CSV
        </button>
      </div>
      <p className="mt-3 text-xs text-slate-500" role="status" aria-live="polite">
        {rows.length} of {logs.length} entries · {aiCount} AI {aiCount === 1 ? "site" : "sites"} · {queryCount} typed {queryCount === 1 ? "query" : "queries"}
      </p>

      {rows.length === 0 ? (
        <div className="mt-4 flex flex-col items-center rounded-2xl border border-dashed border-border bg-soft px-6 py-12 text-center">
          {logs.length === 0 ? <Globe className="h-8 w-8 text-slate-500" aria-hidden /> : <SearchX className="h-8 w-8 text-slate-500" aria-hidden />}
          <p className="mt-3 font-heading font-semibold">{logs.length === 0 ? "No browsing recorded" : "Nothing matches your search"}</p>
          <p className="mt-1 text-sm text-slate-500">{logs.length === 0 ? "The candidate has not opened a sandbox tab." : "Try another keyword or switch off the AI filter."}</p>
        </div>
      ) : (
        <>
          <div className="relative mt-4 overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <caption className="sr-only">Browsing and search log for {candidateName}</caption>
              <thead className="bg-soft text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" aria-sort={ariaSort("at")} className="px-4 py-3">
                    <button type="button" onClick={() => onSort("at")} className="inline-flex items-center gap-1 font-semibold uppercase focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30">Time <SortIcon k="at" /></button>
                  </th>
                  <th scope="col" aria-sort={ariaSort("site")} className="px-4 py-3">
                    <button type="button" onClick={() => onSort("site")} className="inline-flex items-center gap-1 font-semibold uppercase focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30">Site <SortIcon k="site" /></button>
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">Typed query</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Flag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-white">
                {pageRows.map((l) => (
                  <tr key={l.id} className={l.flaggedAi ? "bg-red-50/70" : "hover:bg-soft/60"}>
                    <td className={`whitespace-nowrap px-4 py-3 align-top font-mono text-xs text-slate-500 ${l.flaggedAi ? "border-l-4 border-l-danger" : "border-l-4 border-l-transparent"}`}>{formatClock(l.at)}</td>
                    <td className="max-w-[22rem] px-4 py-3 align-top">
                      <p className="truncate text-sm font-semibold text-slate-900"><Highlight text={l.title} term={term} /></p>
                      <p className="truncate font-mono text-xs text-slate-500" title={l.url}><Highlight text={l.url.replace(/^https?:\/\//, "")} term={term} /></p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      {l.query ? (
                        <p className={`max-w-xs rounded-lg px-2.5 py-1.5 font-mono text-xs ${l.flaggedAi ? "bg-white text-danger ring-1 ring-danger/30" : "bg-slate-100 text-slate-700"}`}>
                          “<Highlight text={l.query} term={term} />”
                        </p>
                      ) : (
                        <span className="text-slate-500" aria-label="No query">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      {l.flaggedAi ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-danger ring-1 ring-danger/20"><Bot className="h-3.5 w-3.5" aria-hidden /> AI site</span>
                      ) : (
                        <span className="text-xs text-slate-500">Allowed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
            <label className="inline-flex items-center gap-2">
              Rows per page
              <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="rounded-lg border border-border bg-white px-2 py-1 text-slate-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30">
                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <div className="flex items-center gap-2">
              <span>Page {safePage} of {pageCount}</span>
              <button type="button" onClick={() => setPage(safePage - 1)} disabled={safePage === 1} aria-label="Previous page" className="rounded-lg border border-border p-1.5 hover:bg-soft disabled:opacity-40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30"><ChevronLeft className="h-4 w-4" aria-hidden /></button>
              <button type="button" onClick={() => setPage(safePage + 1)} disabled={safePage === pageCount} aria-label="Next page" className="rounded-lg border border-border p-1.5 hover:bg-soft disabled:opacity-40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30"><ChevronRight className="h-4 w-4" aria-hidden /></button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
