import { Router } from 'express';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { config } from '../config.js';
import { AppError, fail, handle, must, parse } from '../lib/core.js';
import { prisma } from '../lib/db.js';
import { auth, authenticate, requireRole, signToken } from '../lib/auth.js';
import { hashOtp, hashPassword, randomOtp, safeEqual, sha256, verifyPassword } from '../lib/crypto.js';
import { INVITE_TOKEN, examInclude, inviteStatus, toExam } from '../lib/domain.js';
import { decodeImage, evidencePath } from '../lib/evidence.js';
import { agent } from '../lib/agent.js';
import { maskEmail, sendMail, templates } from '../lib/mailer.js';
import { recordViolation } from '../lib/policy.js';
import { realtime } from '../lib/realtime.js';
import { limits } from '../lib/security.js';

const MAX_FAILS = 5;
const LOCK_MIN = 15;
const OTP_COOLDOWN_SEC = 30;
const OTP_MAX_ATTEMPTS = 5;
export const VERIFY_WINDOW_MS = 45 * 60_000;

const candidateLogin = z.object({
  examId: z.string().trim().min(3).max(64),
  userId: z.string().trim().min(3).max(64),
  password: z.string().min(1).max(128),
  deviceId: z.string().trim().min(8).max(128).optional(),
  channel: z.enum(['desktop', 'web']).default('desktop'),
});
const staffLogin = z.object({ email: z.string().trim().toLowerCase().email().max(200), password: z.string().min(1).max(128) });
const inviteToken = z.string().trim().toLowerCase().regex(INVITE_TOKEN, 'This exam link is not valid.');
const inviteLogin = z.object({ token: inviteToken, password: z.string().min(1).max(128), deviceId: z.string().trim().min(8).max(128) });

/** Compared against when the account does not exist, so response time does not reveal valid IDs. */
const DUMMY_HASH = hashPassword('timing-equaliser');
const BAD_CANDIDATE = 'Exam ID, User ID or password is incorrect.';
const BAD_STAFF = 'Incorrect email or password.';

function lockedError(until: Date): never {
  const retryAfterSec = Math.ceil((until.getTime() - Date.now()) / 1000);
  throw new AppError('LOCKED', `Too many failed attempts. Try again in ${Math.ceil(retryAfterSec / 60)} minute(s).`, { retryAfterSec });
}

/** Records a failed attempt and locks after MAX_FAILS; returns the remaining attempts. */
async function registerFailure(kind: 'candidate' | 'user', id: string, failed: number): Promise<never> {
  const next = failed + 1;
  const lock = next >= MAX_FAILS ? new Date(Date.now() + LOCK_MIN * 60_000) : null;
  const data = { failedLogins: lock ? 0 : next, lockedUntil: lock };
  if (kind === 'candidate') await prisma.candidate.update({ where: { id }, data });
  else await prisma.user.update({ where: { id }, data });
  if (lock) lockedError(lock);
  throw new AppError('AUTH', kind === 'candidate' ? BAD_CANDIDATE : BAD_STAFF, { attemptsLeft: MAX_FAILS - next });
}

export const authRouter = Router();

authRouter.get('/exams', handle(async () => {
  const exams = await prisma.exam.findMany({
    where: { deletedAt: null, status: { in: ['SCHEDULED', 'LIVE'] } },
    select: { id: true, code: true, title: true, startsAt: true, endsAt: true, status: true },
    orderBy: { startsAt: 'asc' },
  });
  return exams;
}));

authRouter.post('/login', limits.auth, handle(async (req) => {
  const body = parse(candidateLogin, req.body);
  const exam = await prisma.exam.findFirst({
    where: { deletedAt: null, OR: [{ code: { equals: body.examId, mode: 'insensitive' } }, { id: body.examId }] },
    include: examInclude,
  });
  const cand = exam ? await prisma.candidate.findFirst({ where: { examId: exam.id, userId: { equals: body.userId, mode: 'insensitive' } }, include: { device: true } }) : null;
  if (!exam || !cand) {
    await verifyPassword(body.password, await DUMMY_HASH); // equalise timing
    return fail('AUTH', BAD_CANDIDATE);
  }
  return signInCandidate(exam, cand, body);
}));

type ExamRow = Prisma.ExamGetPayload<{ include: typeof examInclude }>;
type CandidateRow = Prisma.CandidateGetPayload<{ include: { device: true } }>;

