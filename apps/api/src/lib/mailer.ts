import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config.js';
import { logger } from './core.js';
import { prisma } from './db.js';

type Delivery = (m: { to: string; subject: string; html: string; text: string }) => Promise<void>;

/** "Name <email>" or a bare address, as used in MAIL_FROM. */
function sender(): { name: string; email: string } {
  const from = config.MAIL_FROM || config.SMTP_USER;
  const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { name: m[1] || config.MAIL_FROM_NAME, email: (m[2] as string).trim() } : { name: config.MAIL_FROM_NAME, email: from.trim() };
}

/** Brevo transactional email over HTTPS, for hosts that block SMTP ports. */
const brevo: Delivery = async (m) => {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': config.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ sender: sender(), to: [{ email: m.to }], subject: m.subject, htmlContent: m.html, textContent: m.text }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(`Brevo ${res.status}: ${body?.message ?? res.statusText}`);
  }
};

let transport: Transporter | null = null;
function smtp(): Delivery {
  transport ??= nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
    pool: true,
    maxConnections: 3,
  });
  const t = transport;
  return async (m) => { await t.sendMail({ from: config.MAIL_FROM || config.SMTP_USER, ...m }); };
}

/**
 * Tries each configured provider in order (Brevo, then SMTP) until one accepts the message, so a refusal from one
 * falls through to the next.
 */
