import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const findMany = vi.hoisted(() => vi.fn(async () => []));

vi.mock('../src/lib/db.js', () => ({
  prisma: { exam: { count: vi.fn(async () => 0), findMany } },
}));
vi.mock('../src/lib/auth.js', () => ({ candidateOnly: [], staff: [], adminOnly: [], auth: () => ({ sub: 'admin-1', role: 'ADMIN', tv: 0 }) }));
vi.mock('../src/lib/mailer.js', () => ({ sendMail: vi.fn(), templates: {} }));

const { examsRouter } = await import('../src/modules/exams.js');

let server: Server;
let base = '';
beforeAll(async () => {
  const app = express();
  app.use(examsRouter);
  server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); });
beforeEach(() => { findMany.mockClear(); });

const orderOf = async (query: string) => {
  const res = await fetch(`${base}/${query}`);
  expect(res.status).toBe(200);
  return (findMany.mock.calls[0] as unknown as [{ orderBy: unknown }])[0].orderBy;
};

describe('GET /exams sorting', () => {
  it('sorts by creation time so the newest exam comes first', async () => {
    expect(await orderOf('?sort=createdAt&dir=desc')).toEqual({ createdAt: 'desc' });
  });

  it('falls back to the start time for a column it cannot sort on', async () => {
    expect(await orderOf('?sort=passwordHash&dir=asc')).toEqual({ startsAt: 'desc' });
  });
});
