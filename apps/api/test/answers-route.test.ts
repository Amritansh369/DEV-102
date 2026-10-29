import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type RequestHandler } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

/** A live session with one choice and one numeric question; records what saveAnswers writes. */
const db = vi.hoisted(() => ({
  deleted: [] as string[],
  created: [] as Array<{ questionId: string; optionIds: string[]; value: number | null }>,
}));
const QUESTIONS = [
  { id: 'm1', type: 'MCQ', options: [{ id: 'a', text: '3' }, { id: 'b', text: '4' }] },
  { id: 'n1', type: 'NUMERIC', options: [] },
];

vi.mock('../src/lib/db.js', () => ({
  prisma: {
    examSession: {
      findUnique: vi.fn(async () => ({
        id: 'sess-1', candidateId: 'cand-1', examId: 'exam-1', status: 'LIVE', deviceId: null, progress: 0,
        deadlineAt: new Date(Date.now() + 3_600_000), questionOrder: ['m1', 'n1'], exam: {},
      })),
      update: vi.fn(async () => ({})),
    },
    question: { findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => QUESTIONS.filter((q) => where.id.in.includes(q.id))) },
    answer: {
      deleteMany: vi.fn(({ where }: { where: { questionId: { in: string[] } } }) => { db.deleted.push(...where.questionId.in); return {}; }),
      createMany: vi.fn(({ data }: { data: typeof db.created }) => { db.created.push(...data.map(({ questionId, optionIds, value }) => ({ questionId, optionIds, value }))); return {}; }),
      count: vi.fn(async () => db.created.length),
    },
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
afterAll(() => new Promise<void>((r) => server.close(() => r())));
beforeEach(() => { db.deleted = []; db.created = []; });

const save = async (body: unknown) => {
  const res = await fetch(`${base}/sessions/sess-1/answers`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as { ok: boolean; error?: { message: string } } };
};

describe('PUT /sessions/:id/answers with numeric values', () => {
  it('stores a numeric value next to a choice answer', async () => {
    expect((await save({ answers: { m1: ['b'] }, values: { n1: 72.5 } })).status).toBe(200);
    expect(db.created).toEqual([{ questionId: 'm1', optionIds: ['b'], value: null }, { questionId: 'n1', optionIds: [], value: 72.5 }]);
  });

  it('does not touch numeric answers when a client sends only choice answers', async () => {
    await save({ answers: { m1: ['a'] } });
    expect(db.deleted).toEqual(['m1']);
  });

  it('does not touch choice answers when a client sends only numeric values', async () => {
    await save({ answers: {}, values: { n1: 3 } });
    expect(db.deleted).toEqual(['n1']);
  });

  it('clears a numeric answer when the value is null', async () => {
    await save({ answers: {}, values: { n1: null } });
    expect(db.deleted).toEqual(['n1']);
    expect(db.created).toEqual([]);
  });

  it('ignores a numeric value sent for a choice question, and options sent for a numeric one', async () => {
    await save({ answers: { n1: ['a'] }, values: { m1: 5 } });
    expect(db.created).toEqual([]);
    // Neither saved answer may be wiped: an older desktop app sends `answers: { n1: [] }` for numeric questions.
    expect(db.deleted).toEqual([]);
  });

  it('rejects values that are not finite numbers', async () => {
    expect((await save({ answers: {}, values: { n1: 'seventy' } })).status).toBe(400);
  });
});
