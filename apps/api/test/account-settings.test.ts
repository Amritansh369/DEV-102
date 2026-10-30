import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type RequestHandler } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const db = vi.hoisted(() => ({ user: { id: 'u-1', name: 'Org', email: 'org@example.com', role: 'ADMIN', passwordHash: '', tokenVersion: 3 } }));

vi.mock('../src/lib/db.js', () => ({
  prisma: {
    user: {
      findFirst: vi.fn(async () => db.user),
      update: vi.fn(async ({ data }: { data: { name?: string; passwordHash?: string; tokenVersion?: { increment: number } } }) => {
        Object.assign(db.user, data.name ? { name: data.name } : {}, data.passwordHash ? { passwordHash: data.passwordHash } : {});
        if (data.tokenVersion) db.user.tokenVersion += data.tokenVersion.increment;
        return db.user;
      }),
    },
    auditLog: { create: vi.fn(async () => ({})) },
  },
}));
vi.mock('../src/lib/auth.js', async (orig) => {
  const asOrg: RequestHandler = (req, _res, next) => {
    // A verified token carries iat and exp, which must not be copied into a new one.
    (req as unknown as { auth: unknown }).auth = { sub: 'u-1', role: 'ADMIN', tv: 3, iat: 1, exp: 9_999_999_999 };
    next();
  };
  return { ...(await orig<typeof import('../src/lib/auth.js')>()), authenticate: asOrg, requireRole: () => ((_req, _res, next) => next()) as RequestHandler };
});

const { authRouter } = await import('../src/modules/auth.js');
const { errorMiddleware } = await import('../src/lib/core.js');
const { hashPassword, verifyPassword } = await import('../src/lib/crypto.js');

let server: Server;
let base = '';
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);
  app.use(errorMiddleware);
  server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => { server.close(() => r()); }));
beforeEach(async () => {
  db.user.name = 'Org';
  db.user.tokenVersion = 3;
  db.user.passwordHash = await hashPassword('old-password-1');
});

const send = async (method: string, path: string, body: unknown) => {
  const r = await fetch(`${base}/auth${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, body: (await r.json()) as { data?: { name?: string; token?: string } } };
};

describe('account settings', () => {
  it('saves a new name', async () => {
    const r = await send('PATCH', '/profile', { name: '  Where U Elevate  ' });
    expect(r.body.data?.name).toBe('Where U Elevate');
  });

  it('changes the password, signs out other devices and keeps this one signed in', async () => {
    const r = await send('POST', '/change-password', { current: 'old-password-1', next: 'new-password-22' });
    expect(r.status).toBe(200);
    expect(r.body.data?.token).toBeTruthy();
    expect(db.user.tokenVersion).toBe(4);
    expect(await verifyPassword('new-password-22', db.user.passwordHash)).toBe(true);
  });

  it('refuses a wrong current password and a short new one', async () => {
    expect((await send('POST', '/change-password', { current: 'wrong-password', next: 'new-password-22' })).status).toBe(400);
    expect((await send('POST', '/change-password', { current: 'old-password-1', next: 'short' })).status).toBe(400);
    expect(await verifyPassword('old-password-1', db.user.passwordHash)).toBe(true);
    expect(db.user.tokenVersion).toBe(3);
  });
});
