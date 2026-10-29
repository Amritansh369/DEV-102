import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type RequestHandler } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const STARTED = new Date(Date.now() - 30 * 60_000);
const mocks = vi.hoisted(() => ({
  recordViolation: vi.fn(),
  snapshot: vi.fn(),
  toExam: vi.fn(),
}));

vi.mock('../src/lib/db.js', () => ({ prisma: { candidate: { findUnique: vi.fn(async () => ({ photoPath: null })) } } }));
vi.mock('../src/lib/auth.js', () => {
  const asCandidate: RequestHandler = (_req, _res, next) => next();
  return { candidateOnly: [asCandidate] };
});
vi.mock('../src/lib/security.js', () => {
  const pass: RequestHandler = (_req, _res, next) => next();
  return { limits: { frames: pass, ingest: pass } };
});
vi.mock('../src/modules/sessions.js', () => ({
  ownSession: vi.fn(async () => ({ id: 'sess-1', examId: 'exam-1', candidateId: 'cand-1', status: 'LIVE', startedAt: STARTED, exam: { settings: {} } })),
}));
vi.mock('../src/lib/evidence.js', () => ({
  decodeImage: () => ({ buffer: Buffer.from('jpeg'), mime: 'image/jpeg' }),
  evidencePath: (p: string) => p,
  saveEvidence: vi.fn(async () => 'ev-1'),
}));
vi.mock('../src/lib/agent.js', () => ({
  agent: { analyzeFrame: vi.fn(async () => ({ violations: [{ code: 'PHONE_DETECTED', severity: 'HIGH', message: 'Phone in view', confidence: 0.9 }], metrics: {} })) },
}));
vi.mock('../src/lib/policy.js', () => ({ recordViolation: mocks.recordViolation }));
vi.mock('../src/lib/realtime.js', () => ({ realtime: { snapshot: mocks.snapshot, toExam: mocks.toExam } }));

const { proctoringRouter } = await import('../src/modules/proctoring.js');
const { errorMiddleware } = await import('../src/lib/core.js');

let server: Server;
let base = '';
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/proctoring', proctoringRouter);
  app.use(errorMiddleware);
  server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));
beforeEach(() => {
  mocks.recordViolation.mockReset().mockResolvedValue({ status: 'LIVE' });
  mocks.snapshot.mockReset();
});

const IMAGE = `data:image/jpeg;base64,${'A'.repeat(200)}`;
const sendFrame = (extra: Record<string, unknown> = {}) =>
  fetch(`${base}/proctoring/frames`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'sess-1', image: IMAGE, ...extra }) });

describe('webcam frames kept while offline', () => {
  it('shows a live frame to mentors and records violations at the current time', async () => {
    expect((await sendFrame()).status).toBe(200);
    expect(mocks.snapshot).toHaveBeenCalledOnce();
    expect(mocks.recordViolation).toHaveBeenCalledWith(expect.not.objectContaining({ at: expect.anything() }));
  });

  it('records a backfilled frame at its capture time without showing it as live', async () => {
    const capturedAt = new Date(Date.now() - 5 * 60_000);
    expect((await sendFrame({ capturedAt: capturedAt.toISOString() })).status).toBe(200);
    expect(mocks.snapshot).not.toHaveBeenCalled();
    expect(mocks.recordViolation).toHaveBeenCalledWith(expect.objectContaining({ at: capturedAt, message: 'Phone in view (captured while offline)', evidenceId: 'ev-1' }));
  });

  it('keeps a capture time inside the session', async () => {
    await sendFrame({ capturedAt: new Date(STARTED.getTime() - 60 * 60_000).toISOString() });
    expect(mocks.recordViolation).toHaveBeenCalledWith(expect.objectContaining({ at: STARTED }));
    mocks.recordViolation.mockClear();
    await sendFrame({ capturedAt: new Date(Date.now() + 60 * 60_000).toISOString() });
    const at = (mocks.recordViolation.mock.calls[0]?.[0] as { at: Date }).at;
    expect(at.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('rejects a capture time that is not a date', async () => {
    expect((await sendFrame({ capturedAt: 'yesterday' })).status).toBe(400);
  });
});
