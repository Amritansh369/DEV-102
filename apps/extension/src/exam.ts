/**
 * The exam tab: sign in → one-time code → face check → consent → exam → receipt.
 * Uses the same API as the desktop app, with channel "web". While the exam runs it autosaves answers,
 * sends heartbeats and uploads a webcam frame every 20 s; background.ts reports browsing.
 */
import { ApiError, call, store } from './api';

interface Option { id: string; text: string }
interface Question { id: string; type: 'MCQ' | 'NUMERIC'; text: string; options: Option[]; multi: boolean; marks: number; unit?: string }
interface Paper {
  sessionId: string;
  exam: { title: string; code: string };
  questions: Question[];
  saved: { answers: Record<string, string[]>; values: Record<string, number>; flagged: string[] };
  remainingSec: number;
  instructions?: string;
}
interface Receipt { receiptId: string | null; submittedAt: string; answered: number; total: number; status: string }

const app = document.getElementById('app') as HTMLElement;
let token = '';
let camera: MediaStream | null = null;

/* ---------------------------------------------------------------- tiny DOM helpers */

type Child = Node | string | null | false | undefined;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  const { class: cls, ...rest } = props;
  if (cls) el.className = cls;
  Object.assign(el, rest);
  for (const c of children) if (c) el.append(c);
  return el;
}
const show = (...children: Child[]) => app.replaceChildren(...children.filter((c): c is Node | string => Boolean(c)));
const message = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.');

function card(title: string, sub: string, ...body: Child[]): HTMLElement {
  return h('main', { class: 'card' }, h('img', { src: 'icon.png', alt: '', class: 'logo' }), h('h1', {}, title), h('p', { class: 'muted' }, sub), ...body);
}

/** A form whose submit button shows progress and whose errors appear inline. */
function form(fields: Child[], label: string, onSubmit: () => Promise<void>): HTMLFormElement {
  const err = h('p', { class: 'error', role: 'alert' });
  const btn = h('button', { type: 'submit', class: 'primary' }, label);
  const f = h('form', {}, ...fields, err, btn);
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    err.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Please wait…';
    void onSubmit().catch((x: unknown) => { err.textContent = message(x); }).finally(() => { btn.disabled = false; btn.textContent = label; });
  });
  return f;
}
const field = (label: string, input: HTMLInputElement) => h('label', {}, label, input);

/* ---------------------------------------------------------------- steps */

function login(): void {
  const exam = h('input', { required: true, autocomplete: 'off', placeholder: 'e.g. CPA-26' });
  const user = h('input', { required: true, autocomplete: 'username' });
  const pass = h('input', { required: true, type: 'password', autocomplete: 'current-password' });
  show(card('Sign in to your exam', 'Use the exam code, user ID and password from your credentials email.',
    form([field('Exam code', exam), field('User ID', user), field('Password', pass)], 'Sign in', async () => {
      const r = await call<{ token: string }>('POST', '/auth/login', { examId: exam.value.trim(), userId: user.value.trim(), password: pass.value, channel: 'web' });
      token = r.token;
      await store.set({ token });
      await otp();
    })));
  exam.focus();
}

async function otp(): Promise<void> {
  const sent = await call<{ challengeId: string; sentTo: string; devCode?: string }>('POST', '/auth/otp/send', {}, token);
  const code = h('input', { required: true, inputMode: 'numeric', pattern: '\\d{6}', maxLength: 6, autocomplete: 'one-time-code' });
  show(card('Enter your one-time code', `We sent a 6-digit code to ${sent.sentTo}.`,
    sent.devCode ? h('p', { class: 'hint' }, `Development server: your code is ${sent.devCode}`) : null,
    form([field('Code', code)], 'Verify', async () => {
      await call('POST', '/auth/otp/verify', { challengeId: sent.challengeId, code: code.value.trim() }, token);
      await face();
    })));
  code.focus();
}

async function face(): Promise<void> {
  camera ??= await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false }).catch(() => {
    throw new Error('Allow camera access for this extension, then try again. The camera is required during the exam.');
  });
  const video = h('video', { autoplay: true, muted: true, playsInline: true, class: 'camera' });
  video.srcObject = camera;
  show(card('Face check', 'Look at the camera with your face centred and well lit, then capture.',
    video,
    form([], 'Capture and verify', async () => {
      const image = grab(video, 640, 0.85);
      if (!image) throw new Error('The camera is not ready yet. Wait a moment and try again.');
      const r = await call<{ passed: boolean; reason?: string }>('POST', '/auth/face/verify', { image }, token);
      if (!r.passed) throw new Error(r.reason ?? 'Your face did not match the photo on file. Adjust your lighting and try again.');
      consent();
    })));
}

