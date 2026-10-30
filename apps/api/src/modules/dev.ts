import { Router } from 'express';
import { spawn } from 'node:child_process';
import { z } from 'zod';
import { ROOT_DIR, config } from '../config.js';
import { fail, handle, logger, parse } from '../lib/core.js';
import { prisma } from '../lib/db.js';
import { adminOnly, auth, authenticate } from '../lib/auth.js';
import { INVITE_TOKEN, VIOLATION_CODES } from '../lib/domain.js';
import { decrypt, sha256 } from '../lib/crypto.js';
import { agent } from '../lib/agent.js';
import { recordViolation } from '../lib/policy.js';
import { realtime } from '../lib/realtime.js';
import { issueInvite } from './invites.js';

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
    sockets: realtime.connections(), smtp: config.mailProvider ? 'smtp' : 'outbox', mailProvider: config.mailProvider ?? 'outbox', reseeding,
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

/** Issues a fresh join link for the demo candidate or demo mentor on the demo exam, so the paste-link flow can be tested without email. */
devRouter.post('/invite-link', ...adminOnly, handle(async (req) => {
  const { role } = parse(z.object({ role: z.enum(['CANDIDATE', 'MENTOR']) }), req.body);
  const exam = await prisma.exam.findFirst({ where: { code: DEMO.candidate.examId } });
  if (!exam) return fail('NOT_FOUND', 'Demo exam not found. Reseed the database.');
  if (role === 'CANDIDATE') {
    const c = await prisma.candidate.findFirst({ where: { examId: exam.id, userId: DEMO.candidate.userId } });
    if (!c) return fail('NOT_FOUND', 'Demo candidate not found. Reseed the database.');
    await prisma.deviceBinding.deleteMany({ where: { candidateId: c.id } });
    const { link } = await issueInvite({ examId: exam.id, endsAt: exam.endsAt, role, email: c.email, candidateId: c.id });
    return { link, password: DEMO.candidate.password };
  }
  const u = await prisma.user.findUnique({ where: { email: DEMO.mentor.email } });
  if (!u) return fail('NOT_FOUND', 'Demo proctor not found. Reseed the database.');
  const { link } = await issueInvite({ examId: exam.id, endsAt: exam.endsAt, role, email: u.email, userId: u.id });
  return { link, password: DEMO.mentor.password };
}));

/**
 * The password for a pasted join link, so the desktop sign-in can be tested without opening the email.
 * Uses the stored copy (kept until first sign-in), then the seeded demo passwords.
 */
devRouter.post('/invite-password', handle(async (req) => {
  const { token } = parse(z.object({ token: z.string().trim().toLowerCase().regex(INVITE_TOKEN) }), req.body);
  const inv = await prisma.invite.findUnique({ where: { tokenHash: sha256(token) }, include: { candidate: true, user: true } });
  if (!inv) return fail('NOT_FOUND', 'Unknown exam link.');
  const cipher = inv.candidate?.credentialCipher ?? inv.user?.credentialCipher ?? null;
  const stored = cipher ? decrypt(cipher, config.JWT_SECRET) : null;
  // Seeded candidates use Exam@ plus the last four characters of their User ID (database/prisma/seed.ts).
  const seeded = inv.candidate
    ? (inv.candidate.userId === DEMO.candidate.userId || inv.candidate.userId === DEMO.candidate2.userId ? DEMO.candidate.password : `Exam@${inv.candidate.userId.slice(-4)}`)
    : inv.user?.email === DEMO.mentor.email ? DEMO.mentor.password : null;
  const password = stored ?? seeded;
  if (!password) return fail('NOT_FOUND', 'This password is no longer stored. Use Reset & copy in the organization panel.');
  return { password, source: stored ? 'stored' : 'seed' };
}));
