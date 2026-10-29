"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Search, SearchX } from "lucide-react";

export interface FaqItem {
  id: string;
  q: string;
  a: string;
}

interface FaqProps {
  items: FaqItem[];
  searchable?: boolean;
}

export function Faq({ items, searchable = true }: FaqProps) {
  const base = useId();
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(items[0]?.id ?? null);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  const visible = useMemo(() => {
    const t = query.trim().toLowerCase();
    return t ? items.filter((i) => i.q.toLowerCase().includes(t) || i.a.toLowerCase().includes(t)) : items;
  }, [items, query]);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = visible.length - 1;
    const map: Record<string, number> = {
      ArrowDown: index === last ? 0 : index + 1,
      ArrowUp: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    };
    if (e.key in map) {
      e.preventDefault();
      buttons.current[map[e.key]]?.focus();
    }
  };

  return (
    <div>
      {searchable && (
        <div className="relative mb-6">
          <label htmlFor={`${base}-search`} className="sr-only">
            Search frequently asked questions
          </label>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
          <input
            id={`${base}-search`}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search questions, e.g. camera, antivirus, laptop"
            className="w-full rounded-xl border border-border bg-white py-3 pl-11 pr-4 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-500 focus:border-accent focus:ring-4 focus:ring-accent/20"
          />
          <p className="sr-only" role="status" aria-live="polite">
            {visible.length} {visible.length === 1 ? "result" : "results"}
          </p>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-soft px-6 py-12 text-center">
          <SearchX className="h-8 w-8 text-slate-500" aria-hidden />
          <p className="mt-3 font-heading font-semibold text-slate-900">No matching questions</p>
          <p className="mt-1 text-sm text-slate-500">Try a different keyword or write to support@dev102.example.</p>
          <button
            type="button"
            onClick={() => setQuery("")}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/40"
          >
            Clear search
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((item, i) => {
            const open = openId === item.id;
            const panelId = `${base}-panel-${item.id}`;
            const btnId = `${base}-btn-${item.id}`;
            return (
              <li key={item.id} className="rounded-2xl border border-border bg-white shadow-sm transition-shadow hover:shadow-md">
                <h3>
                  <button
                    ref={(el) => {
                      buttons.current[i] = el;
                    }}
                    id={btnId}
                    type="button"
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => setOpenId(open ? null : item.id)}
                    onKeyDown={(e) => onKey(e, i)}
                    className="flex w-full items-center justify-between gap-4 rounded-2xl px-5 py-4 text-left font-heading text-base font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30"
                  >
                    {item.q}
                    <ChevronDown className={`h-5 w-5 shrink-0 text-primary transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
                  </button>
                </h3>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      id={panelId}
                      role="region"
                      aria-labelledby={btnId}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <p className="px-5 pb-5 text-sm leading-relaxed text-slate-500">{item.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
