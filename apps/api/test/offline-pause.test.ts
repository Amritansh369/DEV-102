import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type RequestHandler } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { resumedDeadline } from '../src/lib/domain.js';

const MIN = 60_000;

describe('resumedDeadline', () => {
  const now = Date.parse('2026-10-29T10:00:00Z');
  const endsAt = new Date(now + 60 * MIN);

  it('moves the deadline forward by the time since the last contact', () => {
    const r = resumedDeadline(new Date(now + 10 * MIN), new Date(now - 4 * MIN), endsAt, now);
    expect(r.getTime()).toBe(now + 14 * MIN);
  });

  it('never moves the deadline past the end of the exam window', () => {
    const r = resumedDeadline(new Date(now + 55 * MIN), new Date(now - 20 * MIN), endsAt, now);
    expect(r.getTime()).toBe(endsAt.getTime());
  });

  it('gives back time even when the old deadline passed during the outage', () => {
    const r = resumedDeadline(new Date(now - 1 * MIN), new Date(now - 5 * MIN), endsAt, now);
    expect(r.getTime()).toBe(now + 4 * MIN);
  });
});

/** One session row that the routes read and the resume step writes; updateMany honours the networkLost guard. */
const db = vi.hoisted(() => ({ session: {} as Record<string, unknown> }));
vi.mock('../src/lib/db.js', () => ({
  prisma: {
    examSession: {
      findUnique: vi.fn(async () => ({ ...db.session })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(db.session, data)),
      updateMany: vi.fn(async ({ where, data }: { where: { networkLost: boolean }; data: Record<string, unknown> }) => {
        if (db.session.networkLost !== where.networkLost) return { count: 0 };
        Object.assign(db.session, data);
        return { count: 1 };
      }),
    },
    question: { findMany: vi.fn(async () => []) },
    answer: { deleteMany: vi.fn(() => ({})), createMany: vi.fn(() => ({})), count: vi.fn(async () => 0) },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}));
vi.mock('../src/lib/auth.js', () => {
  const asCandidate: RequestHandler = (req, _res, next) => {
    (req as unknown as { auth: unknown }).auth = { sub: 'cand-1', role: 'CANDIDATE', tv: 0 };
    next();
  };
  return { candidateOnly: [asCandidate], authenticate: asCandidate, auth: (req: { auth: unknown }) => req.auth };
});
const realtime = vi.hoisted(() => ({ toExam: vi.fn(), toSession: vi.fn() }));
vi.mock('../src/lib/realtime.js', () => ({ realtime }));
vi.mock('../src/lib/policy.js', () => ({ finalizeSession: vi.fn() }));
vi.mock('../src/lib/mailer.js', () => ({ sendMail: vi.fn(), templates: {} }));
vi.mock('../src/lib/results.js', () => ({ notifyResultReady: vi.fn() }));
vi.mock('../src/modules/auth.js', () => ({ VERIFY_WINDOW_MS: 45 * 60_000 }));

const { sessionsRouter } = await import('../src/modules/sessions.js');
const { errorMiddleware } = await import('../src/lib/core.js');

let server: Server;
let base = '';
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/sessions', sessionsRouter);
  app.use(errorMiddleware);
  server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

/** A session the sweeper flagged offline `offlineMin` minutes ago, with `leftMin` minutes left when it went quiet. */
function offlineSession(offlineMin: number, leftMin: number) {
  const now = Date.now();
  db.session = {
    id: 'sess-1', candidateId: 'cand-1', examId: 'exam-1', status: 'LIVE', deviceId: null, progress: 0, warnings: 0, riskScore: 0,
    questionOrder: [], networkLost: true, lastHeartbeatAt: new Date(now - offlineMin * MIN),
    deadlineAt: new Date(now - offlineMin * MIN + leftMin * MIN), exam: { endsAt: new Date(now + 120 * MIN) },
  };
}
beforeEach(() => realtime.toExam.mockClear());

const call = async (method: string, path: string, body: unknown = {}) => {
  const res = await fetch(`${base}/sessions/sess-1/${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as { ok: boolean; data?: { remainingSec: number } } };
};

describe('exam clock pause while offline', () => {
  it('a heartbeat after an outage gives the offline time back and tells staff', async () => {
    offlineSession(5, 10);
    const r = await call('POST', 'heartbeat');
    expect(r.status).toBe(200);
    // 10 minutes were left when the candidate went quiet; the 5 offline minutes don't count.
    expect(r.body.data?.remainingSec).toBeGreaterThan(10 * 60 - 5);
    expect(r.body.data?.remainingSec).toBeLessThanOrEqual(10 * 60);
    expect(db.session.networkLost).toBe(false);
    expect(realtime.toExam).toHaveBeenCalledWith('exam-1', 'session:presence', expect.objectContaining({ sessionId: 'sess-1', online: true, pausedSec: 300 }));
  });

  it('accepts answers after the old deadline passed while the candidate was offline', async () => {
    offlineSession(8, 3);
    const r = await call('PUT', 'answers', { answers: {} });
    expect(r.status).toBe(200);
    expect(r.body.data?.remainingSec).toBeGreaterThan(3 * 60 - 5);
  });

  it('credits the time once when two requests arrive together on reconnect', async () => {
    offlineSession(5, 10);
    const deadline = (db.session.deadlineAt as Date).getTime();
    // This request read the row as offline, but a parallel one cleared the flag first.
    const { prisma } = await import('../src/lib/db.js');
    vi.mocked(prisma.examSession.updateMany).mockResolvedValueOnce({ count: 0 });
    await call('POST', 'heartbeat');
    expect((db.session.deadlineAt as Date).getTime()).toBe(deadline);
    expect(realtime.toExam).not.toHaveBeenCalledWith('exam-1', 'session:presence', expect.anything());
  });

  it('leaves the clock alone for a session that was never flagged offline', async () => {
    offlineSession(0, 10);
    db.session.networkLost = false;
    const deadline = (db.session.deadlineAt as Date).getTime();
    await call('POST', 'heartbeat');
    expect((db.session.deadlineAt as Date).getTime()).toBe(deadline);
    expect(realtime.toExam).not.toHaveBeenCalledWith('exam-1', 'session:presence', expect.anything());
  });
});
