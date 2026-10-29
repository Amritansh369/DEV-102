import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type RequestHandler } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import bcrypt from 'bcryptjs';

/** In-memory stand-in for the auth tables. Passwords use bcrypt cost 4 so the suite stays fast. */
const db = vi.hoisted(() => ({
  users: [] as Array<Record<string, unknown>>,
  candidates: [] as Array<Record<string, unknown>>,
  otps: [] as Array<Record<string, unknown>>,
}));

vi.mock('../src/lib/db.js', () => {
  const byId = (rows: Array<Record<string, unknown>>, id: unknown) => rows.find((r) => r.id === id);
  // Prisma returns fresh objects, so reads hand back copies and later updates cannot change them.
  const copy = <T extends Record<string, unknown>>(row: T | undefined) => (row ? { ...row } : null);
  const apply = (row: Record<string, unknown>, data: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(data)) {
      row[k] = v && typeof v === 'object' && 'increment' in v ? (row[k] as number) + (v as { increment: number }).increment : v;
    }
    return row;
  };
  return {
    prisma: {
      user: {
        findFirst: vi.fn(async ({ where }: { where: { email: string } }) => copy(db.users.find((u) => u.email === where.email))),
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => copy(byId(db.users, where.id))),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => apply(byId(db.users, where.id)!, data)),
      },
      candidate: {
        findFirst: vi.fn(async ({ where }: { where: { userId: { equals: string } } }) =>
          copy(db.candidates.find((c) => (c.userId as string).toLowerCase() === where.userId.equals.toLowerCase()))),
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => copy(byId(db.candidates, where.id))),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => apply(byId(db.candidates, where.id)!, data)),
      },
      exam: {
        findFirst: vi.fn(async () => ({
          id: 'exam-1', title: 'Campus Placement Test', code: 'WUE-CS-2026', status: 'PUBLISHED', durationMin: 60,
          startsAt: new Date('2026-10-28T09:00:00Z'), endsAt: new Date('2026-10-28T18:00:00Z'), settings: {}, questions: [], _count: { candidates: 1, questions: 0 },
        })),
      },
      examSession: { findFirst: vi.fn(async () => null) },
      auditLog: { create: vi.fn(async () => ({})) },
      otpCode: {
        findFirst: vi.fn(async ({ where }: { where: { subjectId: string; consumedAt?: null; id?: string } }) => {
          const rows = db.otps.filter((o) =>
            o.subjectId === where.subjectId && (!('consumedAt' in where) || o.consumedAt === null) && (!where.id || o.id === where.id));
          return copy(rows.sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime())[0]);
        }),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `otp-${db.otps.length + 1}`, attempts: 0, consumedAt: null, createdAt: new Date(), ...data };
          db.otps.push(row);
          return row;
        }),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => apply(byId(db.otps, where.id)!, data)),
      },
    },
  };
});

// Signed-in as the candidate for the OTP routes; the real token checks are covered by the smoke test.
vi.mock('../src/lib/auth.js', () => ({
  authenticate: ((req, _res, next) => {
    (req as unknown as { auth: unknown }).auth = { sub: 'cand-1', role: 'CANDIDATE', tv: 0 };
    next();
  }) satisfies RequestHandler,
  auth: (req: { auth: unknown }) => req.auth,
  candidateOnly: [],
  signToken: () => 'signed-token',
}));
vi.mock('../src/lib/security.js', () => {
  const pass: RequestHandler = (_req, _res, next) => next();
  return { limits: { auth: pass, otp: pass, ingest: pass, frames: pass, general: pass } };
});
vi.mock('../src/lib/mailer.js', () => ({
  sendMail: vi.fn(async () => ({ ok: true, outbox: true })),
  maskEmail: (e: string) => e.replace(/^(.).*@/, '$1***@'),
  templates: { otp: () => ({ subject: 'Your code', html: '', text: '' }) },
}));
vi.mock('../src/lib/agent.js', () => ({ agent: {} }));
vi.mock('../src/lib/realtime.js', () => ({ realtime: { toExam: vi.fn(), toSession: vi.fn() } }));
vi.mock('../src/lib/policy.js', () => ({ recordViolation: vi.fn() }));

const { authRouter } = await import('../src/modules/auth.js');
const { errorMiddleware } = await import('../src/lib/core.js');

let server: Server;
let base = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);
  app.use(errorMiddleware);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

interface ApiBody { ok: boolean; data?: Record<string, unknown>; error?: { code: string; message: string; details?: Record<string, unknown> } }
async function post(path: string, body: unknown = {}): Promise<{ status: number; body: ApiBody }> {
  const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as ApiBody };
}

// Only Date is faked, so the HTTP server's own timers keep working.
const NOW = new Date('2026-10-28T10:00:00Z');
const advance = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  const hash = bcrypt.hashSync('Correct#Pass1', 4);
  db.users = [{ id: 'user-1', email: 'admin@wue.test', name: 'Admin', role: 'ADMIN', passwordHash: hash, failedLogins: 0, lockedUntil: null, tokenVersion: 0, deletedAt: null }];
  db.candidates = [{
    id: 'cand-1', examId: 'exam-1', userId: 'asha01', name: 'Asha Rao', email: 'asha@wue.test', passwordHash: hash,
    failedLogins: 0, lockedUntil: null, tokenVersion: 0, status: 'INVITED', device: null,
  }];
  db.otps = [];
});
afterEach(() => vi.useRealTimers());