function consent(): void {
  const ok = h('input', { type: 'checkbox', required: true });
  show(card('Before you start', 'During the exam this extension and the exam server will:',
    h('ul', {},
      h('li', {}, 'take a webcam picture every 20 seconds;'),
      h('li', {}, 'record every site you open in Chrome and when you switch tabs;'),
      h('li', {}, 'record what you type on AI sites such as ChatGPT;'),
      h('li', {}, 'record when you leave the exam tab or switch to another application.')),
    h('p', { class: 'muted' }, 'Your invigilator sees these events live. Keep this tab in front until you submit.'),
    form([h('label', { class: 'check' }, ok, 'I understand and agree to be monitored')], 'Start the exam', async () => {
      const paper = await call<Paper>('POST', '/sessions/start', { consent: true }, token);
      await store.set({ sessionId: paper.sessionId });
      exam(paper);
    })));
}

/* ---------------------------------------------------------------- exam */

function exam(p: Paper): void {
  const answers: Record<string, string[]> = { ...p.saved.answers };
  const values: Record<string, number | null> = { ...p.saved.values };
  const flagged = new Set(p.saved.flagged);
  let index = 0;
  let remaining = p.remainingSec;
  let dirty = false;
  let ended = false;
  const timers: number[] = [];

  const clock = h('span', { class: 'clock' });
  const saveState = h('span', { class: 'muted' }, 'All answers saved');
  const nav = h('nav', { class: 'grid', ariaLabel: 'Questions' });
  const body = h('section', { class: 'question' });
  const thumb = h('video', { autoplay: true, muted: true, playsInline: true, class: 'thumb', ariaHidden: 'true' });
  thumb.srcObject = camera;
  const submitBtn = h('button', { class: 'primary', type: 'button' }, 'Submit exam');

  const answered = (q: Question) => (q.type === 'NUMERIC' ? values[q.id] != null : (answers[q.id]?.length ?? 0) > 0);

  const save = async () => {
    if (!dirty || ended) return;
    dirty = false;
    saveState.textContent = 'Saving…';
    try {
      await call('PUT', `/sessions/${p.sessionId}/answers`, { answers, values, flagged: [...flagged] }, token);
      saveState.textContent = `Saved at ${new Date().toLocaleTimeString()}`;
    } catch (e) {
      dirty = true;
      saveState.textContent = `Not saved: ${message(e)}`;
      if (e instanceof ApiError && e.code === 'CONFLICT') void finish('MANUAL');
    }
  };
  let saveTimer = 0;
  const changed = () => {
    dirty = true;
    saveState.textContent = 'Unsaved changes…';
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void save(), 1200);
    renderNav();
  };

  function renderNav(): void {
    nav.replaceChildren(...p.questions.map((q, i) => {
      const b = h('button', { type: 'button', class: `qnum${i === index ? ' current' : ''}${answered(q) ? ' answered' : ''}${flagged.has(q.id) ? ' flagged' : ''}`, ariaLabel: `Question ${i + 1}` }, String(i + 1));
      b.onclick = () => { index = i; render(); };
      return b;
    }));
  }

  function render(): void {
    const q = p.questions[index];
    let input: HTMLElement;
    if (q.type === 'NUMERIC') {
      const n = h('input', { type: 'number', step: 'any', inputMode: 'decimal', value: values[q.id] != null ? String(values[q.id]) : '', ariaLabel: 'Your answer' });
      n.oninput = () => {
        const v = n.value.trim() === '' ? null : Number(n.value);
        values[q.id] = v !== null && Number.isFinite(v) ? v : null;
        changed();
      };
      input = h('div', { class: 'numeric' }, n, q.unit ? h('span', { class: 'muted' }, q.unit) : null);
    } else {
      input = h('div', { class: 'options' }, ...q.options.map((o) => {
        const box = h('input', { type: q.multi ? 'checkbox' : 'radio', name: q.id, checked: answers[q.id]?.includes(o.id) ?? false });
        box.onchange = () => {
          const cur = answers[q.id] ?? [];
          answers[q.id] = q.multi ? (box.checked ? [...cur, o.id] : cur.filter((x) => x !== o.id)) : [o.id];
          changed();
        };
        return h('label', { class: 'option' }, box, o.text);
      }));
    }
    const flag = h('button', { type: 'button', class: 'ghost' }, flagged.has(q.id) ? 'Unflag' : 'Flag for review');
    flag.onclick = () => { if (!flagged.delete(q.id)) flagged.add(q.id); changed(); render(); };
    const prev = h('button', { type: 'button', class: 'ghost', disabled: index === 0 }, 'Previous');
    prev.onclick = () => { index--; render(); };
    const next = h('button', { type: 'button', class: 'ghost', disabled: index === p.questions.length - 1 }, 'Next');
    next.onclick = () => { index++; render(); };
    body.replaceChildren(
      h('p', { class: 'muted' }, `Question ${index + 1} of ${p.questions.length} · ${q.marks} mark${q.marks === 1 ? '' : 's'}${q.multi ? ' · select all that apply' : ''}`),
      h('h2', {}, q.text),
      input,
      h('div', { class: 'row' }, prev, flag, next),
    );
    renderNav();
  }

  const tick = () => {
    remaining = Math.max(0, remaining - 1);
    clock.textContent = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')} left`;
    clock.classList.toggle('low', remaining <= 300);
    if (remaining === 0) void finish('TIME_UP');
  };

  async function finish(reason: 'MANUAL' | 'TIME_UP'): Promise<void> {
    if (ended) return;
    ended = true;
    timers.forEach(clearInterval);
    clearTimeout(saveTimer);
    submitBtn.disabled = true;
    try {
      const r = await call<Receipt>('POST', `/sessions/${p.sessionId}/submit`, { answers, values, flagged: [...flagged], reason }, token);
      done(p, r, reason);
    } catch (e) {
      ended = false;
      submitBtn.disabled = false;
      saveState.textContent = `Submit failed: ${message(e)}`;
    }
  }

  submitBtn.onclick = () => {
    const left = p.questions.filter((q) => !answered(q)).length;
    if (confirm(left ? `${left} question${left === 1 ? ' is' : 's are'} unanswered. Submit anyway?` : 'Submit your exam? You cannot change answers afterwards.')) void finish('MANUAL');
  };

  timers.push(window.setInterval(tick, 1000));
  timers.push(window.setInterval(() => {
    void call<{ status: string; remainingSec: number }>('POST', `/sessions/${p.sessionId}/heartbeat`, { currentQuestion: index }, token)
      .then((r) => {
        remaining = r.remainingSec;
        if (r.status !== 'LIVE') void finish('MANUAL');
      })
      .catch(() => undefined);
  }, 15_000));
  timers.push(window.setInterval(() => {
    const image = grab(thumb, 640, 0.72);
    if (image && navigator.onLine) void call('POST', '/proctoring/frames', { sessionId: p.sessionId, image }, token).catch(() => undefined);
  }, 20_000));
  window.addEventListener('beforeunload', (e) => { if (!ended) { void save(); e.preventDefault(); } });

  show(h('div', { class: 'exam' },
    h('header', {}, h('div', {}, h('strong', {}, p.exam.title), h('span', { class: 'muted' }, ` · ${p.exam.code}`)), saveState, clock, submitBtn),
    h('div', { class: 'layout' }, h('aside', {}, nav, p.instructions ? h('p', { class: 'muted small' }, p.instructions) : null), body),
    thumb));
  tick();
  render();
}

