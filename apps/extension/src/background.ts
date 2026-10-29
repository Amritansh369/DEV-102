/**
 * Service worker. While an exam session is live it reports visited tabs and text typed into AI sites
 * to /proctoring/browsing-logs, and leaving the exam tab or the browser as WINDOW_BLUR events.
 */
import { call, store, type ContentMessage, type Stored } from './api';

type Entry = { url: string; title: string; query?: string; at: string };

const BLUR_COOLDOWN_MS = 10_000;
const queue: Entry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let lastBlur = 0;
const lastUrl = new Map<number, string>();

const live = async (): Promise<(Required<Pick<Stored, 'token' | 'sessionId'>> & Stored) | null> => {
  const s = await store.get();
  return s.token && s.sessionId ? { ...s, token: s.token, sessionId: s.sessionId } : null;
};
const loggable = (url?: string): url is string => !!url && /^https?:/i.test(url);

function enqueue(entry: Entry): void {
  queue.push(entry);
  clearTimeout(flushTimer);
  // Batch for a few seconds; typed queries go out at once because they matter most.
  flushTimer = setTimeout(() => void flush(), entry.query || queue.length >= 20 ? 0 : 3000);
}

async function flush(): Promise<void> {
  const s = await live();
  const entries = queue.splice(0, 100);
  if (!s || entries.length === 0) return;
  try {
    await call('POST', '/proctoring/browsing-logs', { sessionId: s.sessionId, entries }, s.token);
  } catch {
    // Offline or the session ended; the entries are dropped rather than retried forever.
  }
}

async function blur(message: string): Promise<void> {
  const s = await live();
  if (!s || Date.now() - lastBlur < BLUR_COOLDOWN_MS) return;
  lastBlur = Date.now();
  await call('POST', '/proctoring/events', { sessionId: s.sessionId, code: 'WINDOW_BLUR', message }, s.token).catch(() => undefined);
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void (async () => {
    const s = await live();
    if (!s) return;
    const tab = await chrome.tabs.get(tabId);
    if (tabId !== s.examTabId) void blur(`Switched from the exam tab to ${loggable(tab.url) ? new URL(tab.url).hostname : 'another tab'}.`);
    if (loggable(tab.url)) enqueue({ url: tab.url, title: tab.title ?? '', at: new Date().toISOString() });
  })();
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status !== 'complete' || !loggable(tab.url) || lastUrl.get(tabId) === tab.url) return;
  const url = tab.url;
  lastUrl.set(tabId, url);
  void live().then((s) => s && enqueue({ url, title: tab.title ?? '', at: new Date().toISOString() }));
});

chrome.tabs.onRemoved.addListener((tabId) => lastUrl.delete(tabId));

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) void blur('Chrome lost focus: another application was brought to the front.');
});

chrome.runtime.onMessage.addListener((msg: ContentMessage, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return;
  if (msg.type === 'status') {
    void live().then((s) => reply({ live: Boolean(s) }));
    return true; // reply asynchronously
  }
  if (msg.type === 'typed' && sender.tab) {
    void live().then((s) => s && enqueue({ url: msg.url, title: msg.title, query: msg.text, at: new Date().toISOString() }));
  }
});

// The toolbar button opens the exam tab, or focuses it if it is already open.
chrome.action.onClicked.addListener(() => {
  void (async () => {
    const { examTabId } = await store.get();
    if (examTabId !== undefined) {
      try {
        const tab = await chrome.tabs.update(examTabId, { active: true });
        if (tab?.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
        return;
      } catch {
        // The tab was closed; open a new one below.
      }
    }
    const tab = await chrome.tabs.create({ url: chrome.runtime.getURL('exam.html') });
    await store.set({ examTabId: tab.id });
  })();
});