/** Password check, device binding and token issue shared by the Exam ID sign-in and the join-link sign-in. */
async function signInCandidate(exam: ExamRow, cand: CandidateRow, body: { password: string; deviceId?: string | undefined; channel: 'desktop' | 'web' }) {
  if (cand.lockedUntil && cand.lockedUntil > new Date()) lockedError(cand.lockedUntil);
  if (!(await verifyPassword(body.password, cand.passwordHash))) return registerFailure('candidate', cand.id, cand.failedLogins);
  if (cand.status === 'DISQUALIFIED') fail('FORBIDDEN', 'This candidate has been disqualified from the exam. Contact your organization.');

  const live = await prisma.examSession.findFirst({ where: { candidateId: cand.id, status: { in: ['LIVE', 'WAITING'] } } });
  if (body.channel === 'desktop') {
    const deviceId = body.deviceId ?? fail('VALIDATION', 'Device identifier missing. Update the desktop app.');
    if (live && live.deviceId && live.deviceId !== deviceId) {
      await recordViolation({ sessionId: live.id, code: 'MULTI_LOGIN', source: 'server', message: 'The same credentials signed in from a second device while the exam was in progress.' });
      fail('CONFLICT', 'This exam is already in progress on another device. The attempt was reported to the proctor.');
    }
    if (cand.device && cand.device.deviceId !== deviceId && !live) {
      fail('FORBIDDEN', 'This account is bound to a different computer. Ask your organization to reset your device.');
    }
    await prisma.deviceBinding.upsert({
      where: { candidateId: cand.id },
      create: { candidateId: cand.id, deviceId },
      update: { lastSeenAt: new Date() },
    });
  }

  const updated = await prisma.candidate.update({
    where: { id: cand.id },
    data: { failedLogins: 0, lockedUntil: null, tokenVersion: { increment: 1 }, credentialCipher: null },
  });
  if (live) realtime.toSession(live.id, 'session:kicked', { reason: 'Signed in again on this device.' });
  const token = signToken({ sub: cand.id, role: 'CANDIDATE', tv: updated.tokenVersion, examId: exam.id, ...(body.deviceId ? { deviceId: body.deviceId } : {}) });
  return {
    token,
    user: { id: cand.id, name: cand.name, email: cand.email, role: 'CANDIDATE' as const, examId: exam.id, candidateId: cand.id },
    exam: toExam(exam),
    ...(live ? { sessionId: live.id } : {}),
  };
}

/* ---------------------------------------------------------------- join links */

/** Resolves a pasted join link. Revoked, expired and other-device links are refused with a reason the user can act on. */
async function openInvite(token: string, deviceId?: string) {
  const inv = await prisma.invite.findUnique({
    where: { tokenHash: sha256(token) },
    include: { exam: { include: examInclude }, candidate: { include: { device: true } }, user: true },
  });
  if (!inv || inv.exam.deletedAt) return fail('NOT_FOUND', 'This exam link is not valid. Check that you copied the whole link from your email.');
  const status = inviteStatus(inv);
  if (status === 'REVOKED') fail('FORBIDDEN', 'This exam link was withdrawn. Use the newest email from your organisation.');
  if (status === 'EXPIRED') fail('FORBIDDEN', 'This exam link has expired because the exam has ended.');
  if (deviceId && inv.deviceId && inv.deviceId !== deviceId) fail('FORBIDDEN', 'This exam link is already in use on another computer. Ask your organization for a new link.');
  return inv;
}

authRouter.get('/invites/:token', limits.auth, handle(async (req) => {
  const inv = await openInvite(parse(inviteToken, req.params.token));
  const who = inv.role === 'CANDIDATE' ? inv.candidate : inv.user;
  if (!who) return fail('NOT_FOUND', 'The account for this exam link no longer exists.');
  return {
    role: inv.role === 'CANDIDATE' ? ('CANDIDATE' as const) : ('MENTOR' as const),
    name: who.name,
    email: maskEmail(who.email),
    ...(inv.candidate ? { userId: inv.candidate.userId } : {}),
    exam: { code: inv.exam.code, title: inv.exam.title, startsAt: inv.exam.startsAt.toISOString(), endsAt: inv.exam.endsAt.toISOString(), durationMin: inv.exam.durationMin },
    deviceBound: Boolean(inv.deviceId),
  };
}));