function done(p: Paper, r: Receipt, reason: 'MANUAL' | 'TIME_UP'): void {
  camera?.getTracks().forEach((t) => t.stop());
  camera = null;
  void store.clear('sessionId', 'token');
  const title = r.status === 'TERMINATED' ? 'Your exam was ended by the invigilator' : reason === 'TIME_UP' ? 'Time is up: your exam was submitted' : 'Your exam has been submitted';
  show(card(title, `${p.exam.title} (${p.exam.code}) · ${new Date(r.submittedAt).toLocaleString()}`,
    h('dl', { class: 'facts' },
      h('dt', {}, 'Answered'), h('dd', {}, `${r.answered} of ${r.total}`),
      h('dt', {}, 'Reference'), h('dd', {}, r.receiptId ?? '—')),
    h('p', { class: 'muted' }, 'You can close this tab. Monitoring has stopped.')));
}

function grab(video: HTMLVideoElement, width: number, quality: number): string | null {
  if (!video.videoWidth) return null;
  const c = h('canvas', { width, height: Math.round((video.videoHeight / video.videoWidth) * width) });
  c.getContext('2d')?.drawImage(video, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

/* ---------------------------------------------------------------- start */

void (async () => {
  const tab = await chrome.tabs.getCurrent();
  await store.set({ examTabId: tab?.id });
  const saved = await store.get();
  if (saved.token && saved.sessionId) {
    // Reopened mid-exam: /sessions/start returns the live session's paper with saved answers.
    token = saved.token;
    try {
      camera = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
      exam(await call<Paper>('POST', '/sessions/start', { consent: true }, token));
      return;
    } catch {
      await store.clear('sessionId', 'token');
    }
  }
  login();
})();
