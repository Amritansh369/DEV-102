"use client";

import { useEffect, useState } from "react";
import { Check, ClipboardCopy, Download, ExternalLink, Puzzle } from "lucide-react";
import type { DesktopDownloads } from "@/lib/api";

interface BrowserInfo {
  name: string;
  /** Where the browser lists extensions. Web pages cannot link to these, so the page offers to copy it. */
  extensionsPage: string;
  store: "chrome" | "edge";
}

const CHROME: BrowserInfo = { name: "Chrome", extensionsPage: "chrome://extensions", store: "chrome" };

/** Browsers that run this Chrome-style extension. Null means this one cannot, such as Firefox or Safari. */
function detectBrowser(ua: string, brave: boolean): BrowserInfo | null {
  if (/Edg\//.test(ua)) return { name: "Edge", extensionsPage: "edge://extensions", store: "edge" };
  if (/OPR\//.test(ua)) return { name: "Opera", extensionsPage: "opera://extensions", store: "chrome" };
  if (brave) return { name: "Brave", extensionsPage: "brave://extensions", store: "chrome" };
  if (/Firefox\/|FxiOS\//.test(ua) || !/Chrome\//.test(ua) || /Mobile|Android/.test(ua)) return null;
  return CHROME;
}

/** Adds the extension to the visitor's own browser: one click from a store listing, or the manual steps until there is one. */
export function ExtensionSection({ release, failed }: { release: DesktopDownloads | null; failed: boolean }) {
  const [browser, setBrowser] = useState<BrowserInfo | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setBrowser(detectBrowser(navigator.userAgent, "brave" in navigator));
  }, []);

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const storeUrl = browser ? release?.extensionStores?.[browser.store] : undefined;
  const zip = release?.extension;

  return (
    <section id="extension" className="scroll-mt-24 px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-white p-6 shadow-sm">
        <h2 className="flex items-center gap-2 font-heading text-2xl font-semibold text-slate-900"><Puzzle className="h-6 w-6 text-primary" aria-hidden /> Take the exam in your browser</h2>
        <p className="mt-2 text-slate-500">Add our extension, then enter the exam link and password from your invitation email. Your exam coordinator will tell you if this is allowed.</p>

        {browser === null ? (
          <p role="status" className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">This browser cannot run the extension. Open this page in Chrome, Edge, Brave or Opera on a computer, or use the desktop app.</p>
        ) : browser === undefined ? null : storeUrl ? (
          <a href={storeUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-white hover:bg-primary-600">
            <ExternalLink className="h-5 w-5" aria-hidden /> Add to {browser.name}
          </a>
        ) : zip ? (
          <>
            <a href={zip.url} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-white hover:bg-primary-600">
              <Download className="h-5 w-5" aria-hidden /> Add to {browser.name}
            </a>
            <p className="mt-2 text-sm text-slate-500">Version {zip.version} · {zip.sizeMb} MB</p>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-600">
              <li>Unzip the downloaded file into a folder you will keep.</li>
              <li>
                Copy this address into a new tab:{" "}
                <button type="button" onClick={() => void copy(browser.extensionsPage)} className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800 hover:bg-slate-200">
                  {browser.extensionsPage} {copied ? <Check className="h-3.5 w-3.5 text-success" aria-hidden /> : <ClipboardCopy className="h-3.5 w-3.5" aria-hidden />}
                  <span className="sr-only">{copied ? "Copied" : "Copy"}</span>
                </button>
              </li>
              <li>Turn on Developer mode, choose Load unpacked, and pick that folder.</li>
              <li>Click the extension&apos;s toolbar button, then enter your exam link and password.</li>
            </ol>
          </>
        ) : (
          <p role="status" className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">{failed ? "Could not reach the download server. Try again in a minute." : "The extension is not available yet."}</p>
        )}
      </div>
    </section>
  );
}
