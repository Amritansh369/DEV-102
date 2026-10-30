/**
 * While the candidate is away from the exam window (another browser or app), proctors still see
 * what they use: the real screen as screenshots, the AI tool named from the open window titles, and
 * searches read from those titles. Typing in other programs is not key-logged; it shows in the
 * screenshots and the live screen.
 */
import { api } from './api';
import { proofShot } from './live';

/** AI tools by the name their window or browser tab shows. */
const AI_TOOLS: [string, RegExp][] = [
  ['ChatGPT', /chat\s?gpt|openai/i],
  ['Claude', /\bclaude\b/i],
  ['Gemini', /\bgemini\b|\bbard\b|ai studio|notebooklm/i],
  ['Copilot', /\bcopilot\b/i],
  ['Perplexity', /perplexity/i],
  ['DeepSeek', /deepseek/i],
  ['Grok', /\bgrok\b/i],
  ['Meta AI', /meta ai/i],
  ['Mistral Le Chat', /le chat|mistral/i],
  ['Qwen', /\bqwen\b|tongyi/i],
  ['Kimi', /\bkimi\b/i],
  ['Poe', /\bpoe\b/i],
  ['Character.AI', /character\.ai/i],
  ['HuggingChat', /huggingchat/i],
  ['Blackbox AI', /blackbox ai/i],
  ['Phind', /\bphind\b/i],
  ['Brainly', /brainly/i],
  ['Chegg', /chegg/i],
  ['Course Hero', /course\s?hero/i],
  ['QuillBot', /quillbot/i],
  ['Photomath', /photomath/i],
  ['Gauth', /gauth/i],
  ['Symbolab', /symbolab/i],
  ['Mathway', /mathway/i],
  ['Wolfram Alpha', /wolfram/i],
];

/** Where each AI tool lives, so a visit outside the exam joins the same browsing log and flags. */
const AI_URLS: Record<string, string> = {
  ChatGPT: 'https://chatgpt.com/', Claude: 'https://claude.ai/', Gemini: 'https://gemini.google.com/', Copilot: 'https://copilot.microsoft.com/',
  Perplexity: 'https://perplexity.ai/', DeepSeek: 'https://chat.deepseek.com/', Grok: 'https://grok.com/', 'Meta AI': 'https://meta.ai/',
  'Mistral Le Chat': 'https://chat.mistral.ai/', Poe: 'https://poe.com/', Phind: 'https://phind.com/', 'Character.AI': 'https://character.ai/',
  Brainly: 'https://brainly.com/', Chegg: 'https://chegg.com/', 'Course Hero': 'https://coursehero.com/', QuillBot: 'https://quillbot.com/',
  Photomath: 'https://photomath.com/', Symbolab: 'https://symbolab.com/', Mathway: 'https://mathway.com/', 'Wolfram Alpha': 'https://wolframalpha.com/',
};
/** A browser tab on a results page is titled with the search, e.g. "prime numbers - Google Search - Google Chrome". */
const SEARCH_TITLE = /^(.+?) - (?:Google Search|Bing|DuckDuckGo|Brave Search|Yahoo Search)\b/i;

export interface AiWindow { tool: string; app: string; title: string }

/** The first open window (browser tab or desktop app) that is an AI tool, by its title or program name. */
export function aiWindow(windows: { app: string; title: string }[]): AiWindow | null {
  for (const w of windows) {
    const hit = AI_TOOLS.find(([, re]) => re.test(w.title) || re.test(w.app));
    if (hit) return { tool: hit[0], app: w.app, title: w.title };
  }
  return null;
}

/** The browsing-log entries a window title reveals: an AI tool that is open, or a search. */
export function outsideEntry(w: { app: string; title: string }): { url: string; title: string; query?: string } | null {
  const ai = aiWindow([w]);
  const url = ai ? AI_URLS[ai.tool] : undefined;
  if (url) return { url, title: `${w.title} (outside the exam, ${w.app})`.slice(0, 300) };
  const query = SEARCH_TITLE.exec(w.title)?.[1];
  return query ? { url: `https://www.google.com/search?q=${encodeURIComponent(query)}`, title: `Search outside the exam (${w.app})`, query } : null;
}

const AWAY_EVERY_MS = 5000;

/** Starts reporting when the exam window loses focus; returns the stop function. */
export function watchAway(sessionId: string): () => void {
  let timer: number | undefined;
  let busy = false;
  const logged = new Set<string>();

  const logOutside = (windows: { app: string; title: string }[]) => {
    for (const w of windows) {
      const entry = logged.has(w.title) ? null : outsideEntry(w);
      if (!entry) continue;
      logged.add(w.title);
      void api.logBrowsing('', { ...entry, id: '', sessionId, at: new Date().toISOString(), flaggedAi: false }).catch(() => undefined);
    }
  };

  const check = async () => {
    if (busy || document.hasFocus()) return;
    busy = true;
    try {
      const [windows, screenshot] = await Promise.all([window.proctor?.windowTitles().catch(() => []) ?? [], proofShot()]);
      logOutside(windows);
      const ai = aiWindow(windows);
      const message = ai
        ? `${ai.tool} open outside the exam (${ai.app}: "${ai.title}")`
        : 'Away from the exam window; the screenshot shows what was on screen.';
      await api.reportViolation({ sessionId, code: ai ? 'AI_SITE_OPENED' : 'WINDOW_BLUR', message, at: new Date().toISOString(), ...(screenshot ? { screenshot } : {}) });
    } finally {
      busy = false;
    }
  };
  const onBlur = () => {
    window.clearInterval(timer);
    // A first look after a second, then every few seconds while the candidate stays away.
    window.setTimeout(() => void check(), 1000);
    timer = window.setInterval(() => void check(), AWAY_EVERY_MS);
  };
  const onFocus = () => window.clearInterval(timer);

  window.addEventListener('blur', onBlur);
  window.addEventListener('focus', onFocus);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('focus', onFocus);
  };
}
