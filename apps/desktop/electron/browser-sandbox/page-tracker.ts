/**
 * What the proctor learns from a web page: text typed into search boxes, text areas and AI chat inputs
 * (when submitted or after a pause), and what an AI assistant answers. Used by the desktop app's exam
 * tabs and by the Chrome extension.
 */
const MIN_LEN = 3;
const MAX_REPLY = 8000;
/** Sites whose answers are read back, by the element holding one answer. Unknown markup falls back to the page's new text. */
const AI_SITES: [RegExp, string][] = [
  [/(^|\.)(chatgpt\.com|openai\.com)$/, '[data-message-author-role="assistant"]'],
  [/(^|\.)claude\.ai$/, '.font-claude-response, .font-claude-message'],
  [/(^|\.)(gemini|aistudio)\.google\.com$/, 'model-response, ms-chat-turn'],
  [/(^|\.)copilot\.microsoft\.com$/, '[data-content="ai-message"]'],
  [/(^|\.)perplexity\.ai$/, '.prose'],
  [/(^|\.)deepseek\.com$/, '.ds-markdown'],
  [/(^|\.)(grok\.com|meta\.ai|poe\.com|you\.com|phind\.com|character\.ai|mistral\.ai|qwen\.ai|kimi\.ai|pi\.ai)$/, '[data-testid*="message"], [class*="message"]'],
];

export interface PageReports {
  typed(text: string, trigger: 'submit' | 'pause'): void;
  reply(prompt: string, text: string): void;
}

function fieldText(el: Element | null): string {
  if (!el) return '';
  if (el instanceof HTMLInputElement) return ['text', 'search', 'url', ''].includes(el.type) ? el.value : '';
  if (el instanceof HTMLTextAreaElement) return el.value;
  if (el instanceof HTMLElement && el.isContentEditable) return el.innerText;
  return '';
}

const pageLines = (): string[] => (document.body?.innerText ?? '').split('\n').map((l) => l.trim()).filter(Boolean);

/** Starts tracking this page. The page itself shows nothing: the candidate agreed to this on the consent screen. */
export function trackPage(report: PageReports): void {
  const site = AI_SITES.find(([host]) => host.test(location.hostname));
  let lastSent = '';
  let lastReply = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  let replyWatch: ReturnType<typeof setInterval> | undefined;
  let watchedPrompt = '';
  let lastField: Element | null = null;

  const latestAnswer = (): string => {
    const answers = site ? document.querySelectorAll<HTMLElement>(site[1]) : null;
    return answers?.length ? answers[answers.length - 1]?.innerText ?? '' : '';
  };

  /** Follows the answer to a prompt while it streams and reports each version that stays still for three seconds. */
  const watchReply = (prompt: string): void => {
    if (!site || prompt === watchedPrompt) return;
    watchedPrompt = prompt;
    clearInterval(replyWatch);
    const before = new Set(pageLines());
    const oldAnswer = latestAnswer();
    let seen = '';
    let still = 0;
    let ticks = 0;
    replyWatch = setInterval(() => {
      const answer = latestAnswer();
      const text = (answer && answer !== oldAnswer ? answer : pageLines().filter((l) => !before.has(l) && !prompt.includes(l)).join('\n')).trim();
      still = text && text === seen ? still + 1 : 0;
      seen = text;
      if (still === 3 && text !== lastReply) {
        lastReply = text;
        report.reply(prompt, text.slice(0, MAX_REPLY));
      }
      if (++ticks >= 180) clearInterval(replyWatch);
    }, 1000);
  };

  const send = (text: string, trigger: 'submit' | 'pause'): void => {
    if (timer) clearTimeout(timer);
    const value = text.replace(/\s+/g, ' ').trim().slice(0, 2000);
    if (value.length < MIN_LEN) return;
    if (trigger === 'submit') watchReply(value);
    if (value === lastSent) return;
    lastSent = value;
    report.typed(value, trigger);
  };

  document.addEventListener(
    'keydown',
    (e) => {
      const el = document.activeElement;
      const text = fieldText(el);
      if (!text) return;
      if (e.key === 'Enter' && !e.shiftKey) send(text, 'submit');
    },
    true,
  );

  document.addEventListener(
    'input',
    () => {
      if (timer) clearTimeout(timer);
      const el = document.activeElement;
      lastField = el;
      // A short pause is enough: the proctor sees typing almost as it happens.
      timer = setTimeout(() => send(fieldText(el), 'pause'), 800);
    },
    true,
  );

  // Chat pages send with a button too: the box empties once the message has gone.
  document.addEventListener(
    'click',
    () => {
      if (!lastField || !lastSent) return;
      setTimeout(() => {
        if (!fieldText(lastField).trim()) watchReply(lastSent);
      }, 200);
    },
    true,
  );

  // Pasted text (for example a copied exam question) is reported straight away.
  document.addEventListener(
    'paste',
    () => {
      const el = document.activeElement;
      setTimeout(() => send(fieldText(el), 'pause'), 50);
    },
    true,
  );

  document.addEventListener('submit', (e) => {
    const form = e.target as HTMLFormElement | null;
    const field = form?.querySelector('input[type=search], input[type=text], textarea, [contenteditable=true]') ?? null;
    send(fieldText(field), 'submit');
  }, true);
}
