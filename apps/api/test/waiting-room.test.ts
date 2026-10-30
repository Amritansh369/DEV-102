import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type RequestHandler } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

/** One candidate and one exam; `existing` is their session row, if any. */
const db = vi.hoisted(() => ({
  startsAt: new Date(),
  existing: null as Record<string, unknown> | null,
  created: [] as Array<Record<string, unknown>>,
  updated: [] as Array<Record<string, unknown>>,
}));

const row = (data: Record<string, unknown>) => ({ id: 'sess-1', startedAt: new Date(), progress: 0, riskScore: 0, warnings: 0, penaltyMarks: 0, ...data });

vi.mock('../src/lib/db.js', () => ({
  prisma: {
    candidate: {
      findUnique: vi.fn(async () => ({
        id: 'cand-1', name: 'Asha', userId: 'asha01', status: 'EMAILED', faceVerifiedAt: new Date(), faceScore: 0.9,
        exam: { id: 'exam-1', title: 'Test', status: 'SCHEDULED', startsAt: db.startsAt, endsAt: new Date(db.startsAt.getTime() + 7_200_000), durationMin: 60, settings: {}, extras: {}, policy: {}, deletedAt: null },
      })),
      update: vi.fn(async () => ({})),
    },
    examSession: {
      findFirst: vi.fn(async () => db.existing),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { db.created.push(data); return row(data); }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { db.updated.push(data); return row({ ...db.existing, ...data }); }),
      findUniqueOrThrow: vi.fn(async () => row({
        ...(db.updated[0] ?? db.created[0]), answers: [], flagged: [], candidateId: 'cand-1', examId: 'exam-1',
        exam: { id: 'exam-1', title: 'Test', status: 'SCHEDULED', startsAt: db.startsAt, endsAt: new Date(db.startsAt.getTime() + 7_200_000), durationMin: 60, settings: {}, extras: {}, policy: {}, questions: [], _count: { candidates: 1, questions: 1 } },
      })),
    },
    otpCode: { findFirst: vi.fn(async () => ({ consumedAt: new Date() })) },
    question: { findMany: vi.fn(async () => [{ id: 'q1', examId: 'exam-1', type: 'MCQ', text: 'One?', options: [], multi: false, marks: 1, difficulty: 'EASY', tags: [] }]) },
    riskPoint: { create: vi.fn(async () => ({})) },
  },
}));
vi.mock('../src/lib/auth.js', () => {
  const asCandidate: RequestHandler = (req, _res, next) => {
    (req as unknown as { auth: unknown }).auth = { sub: 'cand-1', role: 'CANDIDATE', tv: 0 };
    next();
  };
  return { candidateOnly: [asCandidate], authenticate: asCandidate, auth: (req: { auth: unknown }) => req.auth };
});
vi.mock('../src/lib/realtime.js', () => ({ realtime: { toExam: vi.fn(), toSession: vi.fn() } }));
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
afterAll(() => new Promise<void>((r) => { server.close(() => r()); }));

const start = async () => {
  const r = await fetch(`${base}/sessions/start`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ consent: true }) });
  return { status: r.status, body: (await r.json()) as { data?: { questions: unknown[] }; error?: { details?: { waiting?: boolean; startsAt?: string; serverTime?: string } } } };
};
const inMinutes = (min: number) => new Date(Date.now() + min * 60_000);

describe('exam waiting room', () => {
  beforeEach(() => {
    db.existing = null;
    db.created = [];
    db.updated = [];
  });

  it('holds an early candidate in the room with the start time, and gives no questions', async () => {
    db.startsAt = inMinutes(5);
    const r = await start();
    expect(r.status).toBe(409);
    expect(r.body.error?.details).toMatchObject({ waiting: true, startsAt: db.startsAt.toISOString() });
    expect(r.body.data).toBeUndefined();
    expect(db.created).toEqual([expect.objectContaining({ status: 'WAITING', questionOrder: [] })]);
  });

  it('shows the countdown before check-in opens but adds nobody to the room', async () => {
    db.startsAt = inMinutes(120);
    const r = await start();
    expect(r.body.error?.details?.waiting).toBe(true);
    expect(db.created).toEqual([]);
  });

  it('does not add a second row while the candidate waits', async () => {
    db.startsAt = inMinutes(5);
    db.existing = { id: 'sess-1', status: 'WAITING', deviceId: null };
    expect((await start()).status).toBe(409);
    expect(db.created).toEqual([]);
  });

  it('moves the waiting candidate to the exam with their full time when it opens', async () => {
    db.startsAt = inMinutes(-1);
    db.existing = { id: 'sess-1', status: 'WAITING', deviceId: null };
    const r = await start();
    expect(r.status).toBe(200);
    expect(db.created).toEqual([]);
    expect(db.updated[0]).toMatchObject({ status: 'LIVE', questionOrder: ['q1'] });
    expect((db.updated[0]?.deadlineAt as Date).getTime()).toBeGreaterThan(Date.now() + 59 * 60_000);
  });

  it('lets a waiting candidate in after late entry has closed: they came on time', async () => {
    db.startsAt = inMinutes(-30);
    db.existing = { id: 'sess-1', status: 'WAITING', deviceId: null };
    expect((await start()).status).toBe(200);
    db.existing = null;
    expect((await start()).status).toBe(409);
  });
});
