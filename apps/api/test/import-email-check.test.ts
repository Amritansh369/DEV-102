import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type RequestHandler } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

/** Candidate import and proctor invite with the DNS check faked: gmial.com has no mail servers. */
const db = vi.hoisted(() => ({ created: [] as Array<Record<string, unknown>> }));

vi.mock('../src/lib/db.js', () => ({
  prisma: {
    exam: { findFirst: vi.fn(async () => ({ id: 'exam-1', code: 'LIVE-01' })) },
    candidate: {
      findMany: vi.fn(async () => []),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `c${db.created.length + 1}`, status: 'INVITED', emailStatus: 'PENDING', photoPath: null, ...data };
        db.created.push(row);
        return row;
      }),
    },
    user: { findUnique: vi.fn(async () => null) },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));
const pass: RequestHandler = (_req, _res, next) => next();
vi.mock('../src/lib/auth.js', () => ({ adminOnly: [pass], staff: [pass], audit: vi.fn() }));
vi.mock('../src/lib/mailer.js', () => ({ sendMail: vi.fn(), renderTemplate: vi.fn(), templates: {} }));
vi.mock('../src/lib/email-check.js', () => ({
  mailDomainOk: vi.fn(async (email: string) => !email.endsWith('@gmial.com')),
  gravatarUrl: (email: string) => `https://gravatar.com/avatar/${email}`,
}));

const { invitesRouter } = await import('../src/modules/invites.js');
const { candidatesRouter } = await import('../src/modules/candidates.js');
const { errorMiddleware } = await import('../src/lib/core.js');

let server: Server;
let base = '';
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(invitesRouter, candidatesRouter);
  app.use(errorMiddleware);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => { db.created = []; });

async function post(path: string, body: unknown) {
  const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() as { ok: boolean; data?: Record<string, unknown>; error?: { code: string; message: string } } };
}

describe('candidate import email check', () => {
  it('imports good addresses and reports a typo domain as an invalid row, with each candidate getting an avatar URL', async () => {
    const r = await post('/exams/exam-1/candidates/import', { rows: [
      { name: 'Asha Rao', email: 'asha@gmail.com' },
      { name: 'Ravi Kumar', email: 'ravi@gmial.com' },
      { name: 'Meera Iyer', email: 'meera@outlook.com' },
    ] });
    expect(r.status).toBe(200);
    expect(db.created.map((c) => c.email)).toEqual(['asha@gmail.com', 'meera@outlook.com']);
    expect(r.body.data?.invalid).toEqual([{ row: 2, message: '"ravi@gmial.com" cannot receive email: its domain does not exist or accepts no mail.' }]);
    expect((r.body.data?.added as Array<{ avatarUrl: string }>)[0]?.avatarUrl).toBe('https://gravatar.com/avatar/asha@gmail.com');
  });
});

describe('proctor invite email check', () => {
  it('refuses a proctor whose email domain cannot receive mail', async () => {
    const r = await post('/exams/exam-1/proctors', { name: 'Dr Rao', email: 'rao@gmial.com' });
    expect(r.status).toBe(400);
    expect(r.body.error?.message).toContain('cannot receive email');
  });
});
