import { Router } from 'express';
import { spawn } from 'node:child_process';
import { z } from 'zod';
import { ROOT_DIR, config } from '../config.js';
import { fail, handle, logger, parse } from '../lib/core.js';
import { prisma } from '../lib/db.js';
import { adminOnly, auth, authenticate } from '../lib/auth.js';
import { VIOLATION_CODES } from '../lib/domain.js';
import { agent } from '../lib/agent.js';
import { recordViolation } from '../lib/policy.js';
import { realtime } from '../lib/realtime.js';

/** Development-only helpers for the floating dev toolbar. Never mounted when NODE_ENV=production. */
export const devRouter = Router();

const DEMO = {
  admin: { email: 'admin@wue.in', password: 'Admin@123' },
  mentor: { email: 'mentor@wue.in', password: 'Mentor@123' },
  candidate: { examId: 'CPA-26', userId: 'WUE26DEMO', password: 'Demo@2026' },
  candidate2: { examId: 'DSA-MT', userId: 'WUE26DEMO2', password: 'Demo@2026' },
};

let reseeding = false;

devRouter.get('/status', handle(async () => {
  const t = Date.now();
  const db = await prisma.$queryRaw`SELECT 1`.then(() => ({ ok: true, ms: Date.now() - t })).catch((e: Error) => ({ ok: false, error: e.message }));
  const [agentHealth, counts] = await Promise.all([
    agent.health(),
    Promise.all([prisma.exam.count(), prisma.candidate.count(), prisma.examSession.count({ where: { status: 'LIVE' } }), prisma.violation.count(), prisma.emailLog.count()]),
  ]);
  return {
    env: config.NODE_ENV, uptimeSec: Math.round(process.uptime()), db, agent: { ...agentHealth, circuitOpen: agent.circuitOpen },
    sockets: realtime.connections(), smtp: config.smtpEnabled ? 'smtp' : 'outbox', reseeding,
    counts: { exams: counts[0], candidates: counts[1], liveSessions: counts[2], violations: counts[3], emails: counts[4] },
    demo: DEMO,
  };
}));

devRouter.get('/outbox', handle(async () => {
  const rows = await prisma.emailLog.findMany({ orderBy: { at: 'desc' }, take: 40 });
  return rows.map((r) => ({ id: r.id, at: r.at.toISOString(), to: r.to, kind: r.kind, subject: r.subject, status: r.status, error: r.error, html: r.html }));
}));

devRouter.post('/reseed', ...adminOnly, handle(async () => {
  if (reseeding) fail('CONFLICT', 'A reseed is already running.');
  reseeding = true;
  const started = Date.now();
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, ['--import', 'tsx', 'database/prisma/seed.ts'], { cwd: ROOT_DIR, stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      child.stdout.on('data', (d: Buffer) => (out += d.toString()));
      child.stderr.on('data', (d: Buffer) => (out += d.toString()));
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(out.slice(-800)))));
    });
  } finally {
    reseeding = false;
  }
  logger.info('database reseeded from dev toolbar');
  return { ok: true, ms: Date.now() - started };
}));

/** Marks the signed-in candidate as face- and OTP-verified so UI work can skip the camera steps. */
devRouter.post('/verify-me', authenticate, handle(async (req) => {
  const a = auth(req);
  if (a.role !== 'CANDIDATE') fail('FORBIDDEN', 'Only candidates can be verified.');
  await prisma.candidate.update({ where: { id: a.sub }, data: { faceVerifiedAt: new Date(), faceScore: 1 } });
  await prisma.otpCode.create({ data: { subjectId: a.sub, codeHash: 'dev-bypass', sentTo: 'dev', expiresAt: new Date(), consumedAt: new Date() } });
  return { verified: true };
}));

devRouter.post('/simulate-violation', authenticate, handle(async (req) => {
  const body = parse(z.object({ sessionId: z.string().optional(), code: z.enum(VIOLATION_CODES as [string, ...string[]]).optional() }), req.body ?? {});
  const session = body.sessionId
    ? await prisma.examSession.findUnique({ where: { id: body.sessionId } })
    : await prisma.examSession.findFirst({ where: { status: 'LIVE' }, orderBy: { startedAt: 'desc' } });
  if (!session || session.status !== 'LIVE') fail('NOT_FOUND', 'No live session to attach the violation to.');
  const code = (body.code ?? VIOLATION_CODES[Math.floor(Math.random() * VIOLATION_CODES.length)]) as (typeof VIOLATION_CODES)[number];
  return recordViolation({ sessionId: session!.id, code, source: 'server', message: `[dev] simulated ${code.toLowerCase().replace(/_/g, ' ')}` });
}));

devRouter.post('/reset-candidate', authenticate, handle(async (req) => {
  const body = parse(z.object({ userId: z.string().default(DEMO.candidate.userId) }), req.body ?? {});
  const c = await prisma.candidate.findFirst({ where: { userId: body.userId } });
  if (!c) fail('NOT_FOUND', 'Candidate not found.');
  await prisma.examSession.deleteMany({ where: { candidateId: c!.id } });
  await prisma.deviceBinding.deleteMany({ where: { candidateId: c!.id } });
  await prisma.otpCode.deleteMany({ where: { subjectId: c!.id } });
  await prisma.candidate.update({
    where: { id: c!.id },
    data: { status: 'EMAILED', failedLogins: 0, lockedUntil: null, faceVerifiedAt: null, faceScore: null, photoPath: null, tokenVersion: { increment: 1 } },
  });
  return { reset: body.userId };
}));