authRouter.post('/invites/login', limits.auth, handle(async (req) => {
  const body = parse(inviteLogin, req.body);
  const inv = await openInvite(body.token, body.deviceId);
  let result;
  if (inv.role === 'CANDIDATE') {
    const cand = inv.candidate ?? fail('NOT_FOUND', 'The account for this exam link no longer exists.');
    result = { ...(await signInCandidate(inv.exam, cand, { password: body.password, deviceId: body.deviceId, channel: 'desktop' })), role: 'CANDIDATE' as const };
  } else {
    const user = inv.user && !inv.user.deletedAt ? inv.user : fail('NOT_FOUND', 'The account for this exam link no longer exists.');
    if (user.lockedUntil && user.lockedUntil > new Date()) lockedError(user.lockedUntil);
    if (!(await verifyPassword(body.password, user.passwordHash))) return registerFailure('user', user.id, user.failedLogins);
    const updated = await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date(), credentialCipher: null } });
    await prisma.auditLog.create({ data: { actorId: user.id, actorRole: user.role, action: 'auth.invite_login', target: inv.examId, ip: req.ip ?? null } });
    // examId scopes the token to this exam, and staff routes then require fresh face and OTP checks (proctorVerified in lib/auth).
    const token = signToken({ sub: user.id, role: user.role, tv: updated.tokenVersion, examId: inv.examId, deviceId: body.deviceId });
    result = {
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, examId: inv.examId },
      exam: toExam(inv.exam),
      role: 'MENTOR' as const,
    };
  }
  if (!inv.deviceId) await prisma.invite.update({ where: { id: inv.id }, data: { deviceId: body.deviceId, usedAt: new Date() } });
  return result;
}));

authRouter.post('/staff/login', limits.auth, handle(async (req) => {
  const body = parse(staffLogin, req.body);
  const user = await prisma.user.findFirst({ where: { email: body.email, deletedAt: null } });
  if (!user) {
    await verifyPassword(body.password, await DUMMY_HASH);
    return fail('AUTH', BAD_STAFF);
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) lockedError(user.lockedUntil);
  if (!(await verifyPassword(body.password, user.passwordHash))) return registerFailure('user', user.id, user.failedLogins);
  const updated = await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date(), credentialCipher: null } });
  await prisma.auditLog.create({ data: { actorId: user.id, actorRole: user.role, action: 'auth.login', ip: req.ip ?? null } });
  return {
    token: signToken({ sub: user.id, role: user.role, tv: updated.tokenVersion }),
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  };
}));

authRouter.get('/me', authenticate, handle(async (req) => {
  const a = auth(req);
  if (a.role === 'CANDIDATE') {
    const c = must(await prisma.candidate.findUnique({ where: { id: a.sub } }), 'Candidate');
    return { id: c.id, name: c.name, email: c.email, role: 'CANDIDATE', examId: c.examId, candidateId: c.id };
  }
  const u = must(await prisma.user.findUnique({ where: { id: a.sub } }), 'User');
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}));

authRouter.post('/logout', authenticate, handle(async (req) => {
  const a = auth(req);
  if (a.role === 'CANDIDATE') await prisma.candidate.update({ where: { id: a.sub }, data: { tokenVersion: { increment: 1 } } });
  else await prisma.user.update({ where: { id: a.sub }, data: { tokenVersion: { increment: 1 } } });
  return { loggedOut: true };
}));

/* ---------------------------------------------------------------- OTP */

authRouter.post('/otp/send', authenticate, limits.otp, handle(async (req) => {
  const a = auth(req);
  const subject = a.role === 'CANDIDATE'
    ? await prisma.candidate.findUnique({ where: { id: a.sub }, select: { name: true, email: true } })
    : await prisma.user.findUnique({ where: { id: a.sub }, select: { name: true, email: true } });
  const who = must(subject, 'Account');
  const last = await prisma.otpCode.findFirst({ where: { subjectId: a.sub }, orderBy: { createdAt: 'desc' } });
  const since = last ? (Date.now() - last.createdAt.getTime()) / 1000 : Infinity;
  if (since < OTP_COOLDOWN_SEC) {
    throw new AppError('RATE_LIMITED', `Wait ${Math.ceil(OTP_COOLDOWN_SEC - since)} seconds before requesting another code.`, { resendInSec: Math.ceil(OTP_COOLDOWN_SEC - since) });
  }
  const code = randomOtp();
  const challenge = await prisma.otpCode.create({
    data: { subjectId: a.sub, codeHash: hashOtp(code, a.sub, config.JWT_SECRET), sentTo: who.email, expiresAt: new Date(Date.now() + config.OTP_TTL_MIN * 60_000) },
  });
  const mail = templates.otp(who.name, code, config.OTP_TTL_MIN);
  const sent = await sendMail({ to: who.email, ...mail, kind: 'otp', ...(a.role === 'CANDIDATE' ? { candidateId: a.sub } : {}) });
  if (!sent.ok) fail('SERVER', 'We could not send the code. Try again in a moment.');
  return {
    challengeId: challenge.id,
    sentTo: maskEmail(who.email),
    expiresInSec: config.OTP_TTL_MIN * 60,
    resendInSec: OTP_COOLDOWN_SEC,
    // Development only: with no SMTP configured the code is returned so the flow can be tested locally.
    ...(sent.outbox && !config.isProd ? { devCode: code } : {}),
  };
}));

