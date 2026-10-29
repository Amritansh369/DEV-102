"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Bot, ChevronLeft, ChevronRight, CornerDownRight, Download, Globe, Search, SearchX } from "lucide-react";
import type { BrowsingLog } from "@/lib/types";
import { downloadCsv, formatClock } from "./meta";

type SortKey = "at" | "site";
type SortDir = "asc" | "desc";

const PAGE_SIZES = [8, 15, 30];

function hostOf(url: string): string {
  if (url.startsWith("sandbox://search")) return "sandbox-search";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const SITE_NAMES: Record<string, string> = {
  "chatgpt.com": "ChatGPT", "chat.openai.com": "ChatGPT", "claude.ai": "Claude", "gemini.google.com": "Gemini",
  "aistudio.google.com": "Google AI Studio", "copilot.microsoft.com": "Microsoft Copilot", "perplexity.ai": "Perplexity",
  "chat.deepseek.com": "DeepSeek", "poe.com": "Poe", "you.com": "You.com", "phind.com": "Phind", "meta.ai": "Meta AI",
  "grok.com": "Grok", "chat.mistral.ai": "Mistral", "google.com": "Google", "bing.com": "Bing", "duckduckgo.com": "DuckDuckGo",
};

/** One stay on a site: when it was opened and what was typed there, in order. */
interface SiteVisit {
  key: string;
  site: string;
  host: string;
  url: string;
  at: string;
  ai: boolean;
  /** The candidate had been on this site earlier and switched back to it. */
  returned: boolean;
  queries: { id: string; at: string; text: string }[];
}

/**
 * Turns the log into "ChatGPT opened → typed …" visits. A visit starts whenever the site changes, so switching
 * tabs and coming back shows as a new visit marked `returned`. Mirrors groupVisits in the desktop monitorUtils.
 */
function groupVisits(logs: BrowsingLog[]): SiteVisit[] {
  const visits: SiteVisit[] = [];
  const seen = new Set<string>();
  for (const l of logs.slice().sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    const host = hostOf(l.url);
    let visit = visits[visits.length - 1];
    if (!visit || visit.host !== host) {
      const site = host === "sandbox-search" ? "Sandbox search" : SITE_NAMES[host] ?? (l.title && !l.query ? l.title : host);
      visit = { key: l.id, site, host, url: l.url, at: l.at, ai: false, returned: seen.has(host), queries: [] };
      visits.push(visit);
      seen.add(host);
    }
    if (l.flaggedAi) visit.ai = true;
    // The tracker reports text after a typing pause and again on Enter, so the same message can arrive twice.
    if (l.query && visit.queries[visit.queries.length - 1]?.text !== l.query) visit.queries.push({ id: l.id, at: l.at, text: l.query });
  }
  return visits;
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
  const [view, setView] = useState<"activity" | "table">("activity");

  const visits = useMemo(() => {
    const t = term.trim().toLowerCase();
    return groupVisits(logs).filter((v) => (!aiOnly || v.ai) && (!t || `${v.site} ${v.url} ${v.queries.map((q) => q.text).join(" ")}`.toLowerCase().includes(t)));
  }, [logs, term, aiOnly]);

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
        <div className="flex rounded-xl border border-border bg-white p-1" role="group" aria-label="Browsing view">
          {([["activity", "Activity"], ["table", "Table"]] as const).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30 ${view === id ? "bg-primary text-white" : "text-slate-700 hover:bg-soft"}`}>{label}</button>
          ))}
        </div>
        <button type="button" onClick={exportCsv} disabled={rows.length === 0} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:border-accent disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30">
          <Download className="h-4 w-4" aria-hidden /> Export CSV
        </button>
      </div>
      <p className="mt-3 text-xs text-slate-500" role="status" aria-live="polite">
        {rows.length} of {logs.length} entries · {aiCount} AI {aiCount === 1 ? "site" : "sites"} · {queryCount} typed {queryCount === 1 ? "query" : "queries"}
      </p>

      {view === "activity" && visits.length > 0 ? (
        <ol className="mt-4 space-y-3" aria-label={`Sites ${candidateName} opened and what was typed on them`}>
          {visits.map((v) => (
            <li key={v.key} className={`rounded-2xl border bg-white p-4 ${v.ai ? "border-danger/30 border-l-4 border-l-danger bg-red-50/40" : "border-border border-l-4 border-l-transparent"}`}>
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${v.ai ? "bg-danger text-white" : "bg-soft text-slate-500"}`}>
                  {v.ai ? <Bot className="h-4 w-4" aria-hidden /> : <Globe className="h-4 w-4" aria-hidden />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-900">
                    {v.returned ? <>Switched back to <strong><Highlight text={v.site} term={term} /></strong></> : <><strong><Highlight text={v.site} term={term} /></strong> opened</>}
                    {v.ai && <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-danger ring-1 ring-danger/20">AI site</span>}
                  </p>
                  <p className="truncate font-mono text-xs text-slate-500" title={v.url}>{v.url.replace(/^https?:\/\//, "")}</p>
                </div>
                <span className="shrink-0 font-mono text-xs text-slate-500">{formatClock(v.at)}</span>
              </div>
              {v.queries.length > 0 && (
                <ul className="mt-3 space-y-2 pl-12">
                  {v.queries.map((q) => (
                    <li key={q.id} className="flex items-start gap-2">
                      <CornerDownRight className={`mt-1 h-4 w-4 shrink-0 ${v.ai ? "text-danger" : "text-slate-400"}`} aria-hidden />
                      <p className="min-w-0 flex-1 text-sm text-slate-700">
                        <span className="text-slate-500">{v.ai ? "Typed" : "Searched"}:</span>{" "}
                        <span className={`rounded-lg px-2 py-0.5 font-mono text-xs ${v.ai ? "bg-white text-danger ring-1 ring-danger/30" : "bg-slate-100 text-slate-700"}`}>“<Highlight text={q.text} term={term} />”</span>
                      </p>
                      <span className="shrink-0 font-mono text-xs text-slate-500">{formatClock(q.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      ) : rows.length === 0 || (view === "activity" && visits.length === 0) ? (
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
