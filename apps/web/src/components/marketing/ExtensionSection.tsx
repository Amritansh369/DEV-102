"use client";

import { useEffect, useState } from "react";
import { Plus, Puzzle } from "lucide-react";
import type { DesktopDownloads } from "@/lib/api";

interface BrowserInfo {
  name: string;
  store: "chrome" | "edge";
}

const CHROME: BrowserInfo = { name: "Chrome", store: "chrome" };

/** Browsers that run this Chrome-style extension. Null means this one cannot, such as Firefox or Safari. */
function detectBrowser(ua: string, brave: boolean): BrowserInfo | null {
  if (/Edg\//.test(ua)) return { name: "Edge", store: "edge" };
  if (/OPR\//.test(ua)) return { name: "Opera", store: "chrome" };
  if (brave) return { name: "Brave", store: "chrome" };
  if (/Firefox\/|FxiOS\//.test(ua) || !/Chrome\//.test(ua) || /Mobile|Android/.test(ua)) return null;
  return CHROME;
}

/** Adds the extension from the store, which is the only way a browser allows. The button appears once a listing exists. */
export function ExtensionSection({ release }: { release: DesktopDownloads | null }) {
  const [browser, setBrowser] = useState<BrowserInfo | null | undefined>(undefined);

  useEffect(() => {
    setBrowser(detectBrowser(navigator.userAgent, "brave" in navigator));
  }, []);

  const stores = release?.extensionStores;
  const storeUrl = browser ? stores?.[browser.store] ?? stores?.chrome : undefined;

  return (
    <section id="extension" className="scroll-mt-24 px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-white p-6 shadow-sm">
        <h2 className="flex items-center gap-2 font-heading text-2xl font-semibold text-slate-900"><Puzzle className="h-6 w-6 text-primary" aria-hidden /> Take the exam in your browser</h2>
        <p className="mt-2 text-slate-500">Add our extension, then enter the exam link and password from your invitation email. Your exam coordinator will tell you if this is allowed.</p>

        {browser === null ? (
          <p role="status" className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">This browser cannot run the extension. Open this page in Chrome, Edge, Brave or Opera on a computer, or use the desktop app.</p>
        ) : browser === undefined ? null : storeUrl ? (
          <a href={storeUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-white hover:bg-primary-600">
            <Plus className="h-5 w-5" aria-hidden /> Add to {browser.name}
          </a>
        ) : (
          <p role="status" className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">The extension is coming soon to {browser.name}. Use the desktop app for now.</p>
        )}
      </div>
    </section>
  );
}
