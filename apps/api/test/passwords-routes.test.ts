import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type RequestHandler } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import bcrypt from 'bcryptjs';

/** In-memory rows for the admin password routes. */
const db = vi.hoisted(() => ({
  users: [] as Array<Record<string, unknown>>,
  candidates: [] as Array<Record<string, unknown>>,
  invites: [] as Array<Record<string, unknown>>,
  audits: [] as string[],
}));

vi.mock('../src/lib/db.js', () => {
  const byId = (rows: Array<Record<string, unknown>>, id: unknown) => rows.find((r) => r.id === id);
  const apply = (row: Record<string, unknown>, data: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(data)) {
      row[k] = v && typeof v === 'object' && 'increment' in v ? (row[k] as number) + (v as { increment: number }).increment : v;
    }
    return row;
  };
  return {
    prisma: {
      invite: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
          const inv = byId(db.invites, where.id);
          return inv ? { ...inv, user: byId(db.users, inv.userId) ? { ...byId(db.users, inv.userId) } : null } : null;
        }),
      },
      user: { update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => apply(byId(db.users, where.id)!, data)) },
      candidate: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (byId(db.candidates, where.id) ? { ...byId(db.candidates, where.id) } : null)) },
    },
  };
});

const pass: RequestHandler = (_req, _res, next) => next();
vi.mock('../src/lib/auth.js', () => ({
  adminOnly: [pass],
  staff: [pass],
  audit: (_req: unknown, action: string) => db.audits.push(action),
}));
vi.mock('../src/lib/mailer.js', () => ({ sendMail: vi.fn(), renderTemplate: vi.fn(), templates: {} }));

const { invitesRouter } = await import('../src/modules/invites.js');
const { candidatesRouter } = await import('../src/modules/candidates.js');
const { errorMiddleware } = await import('../src/lib/core.js');
const { encrypt } = await import('../src/lib/crypto.js');
const { config } = await import('../src/config.js');

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

async function post(path: string) {
  const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  return { status: res.status, body: (await res.json()) as { ok: boolean; data?: { password: string }; error?: { code: string; message: string } } };
}

beforeEach(() => {
  db.users = [
    { id: 'p-new', role: 'MENTOR', name: 'New Proctor', passwordHash: 'x', credentialCipher: encrypt('Temp#Pass1', config.JWT_SECRET), tokenVersion: 0, failedLogins: 2, lockedUntil: null },
    { id: 'p-old', role: 'MENTOR', name: 'Signed-in Proctor', passwordHash: 'x', credentialCipher: null, tokenVersion: 3, failedLogins: 0, lockedUntil: null },
  ];
  db.invites = [
    { id: 'inv-new', role: 'MENTOR', userId: 'p-new' },
    { id: 'inv-old', role: 'MENTOR', userId: 'p-old' },
    { id: 'inv-cand', role: 'CANDIDATE', userId: null, candidateId: 'c-1' },
  ];
  db.candidates = [
    { id: 'c-1', credentialCipher: encrypt('Exam#0001', config.JWT_SECRET) },
    { id: 'c-2', credentialCipher: null },
  ];
  db.audits = [];
});

describe('proctor passwords', () => {
  it('reveals the temporary password before the first sign-in and audits it', async () => {
    const r = await post('/invites/inv-new/reveal-password');
    expect(r.body.data).toEqual({ password: 'Temp#Pass1' });
    expect(db.audits).toContain('proctor.reveal_password');
  });

  it('refuses once the proctor has signed in', async () => {
    const r = await post('/invites/inv-old/reveal-password');
    expect(r.status).toBe(409);
    expect(r.body.error?.message).toMatch(/Reset & copy/);
  });

  it('does not handle candidate links', async () => {
    expect((await post('/invites/inv-cand/reveal-password')).status).toBe(400);
  });

  it('resets to a new password that works, can be revealed, and signs the proctor out', async () => {
    const r = await post('/invites/inv-old/reset-password');
    const password = r.body.data!.password;
    expect(password.length).toBeGreaterThanOrEqual(8);
    const user = db.users[1]!;
    expect(bcrypt.compareSync(password, user.passwordHash as string)).toBe(true);
    expect(user.tokenVersion).toBe(4);
    expect((await post('/invites/inv-old/reveal-password')).body.data).toEqual({ password });
  });
});

describe('candidate passwords', () => {
  it('reveals the emailed password before the first sign-in', async () => {
    expect((await post('/candidates/c-1/reveal-password')).body.data).toEqual({ password: 'Exam#0001' });
  });

  it('refuses after the first sign-in', async () => {
    expect((await post('/candidates/c-2/reveal-password')).status).toBe(409);
  });
});
