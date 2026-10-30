import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Mail delivery choice and the Brevo HTTPS path, with the email log and network faked. */
const cfg = vi.hoisted(() => ({
  isProd: true, mailProvider: 'brevo' as 'brevo' | 'smtp' | null, BREVO_API_KEY: 'bk', MAIL_FROM: 'Smart Proctor <proctor@gmail.com>',
  MAIL_FROM_NAME: 'Where U Elevate', SMTP_USER: '', SMTP_HOST: '', SMTP_PORT: 587, SMTP_PASS: '',
}));
const logs = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('../src/config.js', () => ({ config: cfg }));
vi.mock('../src/lib/core.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../src/lib/db.js', () => ({
  prisma: {
    emailLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { const row = { id: `l${logs.length + 1}`, ...data }; logs.push(row); return row; }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(logs.find((l) => l.id === where.id)!, data)),
    },
  },
}));

const { sendMail } = await import('../src/lib/mailer.js');
const mail = { to: 'cand@gmail.com', subject: 'Your exam link', html: '<p>Hi</p>', text: 'Hi', kind: 'credentials' };

beforeEach(() => {
  logs.length = 0;
  Object.assign(cfg, { isProd: true, mailProvider: 'brevo', MAIL_FROM: 'Smart Proctor <proctor@gmail.com>' });
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void) => { fn(); return 0; }) as unknown as typeof setTimeout);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('sendMail through Brevo', () => {
  it('posts the message to Brevo with the named sender and records it as sent', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ messageId: '<m1>' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await sendMail(mail)).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect((init.headers as Record<string, string>)['api-key']).toBe('bk');
    expect(JSON.parse(init.body as string)).toEqual({
      sender: { name: 'Smart Proctor', email: 'proctor@gmail.com' }, to: [{ email: 'cand@gmail.com' }],
      subject: 'Your exam link', htmlContent: '<p>Hi</p>', textContent: 'Hi',
    });
    expect(logs[0]).toMatchObject({ status: 'SENT', attempts: 1 });
  });

  it('uses the default sender name for a bare MAIL_FROM address', async () => {
    cfg.MAIL_FROM = 'proctor@gmail.com';
    const fetchMock = vi.fn(async () => new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    await sendMail(mail);
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(init.body as string).sender).toEqual({ name: 'Where U Elevate', email: 'proctor@gmail.com' });
  });

  it('retries, then reports the error message from Brevo', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ message: 'Sender not verified' }), { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await sendMail(mail);
    expect(r).toEqual({ ok: false, error: 'Brevo 400: Sender not verified' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(logs[0]).toMatchObject({ status: 'FAILED', attempts: 3 });
  });
});

describe('sendMail without a provider', () => {
  it('fails in production with a message naming the settings to add', async () => {
    cfg.mailProvider = null;
    const r = await sendMail(mail);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('BREVO_API_KEY');
  });

  it('writes to the dev outbox outside production', async () => {
    Object.assign(cfg, { mailProvider: null, isProd: false });
    expect(await sendMail(mail)).toEqual({ ok: true, outbox: true });
  });
});
