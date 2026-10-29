import { Router } from 'express';
import { z } from 'zod';
import type { Invite, Role } from '@prisma/client';
import { config } from '../config.js';
import { fail, handle, must, parse } from '../lib/core.js';
import { prisma } from '../lib/db.js';
import { adminOnly, audit } from '../lib/auth.js';
import { hashPassword, randomPassword, randomToken, sha256 } from '../lib/crypto.js';
import { inviteStatus } from '../lib/domain.js';
import { sendMail, templates } from '../lib/mailer.js';

export const inviteLink = (token: string): string => `${config.clientOrigins[0] ?? 'http://localhost:3000'}/join/${token}`;

/**
 * Creates a join link valid until the exam ends and withdraws any earlier link for the same person,
 * so only the newest email works. Returns the plain token, which is never stored.
 */
export async function issueInvite(input: { examId: string; endsAt: Date; role: Extract<Role, 'CANDIDATE' | 'MENTOR'>; email: string; candidateId?: string; userId?: string }): Promise<{ id: string; link: string }> {
  if (input.endsAt <= new Date()) fail('CONFLICT', 'This exam has already ended, so no join link can be sent.');
  const owner = input.candidateId ? { candidateId: input.candidateId } : { userId: input.userId ?? fail('VALIDATION', 'Invite owner missing.') };
  const token = randomToken(24);
  const [, invite] = await prisma.$transaction([
    prisma.invite.updateMany({ where: { examId: input.examId, ...owner, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.invite.create({ data: { tokenHash: sha256(token), examId: input.examId, role: input.role, email: input.email, expiresAt: input.endsAt, ...owner } }),
  ]);
  return { id: invite.id, link: inviteLink(token) };
}

const toProctorRow = (inv: Invite & { user: { name: string } | null }) => ({
  inviteId: inv.id, userId: inv.userId, name: inv.user?.name ?? '', email: inv.email, status: inviteStatus(inv),
  usedAt: inv.usedAt?.toISOString() ?? null, deviceBound: Boolean(inv.deviceId), createdAt: inv.createdAt.toISOString(),
});

async function sendProctorInvite(inviteExamId: string, user: { id: string; name: string; email: string }, password: string | null) {
  const exam = must(await prisma.exam.findFirst({ where: { id: inviteExamId, deletedAt: null } }), 'Exam');
  const { id, link } = await issueInvite({ examId: exam.id, endsAt: exam.endsAt, role: 'MENTOR', email: user.email, userId: user.id });
  const start = exam.startsAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
  const sent = await sendMail({ to: user.email, ...templates.proctorInvite(user.name, exam.title, exam.code, start, link, password, config.APP_DOWNLOAD_URL), kind: 'proctor_invite' });
  if (!sent.ok) fail('SERVER', `The invite email could not be sent: ${sent.error ?? 'unknown error'}`);
  // Development only: with no SMTP configured the link is returned so the flow can be tested locally.
  return { inviteId: id, ...(sent.outbox && !config.isProd ? { devLink: link } : {}) };
}

export const invitesRouter = Router();

invitesRouter.get('/exams/:id/proctors', ...adminOnly, handle(async (req) => {
  const rows = await prisma.invite.findMany({
    where: { examId: String(req.params.id), role: 'MENTOR' },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  // Newest invite per proctor; older ones were withdrawn when it was sent.
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (r.userId && !latest.has(r.userId)) latest.set(r.userId, r);
  return [...latest.values()].map(toProctorRow);
}));

/** Invites a proctor by email. A mentor account is created when none exists and its temporary password goes in the same email. */
invitesRouter.post('/exams/:id/proctors', ...adminOnly, handle(async (req) => {
  const body = parse(z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().toLowerCase().email().max(200) }), req.body);
  const examId = String(req.params.id);
  let user = await prisma.user.findUnique({ where: { email: body.email } });
  if (user && (user.deletedAt || user.role !== 'MENTOR')) fail('CONFLICT', 'This email belongs to an account that cannot proctor. Use a different email.');
  let password: string | null = null;
  if (!user) {
    password = randomPassword();
    user = await prisma.user.create({ data: { email: body.email, name: body.name, role: 'MENTOR', passwordHash: await hashPassword(password) } });
  }
  const r = await sendProctorInvite(examId, user, password);
  audit(req, 'proctor.invite', examId, { userId: user.id, created: password !== null });
  return { ...r, userId: user.id, created: password !== null };
}));

invitesRouter.post('/invites/:id/resend', ...adminOnly, handle(async (req) => {
  const inv = must(await prisma.invite.findUnique({ where: { id: String(req.params.id) }, include: { user: true } }), 'Invite');
  if (inv.role !== 'MENTOR' || !inv.user) fail('VALIDATION', 'Candidate links are resent with "Send credentials".');
  const user = inv.user!;
  // A proctor who never signed in gets a fresh temporary password; anyone else keeps their own.
  let password: string | null = null;
  if (!user.lastLoginAt) {
    password = randomPassword();
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password), tokenVersion: { increment: 1 } } });
  }
  const r = await sendProctorInvite(inv.examId, user, password);
  audit(req, 'invite.resend', inv.id);
  return r;
}));

invitesRouter.post('/invites/:id/revoke', ...adminOnly, handle(async (req) => {
  const inv = must(await prisma.invite.findUnique({ where: { id: String(req.params.id) } }), 'Invite');
  const updated = inv.revokedAt ? inv : await prisma.invite.update({ where: { id: inv.id }, data: { revokedAt: new Date() } });
  // Sign the person out too, so a revoked proctor loses the console straight away.
  if (inv.userId) await prisma.user.update({ where: { id: inv.userId }, data: { tokenVersion: { increment: 1 } } });
  audit(req, 'invite.revoke', inv.id);
  return { inviteId: inv.id, status: inviteStatus(updated) };
}));