function getDelivery(): Delivery | null {
  if (config.mailProviders.length === 0) return null;
  return async (m) => {
    const errors: string[] = [];
    for (const name of config.mailProviders) {
      try {
        await (name === 'brevo' ? brevo : smtp())(m);
        return;
      } catch (err) {
        errors.push((err as Error).message);
      }
    }
    throw new Error(errors.join(' · '));
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** Absolute URL of the brand logo: mail clients cannot load images from inside the app, so it comes from the website. */
const logoUrl = () => `${config.clientOrigins[0] ?? ''}/images/logo.png`;
const FONT = "font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * Branded Where U Elevate layout: gradient header with the logo, white card, footer with the security note and
 * team credit. Table-based with inline styles so it renders the same in Gmail, Outlook and phone mail apps.
 * `preheader` is the grey preview line most inboxes show next to the subject.
 */
function layout(title: string, bodyHtml: string, preheader = ''): string {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#eaf0fb;${FONT};color:#0f172a">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eaf0fb"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 18px 40px rgba(10,77,166,.18)">
<tr><td bgcolor="#0A4DA6" style="background:#0A4DA6;background-image:linear-gradient(135deg,#0b2a6f 0%,#0A4DA6 45%,#1E6FF0 80%,#38bdf8 100%);padding:26px 32px 30px;color:#ffffff">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="background:#ffffff;border-radius:12px;padding:6px;line-height:0"><img src="${esc(logoUrl())}" width="40" height="40" alt="Where U Elevate" style="display:block;border:0;width:40px;height:40px"></td>
    <td style="padding-left:12px;${FONT}"><div style="font-size:17px;font-weight:700;letter-spacing:.01em">Smart Proctor</div><div style="font-size:12px;opacity:.85">by Where U Elevate</div></td>
  </tr></table>
  <div style="margin-top:22px;font-size:24px;line-height:1.25;font-weight:700">${esc(title)}</div>
  <div style="margin-top:14px;height:4px;width:56px;border-radius:4px;background:#FFB020"></div>
</td></tr>
<tr><td style="padding:28px 32px 8px;font-size:15px;line-height:1.65;${FONT}">${bodyHtml}</td></tr>
<tr><td style="padding:8px 32px 28px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff7e6;border:1px solid #ffe2a6;border-radius:12px"><tr><td style="padding:12px 16px;font-size:12.5px;line-height:1.55;color:#7a4b00;${FONT}">
    &#128274; Never share your password, one-time code or exam link. Where U Elevate will never ask for them by phone or chat.
  </td></tr></table>
</td></tr>
<tr><td style="background:#f6f8fc;border-top:1px solid #e6ebf5;padding:18px 32px;font-size:12px;line-height:1.6;color:#64748b;${FONT}">
  You received this because you are registered for an assessment on Where U Elevate.<br>
  Powered by <b style="color:#0A4DA6">Tech Knights</b> &middot; Smart Proctor secure exam platform
</td></tr>
</table></td></tr></table></body></html>`;
}

/** A large call-to-action button that still works where CSS is stripped (the link is the whole cell). */
function button(href: string, label: string, color = '#FFB020', text = '#0f172a'): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0"><tr><td bgcolor="${color}" style="border-radius:12px;background:${color}">
<a href="${esc(href)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:${text};text-decoration:none;border-radius:12px;${FONT}">${esc(label)}</a></td></tr></table>`;
}

/** Label/value rows in a soft card; values in a monospace face when they are codes the reader types. */
function detailsCard(heading: string, rows: Array<[string, string, boolean?]>): string {
  const body = rows.map(([label, value, mono]) => `<tr>
<td style="padding:9px 0;border-bottom:1px solid #e3eafa;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#64748b;width:40%;${FONT}">${esc(label)}</td>
<td style="padding:9px 0;border-bottom:1px solid #e3eafa;font-size:15px;font-weight:600;color:#0f172a;${mono ? 'font-family:Consolas,Menlo,monospace;letter-spacing:.03em' : FONT}">${esc(value)}</td></tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 18px;background:#f3f7ff;border:1px solid #dbe6fb;border-radius:16px"><tr><td style="padding:16px 20px 8px">
<div style="font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#1E6FF0;${FONT}">${esc(heading)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px">${body}</table></td></tr></table>`;
}

/** Numbered steps with round badges. */
function steps(items: string[]): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:10px 0 6px">${items.map((t, i) => `<tr>
<td valign="top" style="padding:0 12px 10px 0"><div style="width:26px;height:26px;border-radius:13px;background:#0A4DA6;color:#ffffff;font-size:13px;font-weight:700;line-height:26px;text-align:center;${FONT}">${i + 1}</div></td>
<td style="padding:3px 0 10px;font-size:14px;line-height:1.5;color:#334155;${FONT}">${esc(t)}</td></tr>`).join('')}</table>`;
}

const linkify = (text: string) => text.replace(/https?:\/\/[^\s<]+/g, (raw) => {
  const trailing = raw.match(/[),.!?:;]+$/)?.[0] ?? '';
  const url = trailing ? raw.slice(0, -trailing.length) : raw;
  return `<a href="${url}" style="color:#1d4ed8">${url}</a>${trailing}`;
});

const textToHtml = (text: string) =>
  linkify(esc(text))
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');

export interface ExamPass { name: string; examName: string; examId: string; userId: string; password: string; inviteLink: string; startTime: string; appLink: string }

export const templates = {
  /**
   * The candidate's sign-in email. With `pass`, a designed exam pass (details, Join button, steps) leads, and the
   * organisation's own editable message follows it.
   */
  credentials: (subject: string, bodyText: string, pass?: ExamPass) => ({
    subject,
    text: bodyText,
    html: pass
      ? layout('Your exam pass is ready', `<p style="margin:0 0 6px">Hello ${esc(pass.name)},</p>
<p style="margin:0">You are registered for <b>${esc(pass.examName)}</b>. Everything you need is below.</p>
${detailsCard('Your exam pass', [['Exam', pass.examName], ['Starts', pass.startTime], ['Exam ID', pass.examId, true], ['User ID', pass.userId, true], ['Password', pass.password, true]])}
${button(pass.inviteLink, 'Join exam →')}
<p style="margin:6px 0 18px;font-size:13px;color:#64748b">First time? <a href="${esc(pass.appLink)}" style="color:#1E6FF0;font-weight:600">Install the Smart Proctor app</a>, then use the button above.</p>
${steps(['Install the Smart Proctor app on the Windows computer you will use.', 'Open the Join exam link (or paste it into the app) and enter your password.', 'Complete the system check and face verification at least 15 minutes before the start.'])}
<div style="margin:22px 0 8px;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#94a3b8">Message from your organisation</div>
<div style="border-left:3px solid #dbe6fb;padding-left:14px;color:#334155">${textToHtml(bodyText)}</div>`, `${pass.examName} starts ${pass.startTime}. Your link and password are inside.`)
      : layout(subject, textToHtml(bodyText)),
  }),
  otp: (name: string, code: string, ttlMin: number) => ({
    subject: `Your verification code: ${code}`,
    text: `Hello ${name},\n\nYour one-time code is ${code}. It expires in ${ttlMin} minutes.`,
    html: layout('Verify it is you', `<p style="margin:0">Hello ${esc(name)},</p><p>Use this one-time code to continue to your exam:</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0"><tr><td align="center" style="background:#f3f7ff;border:1px dashed #9cbcf5;border-radius:16px;padding:18px">
<div style="font-family:Consolas,Menlo,monospace;font-size:36px;font-weight:700;letter-spacing:.4em;color:#0A4DA6">${esc(code)}</div>
<div style="margin-top:6px;font-size:12px;color:#64748b">Expires in ${ttlMin} minutes</div></td></tr></table>
<p style="color:#475569">If you did not request this code, ignore this email. Nobody can sign in without it.</p>`, `Your code is ${code}. It expires in ${ttlMin} minutes.`),
  }),
  credentialsCopy: (name: string, cand: { name: string; email: string; userId: string }, examTitle: string, examCode: string, startTime: string, link: string, password: string) => {
    const why = 'Your organization sent these exam details';
    return {
      subject: `Copy: exam link sent to ${cand.name} (${examCode})`,
      text: `Hello ${name},

${why}. ${cand.name} (${cand.email}) was sent the details below for ${examTitle} (${examCode}), starting ${startTime}.

Candidate ID: ${cand.userId}
Exam link: ${link}
Password: ${password}

The link works on one computer only and expires when the exam ends.`,
      html: layout(`Copy: link sent to ${cand.name}`, `<p style="margin:0">Hello ${esc(name)},</p><p>${esc(why)}. <b>${esc(cand.name)}</b> (${esc(cand.email)}) was sent these details for <b>${esc(examTitle)}</b>.</p>
${detailsCard('Candidate pass', [['Candidate', cand.name], ['Exam', `${examTitle} (${examCode})`], ['Starts', startTime], ['Candidate ID', cand.userId, true], ['Password', password, true]])}
${button(link, 'Open the candidate link')}
<p style="color:#64748b;font-size:13px;margin-top:12px">The link works on one computer only and expires when the exam ends.</p>`, `Sent to ${cand.name} for ${examTitle}.`),
    };
  },
  proctorInvite: (name: string, examTitle: string, examCode: string, startTime: string, link: string, password: string | null, appLink: string) => {
    const pw = password ? `Temporary password: ${password}` : 'Password: the one you already use for your proctor account';
    return {
      subject: `You are proctoring ${examTitle}`,
      text: `Hello ${name},

You have been assigned as a proctor for ${examTitle} (${examCode}), starting ${startTime}.

Your proctor link: ${link}
${pw}

Install the Smart Proctor app from ${appLink}, paste the link, enter the password, then complete face and email verification. The link works on one computer only and expires when the exam ends.`,
      html: layout('You are proctoring an exam', `<p style="margin:0">Hello ${esc(name)},</p><p>You have been assigned as a proctor for <b>${esc(examTitle)}</b>.</p>
${detailsCard('Proctor pass', [['Exam', `${examTitle} (${examCode})`], ['Starts', startTime], ['Password', password ?? 'Your existing proctor password', Boolean(password)]])}
${button(link, 'Open proctor link →', '#0A4DA6', '#ffffff')}
<p style="margin:6px 0 16px;font-size:13px;color:#64748b">Need the app? <a href="${esc(appLink)}" style="color:#1E6FF0;font-weight:600">Install Smart Proctor</a>.</p>
${steps(['Install the Smart Proctor app.', 'Open the proctor link and enter your password.', 'Complete face and email verification, then watch your candidates live.'])}
<p style="color:#64748b;font-size:13px">The link works on one computer only and expires when the exam ends.</p>`, `${examTitle} starts ${startTime}. Your proctor link is inside.`),
    };
  },
  result: (name: string, examTitle: string, receiptId: string, release: 'IMMEDIATE' | 'AFTER_REVIEW' | 'MANUAL' = 'AFTER_REVIEW') => {
    const when = { IMMEDIATE: 'Your score is available in the candidate lobby.', AFTER_REVIEW: 'Results are released after review.', MANUAL: 'Results are released by your exam organiser.' }[release];
    return {
      subject: `Submission received: ${examTitle}`,
      text: `Hello ${name},\n\nWe received your submission for ${examTitle}. Reference: ${receiptId}.\n\n${when}`,
      html: layout('Submission received', `<p style="margin:0">Hello ${esc(name)},</p><p>We received your submission for <b>${esc(examTitle)}</b>. Well done for finishing!</p>
${detailsCard('Receipt', [['Exam', examTitle], ['Reference', receiptId, true]])}<p>${when}</p>`, `Reference ${receiptId}. ${when}`),
    };
  },
  resultReady: (name: string, examTitle: string, lobbyUrl: string) => ({
    subject: `Your results are ready: ${examTitle}`,
    text: `Hello ${name},\n\nYour results for ${examTitle} are ready. Sign in to the candidate lobby to see them: ${lobbyUrl}`,
    html: layout('Your results are ready', `<p style="margin:0">Hello ${esc(name)},</p><p>Your results for <b>${esc(examTitle)}</b> are ready.</p>
${button(lobbyUrl, 'See my results →')}`, `Your results for ${examTitle} are ready.`),
  }),
};

export interface MailInput { to: string; subject: string; html: string; text: string; kind: string; candidateId?: string }

/**
 * Sends with up to 3 attempts and exponential backoff and records every outcome in EmailLog.
 * Without Brevo or SMTP settings the message goes to the dev outbox (EmailLog with the rendered body).
 */
export async function sendMail(m: MailInput): Promise<{ ok: boolean; error?: string; outbox?: boolean }> {
  const log = await prisma.emailLog.create({
    data: { to: m.to, kind: m.kind, subject: m.subject, candidateId: m.candidateId ?? null, status: 'PENDING' },
  });
  const deliver = getDelivery();
  if (!deliver) {
    if (config.isProd) {
      const error = 'Email is not configured: set BREVO_API_KEY with MAIL_FROM (or SMTP_HOST, SMTP_USER and SMTP_PASS).';
      await prisma.emailLog.update({ where: { id: log.id }, data: { status: 'FAILED', attempts: 0, error } });
      logger.error({ to: m.to, kind: m.kind }, error);
      return { ok: false, error };
    }
    // OTP bodies are not stored, even in the outbox, to keep codes out of the database.
    await prisma.emailLog.update({ where: { id: log.id }, data: { status: 'SENT', attempts: 1, html: m.kind === 'otp' ? null : m.html } });
    logger.info({ to: m.to, kind: m.kind }, 'email written to dev outbox (no mail provider configured)');
    return { ok: true, outbox: true };
  }
  let lastError = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await deliver({ to: m.to, subject: m.subject, html: m.html, text: m.text });
      await prisma.emailLog.update({ where: { id: log.id }, data: { status: 'SENT', attempts: attempt } });
      return { ok: true };
    } catch (err) {
      lastError = (err as Error).message.slice(0, 300);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  await prisma.emailLog.update({ where: { id: log.id }, data: { status: 'FAILED', attempts: 3, error: lastError } });
  logger.warn({ to: m.to, kind: m.kind, error: lastError }, 'email delivery failed');
  return { ok: false, error: lastError };
}

export const renderTemplate = (text: string, vars: Record<string, string>) => text.replace(/\{\{(\w+)\}\}/g, (m, k: string) => vars[k] ?? m);

export function maskEmail(email: string): string {
  const [user = '', host = ''] = email.split('@');
  return `${user.slice(0, 2)}${'•'.repeat(Math.max(2, user.length - 2))}@${host}`;
}