/* ---------------------------------------------------------------- OTP */

describe('OTP codes', () => {
  async function sendCode() {
    const r = await post('/auth/otp/send');
    expect(r.status).toBe(200);
    return { challengeId: r.body.data!.challengeId as string, code: r.body.data!.devCode as string };
  }

  it('issues a 6-digit code that expires after OTP_TTL_MIN minutes', async () => {
    const r = await post('/auth/otp/send');
    expect(r.body.data).toMatchObject({ expiresInSec: 300, resendInSec: 30 });
    expect(r.body.data!.devCode).toMatch(/^\d{6}$/);
    expect((db.otps[0]!.expiresAt as Date).getTime()).toBe(NOW.getTime() + 5 * 60_000);
    expect(db.otps[0]!.codeHash).not.toContain(r.body.data!.devCode as string);
  });

  it('accepts the correct code just before it expires', async () => {
    const { challengeId, code } = await sendCode();
    advance(5 * 60_000 - 1_000);
    const r = await post('/auth/otp/verify', { challengeId, code });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ verified: true });
  });

  it('rejects the correct code once it has expired', async () => {
    const { challengeId, code } = await sendCode();
    advance(5 * 60_000 + 1_000);
    const r = await post('/auth/otp/verify', { challengeId, code });
    expect(r.status).toBe(401);
    expect(r.body.error).toMatchObject({ code: 'AUTH', message: 'This code has expired. Request a new one.' });
  });

  it('cannot be used twice', async () => {
    const { challengeId, code } = await sendCode();
    expect((await post('/auth/otp/verify', { challengeId, code })).status).toBe(200);
    const again = await post('/auth/otp/verify', { challengeId, code });
    expect(again.status).toBe(401);
  });

  it('counts down attempts on wrong codes and locks the code after 5', async () => {
    const { challengeId, code } = await sendCode();
    const wrong = code === '000000' ? '111111' : '000000';
    for (let left = 4; left >= 0; left--) {
      const r = await post('/auth/otp/verify', { challengeId, code: wrong });
      expect(r.status).toBe(401);
      expect(r.body.error?.details).toMatchObject({ attemptsLeft: left });
    }
    const locked = await post('/auth/otp/verify', { challengeId, code });
    expect(locked.status).toBe(423);
    expect(locked.body.error?.code).toBe('LOCKED');
  });

  it('makes the candidate wait 30 seconds before requesting another code', async () => {
    await sendCode();
    advance(10_000);
    const early = await post('/auth/otp/send');
    expect(early.status).toBe(429);
    expect(early.body.error?.details).toMatchObject({ resendInSec: 20 });
    advance(20_000);
    expect((await post('/auth/otp/send')).status).toBe(200);
  });
});

/* ---------------------------------------------------------------- lockout */

describe('account lockout', () => {
  const staffLogin = (password: string) => post('/auth/staff/login', { email: 'admin@wue.test', password });
  const candidateLogin = (password: string) => post('/auth/login', { examId: 'WUE-CS-2026', userId: 'asha01', password, channel: 'web' });

  it('counts down remaining attempts on each wrong password', async () => {
    for (let left = 4; left >= 1; left--) {
      const r = await staffLogin('wrong-password');
      expect(r.status).toBe(401);
      expect(r.body.error?.details).toMatchObject({ attemptsLeft: left });
    }
    expect(db.users[0]!.failedLogins).toBe(4);
    expect(db.users[0]!.lockedUntil).toBeNull();
  });

  it('locks the account for 15 minutes on the 5th wrong password', async () => {
    for (let i = 0; i < 4; i++) await staffLogin('wrong-password');
    const r = await staffLogin('wrong-password');
    expect(r.status).toBe(423);
    expect(r.body.error).toMatchObject({ code: 'LOCKED', details: { retryAfterSec: 900 } });
    expect((db.users[0]!.lockedUntil as Date).getTime()).toBe(NOW.getTime() + 15 * 60_000);
    expect(db.users[0]!.failedLogins).toBe(0);
  });

  it('refuses even the correct password while locked, then allows it after 15 minutes', async () => {
    for (let i = 0; i < 5; i++) await staffLogin('wrong-password');
    advance(14 * 60_000);
    expect((await staffLogin('Correct#Pass1')).status).toBe(423);
    advance(60_000 + 1_000);
    const r = await staffLogin('Correct#Pass1');
    expect(r.status).toBe(200);
    expect(db.users[0]).toMatchObject({ failedLogins: 0, lockedUntil: null });
  });

  it('resets the failure count after a successful sign-in', async () => {
    for (let i = 0; i < 3; i++) await staffLogin('wrong-password');
    expect((await staffLogin('Correct#Pass1')).status).toBe(200);
    expect(db.users[0]!.failedLogins).toBe(0);
    const r = await staffLogin('wrong-password');
    expect(r.body.error?.details).toMatchObject({ attemptsLeft: 4 });
  });

  it('applies the same lockout to candidate sign-in', async () => {
    for (let i = 0; i < 4; i++) expect((await candidateLogin('wrong-password')).status).toBe(401);
    expect((await candidateLogin('wrong-password')).status).toBe(423);
    expect((await candidateLogin('Correct#Pass1')).status).toBe(423);
    advance(15 * 60_000 + 1_000);
    const ok = await candidateLogin('Correct#Pass1');
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ token: 'signed-token' });
  });
});