authRouter.post('/otp/verify', authenticate, limits.otp, handle(async (req) => {
  const a = auth(req);
  const body = parse(z.object({ challengeId: z.string().min(1).max(64).optional(), code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code') }), req.body);
  const otp = await prisma.otpCode.findFirst({
    where: { subjectId: a.sub, consumedAt: null, ...(body.challengeId ? { id: body.challengeId } : {}) },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp || otp.expiresAt < new Date()) fail('AUTH', 'This code has expired. Request a new one.');
  const row = otp!;
  if (row.attempts >= OTP_MAX_ATTEMPTS) fail('LOCKED', 'Too many incorrect codes. Request a new one.');
  if (!safeEqual(row.codeHash, hashOtp(body.code, a.sub, config.JWT_SECRET))) {
    await prisma.otpCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    throw new AppError('AUTH', 'That code is incorrect.', { attemptsLeft: OTP_MAX_ATTEMPTS - row.attempts - 1 });
  }
  await prisma.otpCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
  return { verified: true as const, attemptsLeft: OTP_MAX_ATTEMPTS - row.attempts };
}));

/* ---------------------------------------------------------------- face */

authRouter.post('/face/verify', authenticate, requireRole('CANDIDATE', 'MENTOR'), limits.frames, handle(async (req) => {
  const a = auth(req);
  const body = parse(z.object({ image: z.string().min(100).max(4_000_000) }), req.body);
  const img = decodeImage(body.image) ?? fail('VALIDATION', 'The camera frame could not be read. Try again.');
  const subject = a.role === 'CANDIDATE'
    ? must(await prisma.candidate.findUnique({ where: { id: a.sub } }), 'Candidate')
    : must(await prisma.user.findUnique({ where: { id: a.sub } }), 'User');
  const registered = subject.photoPath ? (await readFile(evidencePath(subject.photoPath)).catch(() => null))?.toString('base64') ?? null : null;
  const r = await agent.faceMatch(img.buffer.toString('base64'), registered);
  if (!r.degraded && r.faces !== 1) {
    return { passed: false, matchScore: 0, livenessOk: r.liveness, faces: r.faces, reason: r.faces === 0 ? 'No face found. Centre your face in the frame.' : 'More than one face is visible. Only you should be in view.' };
  }
  const passed = r.degraded ? true : registered ? r.match : true;
  if (passed) {
    let photoPath = subject.photoPath;
    if (!photoPath) {
      // First verification registers the reference photo used for FACE_MISMATCH checks during the exam.
      await mkdir(config.evidenceDir, { recursive: true });
      photoPath = a.role === 'CANDIDATE' ? `face_${subject.id}.jpg` : `face_staff_${subject.id}.jpg`;
      await writeFile(evidencePath(photoPath), img.buffer, { mode: 0o600 });
    }
    if (a.role === 'CANDIDATE') await prisma.candidate.update({ where: { id: subject.id }, data: { photoPath, faceVerifiedAt: new Date(), faceScore: r.similarity } });
    else await prisma.user.update({ where: { id: subject.id }, data: { photoPath, faceVerifiedAt: new Date() } });
  }
  // Map raw cosine similarity onto 0..1 so the agent threshold lands at 0.85 on the candidate's meter.
  const thr = 0.363;
  const calibrated = r.degraded ? 0.85 : r.similarity >= thr ? 0.85 + 0.15 * Math.min(1, (r.similarity - thr) / (1 - thr)) : Math.max(0, (r.similarity / thr) * 0.84);
  return {
    passed, matchScore: Math.round(calibrated * 1000) / 1000, similarity: r.similarity, livenessOk: r.liveness, faces: r.faces, registered: !registered, degraded: Boolean(r.degraded),
    ...(r.degraded ? { reason: 'The face-analysis service is offline, so identity rests on the one-time code.' } : {}),
  };
}));
