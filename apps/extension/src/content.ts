/**
 * Runs on AI sites. While an exam is live it reports what the candidate types and what the AI answers.
 * The candidate agreed to this on the consent screen.
 */
import { trackPage } from './page-tracker';
import type { ContentMessage } from './api';

const send = (msg: ContentMessage) => void chrome.runtime.sendMessage(msg).catch(() => undefined);

// Only track while a session is live; outside an exam the extension stays silent on these sites.
const status: ContentMessage = { type: 'status' };
void chrome.runtime.sendMessage(status).then((r: { live?: boolean } | undefined) => {
  if (!r?.live) return;
  trackPage({
    typed: (text) => send({ type: 'typed', text, url: location.href, title: document.title }),
    reply: (prompt, text) => send({ type: 'reply', prompt, text, url: location.href, title: document.title }),
  });
}).catch(() => undefined);
