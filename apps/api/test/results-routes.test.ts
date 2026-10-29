import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type RequestHandler } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

/** One candidate, one exam, one submitted session: just enough rows for the lobby and results routes. */
const db = vi.hoisted(() => ({
  exam: {} as Record<string, unknown>,
  candidate: {} as Record<string, unknown>,
  session: {} as Record<string, unknown>,
  pendingFlags: 0,
}));

const QUESTIONS = [
  { id: 'q1', text: 'SECRET-QUESTION-TEXT', options: [{ id: 'a', text: 'wrong' }, { id: 'b', text: 'SECRET-CORRECT-OPTION' }], correctIds: ['b'], marks: 3 },
  { id: 'q2', text: 'Second question', options: [{ id: 'a', text: 'yes' }, { id: 'b', text: 'no' }], correctIds: ['a'], marks: 2 },
];

vi.mock('../src/lib/db.js', () => ({
  prisma: {
    candidate: {
      findUnique: vi.fn(async () => ({ ...db.candidate, exam: { ...db.exam, questions: QUESTIONS.map((q) => ({ marks: q.marks })), _count: { candidates: 1, questions: 2 } } })),
      findUniqueOrThrow: vi.fn(async () => ({ ...db.candidate, exam: db.exam })),
    },
    examSession: { findFirst: vi.fn(async () => ({ ...db.session })) },
    violation: { count: vi.fn(async () => db.pendingFlags) },
    question: { findMany: vi.fn(async () => QUESTIONS) },
  },
}));
vi.mock('../src/lib/auth.js', () => {
  const asCandidate: RequestHandler = (req, _res, next) => {
    (req as unknown as { auth: unknown }).auth = { sub: 'cand-1', role: 'CANDIDATE', tv: 0 };
    next();
  };
  return { candidateOnly: [asCandidate], staff: [], adminOnly: [], auth: (req: { auth: unknown }) => req.auth };
});
vi.mock('../src/lib/mailer.js', () => ({ sendMail: vi.fn(), templates: {} }));

const { adminRouter } = await import('../src/modules/admin.js');
const { errorMiddleware } = await import('../src/lib/core.js');

let server: Server;
let base = '';
beforeAll(async () => {
  const app = express();
  app.use(adminRouter);
  app.use(errorMiddleware);
  server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const ENDS = new Date('2026-10-28T12:00:00Z');
const get = async (path: string) => {
  const res = await fetch(base + path);
  const text = await res.text();
  // Response bodies are loose JSON; each test asserts the exact fields it relies on.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, text, body: JSON.parse(text) as { ok: boolean; data?: Record<string, any>; error?: { message: string } } };
};

function setup(releaseResults: string, over: { pendingFlags?: number; now?: Date; candidateStatus?: string; sessionStatus?: string } = {}) {
  vi.setSystemTime(over.now ?? new Date(ENDS.getTime() + 60_000));
  db.exam = {
    id: 'exam-1', title: 'Campus Placement Test', code: 'WUE-CS-2026', status: 'SCHEDULED', durationMin: 60,
    startsAt: new Date(ENDS.getTime() - 3 * 3_600_000), endsAt: ENDS, settings: {}, extras: { releaseResults },
  };
  db.candidate = { id: 'cand-1', examId: 'exam-1', userId: 'asha01', name: 'Asha Rao', email: 'asha@wue.test', status: over.candidateStatus ?? 'SUBMITTED', emailStatus: 'SENT', photoPath: null };
  db.session = {
    id: 'sess-1', examId: 'exam-1', candidateId: 'cand-1', status: over.sessionStatus ?? 'SUBMITTED', progress: 100, riskScore: 10, warnings: 1,
    startedAt: new Date(ENDS.getTime() - 3_000_000), submittedAt: new Date(ENDS.getTime() - 600_000), submitReason: 'MANUAL', receiptId: 'RCPT-1A2B',
    questionOrder: ['q2', 'q1'], decision: null, answers: [{ questionId: 'q1', optionIds: ['b'] }, { questionId: 'q2', optionIds: ['b'] }],
  };
  db.pendingFlags = over.pendingFlags ?? 0;
}

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
afterEach(() => vi.useRealTimers());

const SECRETS = ['SECRET-QUESTION-TEXT', 'SECRET-CORRECT-OPTION', '"score"', '"summary"', 'correctIds'];

describe('before release', () => {
  it('sends neither score nor answers while flags await review', async () => {
    setup('AFTER_REVIEW', { pendingFlags: 1 });
    const lobby = await get('/candidate/lobby');
    expect(lobby.body.data!.result).toMatchObject({ receiptId: 'RCPT-1A2B', release: { scoreReleased: false, blockedBy: 'PENDING_REVIEW' } });
    expect(lobby.body.data!.result.message).toBe('Your results will be released after the recorded events are reviewed.');
    for (const s of SECRETS) expect(lobby.text).not.toContain(s);

    const results = await get('/candidate/results');
    expect(results.status).toBe(403);
    for (const s of SECRETS) expect(results.text).not.toContain(s);
  });

  it('sends nothing for a manual exam an admin has not released', async () => {
    setup('MANUAL');
    const lobby = await get('/candidate/lobby');
    expect(lobby.body.data!.result.release.blockedBy).toBe('PENDING_MANUAL');
    for (const s of SECRETS) expect(lobby.text).not.toContain(s);
    expect((await get('/candidate/results')).status).toBe(403);
  });

  it('sends nothing to a disqualified candidate', async () => {
    setup('IMMEDIATE', { candidateStatus: 'DISQUALIFIED' });
    const lobby = await get('/candidate/lobby');
    expect(lobby.body.data!.result.release.blockedBy).toBe('DISQUALIFIED');
    for (const s of SECRETS) expect(lobby.text).not.toContain(s);
    expect((await get('/candidate/results')).status).toBe(403);
  });
});

describe('after release', () => {
  it('shows the score but not the answers while the exam window is still open', async () => {
    setup('IMMEDIATE', { now: new Date(ENDS.getTime() - 60_000) });
    const lobby = await get('/candidate/lobby');
    expect(lobby.body.data!.result.summary).toMatchObject({ score: 3, totalMarks: 5, percent: 60, correct: 1, wrong: 1, unanswered: 0 });
    expect(lobby.text).not.toContain('SECRET-CORRECT-OPTION');

    const results = await get('/candidate/results');
    expect(results.status).toBe(403);
    expect(results.body.error!.message).toContain('The answer review opens when the exam window closes');
    expect(results.text).not.toContain('SECRET-CORRECT-OPTION');
  });

  it('shows the full review once the window has closed', async () => {
    setup('AFTER_REVIEW');
    const results = await get('/candidate/results');
    expect(results.status).toBe(200);
    const data = results.body.data!;
    expect(data.summary).toMatchObject({ score: 3, totalMarks: 5 });
    expect(data.questions.map((q: { questionId: string; status: string }) => [q.questionId, q.status])).toEqual([['q2', 'WRONG'], ['q1', 'CORRECT']]);
    expect(data.questions[1].options).toContainEqual({ id: 'b', text: 'SECRET-CORRECT-OPTION', picked: true, correct: true });
  });
});
