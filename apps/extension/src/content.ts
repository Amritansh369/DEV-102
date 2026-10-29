/**
 * Runs on AI sites. While an exam is live it reports what the candidate types into search boxes, text
 * areas and chat inputs (on submit or after a pause) and shows a notice so the tracking is never hidden.
 * Same approach as the desktop sandbox (apps/desktop/electron/browser-sandbox/tracker.ts).
 */
import type { ContentMessage } from './api';

const MIN_LEN = 3;
let lastSent = '';
let timer: ReturnType<typeof setTimeout> | undefined;

function fieldText(el: Element | null): string {
  if (!el) return '';
  if (el instanceof HTMLInputElement) return ['text', 'search', 'url', ''].includes(el.type) ? el.value : '';
  if (el instanceof HTMLTextAreaElement) return el.value;
  if (el instanceof HTMLElement && el.isContentEditable) return el.innerText;
  return '';
}

function send(text: string): void {
  const value = text.replace(/\s+/g, ' ').trim().slice(0, 2000);
  if (value.length < MIN_LEN || value === lastSent) return;
  lastSent = value;
  const msg: ContentMessage = { type: 'typed', text: value, url: location.href, title: document.title };
  void chrome.runtime.sendMessage(msg).catch(() => undefined);
}

function track(): void {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) send(fieldText(document.activeElement));
  }, true);
  document.addEventListener('input', () => {
    clearTimeout(timer);
    const el = document.activeElement;
    timer = setTimeout(() => send(fieldText(el)), 2500);
  }, true);
  document.addEventListener('submit', (e) => {
    const form = e.target instanceof HTMLFormElement ? e.target : null;
    send(fieldText(form?.querySelector('input[type=search], input[type=text], textarea, [contenteditable=true]') ?? null));
  }, true);

  const bar = document.createElement('div');
  bar.textContent = 'Proctored exam in progress · what you type on this site is recorded and visible to your invigilator';
  bar.setAttribute('style', 'position:fixed;z-index:2147483647;left:0;right:0;bottom:0;padding:4px 10px;font:12px Segoe UI,Arial,sans-serif;color:#fff;background:rgba(29,78,216,.92);text-align:center;pointer-events:none');
  document.documentElement.appendChild(bar);
}

// Only track while a session is live; outside an exam the extension stays silent on these sites.
const status: ContentMessage = { type: 'status' };
void chrome.runtime.sendMessage(status).then((r: { live?: boolean } | undefined) => { if (r?.live) track(); }).catch(() => undefined);
