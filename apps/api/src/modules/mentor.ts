import { Router } from 'express';
import { z } from 'zod';
import type { Prisma, Severity, ViolationCode } from '@prisma/client';
import { fail, handle, must, pageArgs, parse } from '../lib/core.js';
import { prisma } from '../lib/db.js';
import { audit, auth, staff } from '../lib/auth.js';
import { VIOLATION_META, examInclude, readPolicy, toBrowsing, toCandidate, toExam, toSession, toViolation } from '../lib/domain.js';
import { signEvidenceUrl } from '../lib/evidence.js';
import { applyPenalties, finalizeSession, maybeReinstate, recomputeRisk } from '../lib/policy.js';
import { realtime } from '../lib/realtime.js';
import { notifyResultReady } from '../lib/results.js';

const sign = signEvidenceUrl;
const sessionInclude = { candidate: true, violations: { orderBy: { at: 'desc' as const } } } satisfies Prisma.ExamSessionInclude;

export const mentorRouter = Router();
mentorRouter.use(...staff);

/** SessionView rows for the web monitoring pages, highest risk first. */
mentorRouter.get('/sessions', handle(async (req) => {
  const q = req.query as Record<string, string | undefined>;
  const rows = await prisma.examSession.findMany({
    where: { exam: { deletedAt: null }, ...(q.examId ? { examId: q.examId } : {}), ...(q.status && q.status !== 'ALL' ? { status: q.status as 'LIVE' } : {}) },
    include: sessionInclude,
    orderBy: { riskScore: 'desc' },
    take: 500,
  });
  return rows.map((s) => ({
    ...toSession(s), candidate: toCandidate(s.candidate), violationCount: s.violations.length,
    ...(s.violations[0] ? { lastViolation: toViolation(s.violations[0], sign) } : {}),
  }));
}));

mentorRouter.get('/sessions/:id/detail', handle(async (req) => {
  const s = must(await prisma.examSession.findUnique({
    where: { id: String(req.params.id) },
    include: {
      candidate: true, exam: { include: examInclude },
      violations: { orderBy: { at: 'asc' } }, browsing: { orderBy: { at: 'desc' } },
      warningsSent: { orderBy: { at: 'desc' } }, riskPoints: { orderBy: { at: 'asc' } },
    },
  }), 'Session');
  const reviews = s.violations.filter((v) => v.reviewed).map((v) => ({ violationId: v.id, verdict: v.reviewed, reason: v.reviewReason ?? '', at: (v.reviewedAt ?? v.at).toISOString() }));
  return {
    session: toSession(s), candidate: toCandidate(s.candidate), exam: toExam(s.exam),
    violations: s.violations.map((v) => toViolation(v, sign)), browsing: s.browsing.map(toBrowsing),
    warningsSent: s.warningsSent.map((w) => ({ sessionId: s.id, message: w.message, at: w.at.toISOString() })),
    riskHistory: s.riskPoints.map((p) => ({ at: p.at.toISOString(), score: p.score })),
    reviews, penalties: readPolicy(s.exam.policy).penalties,
    submitReason: s.submitReason, score: s.score, receiptId: s.receiptId,
    ...(s.decision ? { decision: { sessionId: s.id, ...(s.decision as Record<string, unknown>) } } : {}),
  };
}));

async function warn(sessionIds: string[], message: string, byId: string) {
  const live = await prisma.examSession.findMany({ where: { id: { in: sessionIds }, status: 'LIVE' } });
  for (const s of live) {
    await prisma.$transaction([
      prisma.warningMessage.create({ data: { sessionId: s.id, message, byId } }),
      prisma.examSession.update({ where: { id: s.id }, data: { warnings: { increment: 1 } } }),
    ]);
    realtime.toSession(s.id, 'mentor:warn', { message, at: new Date().toISOString() });
    realtime.toExam(s.examId, 'session:status', { session: { ...toSession(s), warnings: s.warnings + 1 }, reason: 'WARNED' });
  }
  return live;
}

const warnSchema = z.object({ message: z.string().trim().min(3, 'Write a short message for the candidate.').max(500) });

mentorRouter.post('/sessions/:id/warn', handle(async (req) => {
  const { message } = parse(warnSchema, req.body);
  const [s] = await warn([String(req.params.id)], message, auth(req).sub);
  if (!s) fail('CONFLICT', 'Warnings can only be sent to live sessions.');
  audit(req, 'session.warn', s!.id);
  const fresh = await prisma.examSession.findUniqueOrThrow({ where: { id: s!.id } });
  return { ...toSession(fresh), deliveredAt: new Date().toISOString() };
}));

mentorRouter.post('/sessions/warn', handle(async (req) => {
  const body = parse(warnSchema.extend({ ids: z.array(z.string().max(64)).min(1).max(500) }), req.body);
  const sent = await warn(body.ids, body.message, auth(req).sub);
  audit(req, 'session.warn_bulk', undefined, { count: sent.length });
  return { sent: sent.length };
}));

mentorRouter.post('/sessions/:id/terminate', handle(async (req) => {
  const { reason } = parse(z.object({ reason: z.string().trim().min(5, 'A reason is required to terminate a session.').max(500) }), req.body);
  const s = must(await prisma.examSession.findUnique({ where: { id: String(req.params.id) } }), 'Session');
  if (s.status !== 'LIVE' && s.status !== 'WAITING') fail('CONFLICT', 'This session has already ended.');
  await prisma.warningMessage.create({ data: { sessionId: s.id, message: `Terminated: ${reason}`, byId: auth(req).sub } });
  realtime.toSession(s.id, 'session:terminate', { reason });
  const done = await finalizeSession(s.id, 'TERMINATED_BY_MENTOR', { disqualify: true });
  audit(req, 'session.terminate', s.id, { reason });
  return toSession(done);
}));

mentorRouter.post('/violations/:id/review', handle(async (req) => {
  const body = parse(z.object({
    verdict: z.enum(['CONFIRMED', 'OVERRULED']).nullable(), reason: z.string().trim().max(500).default(''),
    /** Marks to take off for this flag; the exam policy's amount for its severity when left out. */
    marks: z.number().min(0).max(1000).optional(),
  }), req.body);
  if (body.verdict === 'OVERRULED' && body.reason.length < 3) fail('VALIDATION', 'Give a short reason when overruling a penalty.');
  const v = must(await prisma.violation.findUnique({ where: { id: String(req.params.id) }, include: { session: { select: { exam: { select: { policy: true } } } } } }), 'Violation');
  const penaltyMarks = body.verdict === 'CONFIRMED' ? body.marks ?? readPolicy(v.session.exam.policy).penalties[v.severity] : null;
  const updated = await prisma.violation.update({
    where: { id: v.id },
    data: body.verdict
      ? { reviewed: body.verdict, reviewReason: body.reason || null, reviewedById: auth(req).sub, reviewedAt: new Date(), penaltyMarks }
      : { reviewed: null, reviewReason: null, reviewedById: null, reviewedAt: null, penaltyMarks },
  });
  const riskScore = await recomputeRisk(v.sessionId);
  await applyPenalties(v.sessionId);
  const reinstated = body.verdict === 'OVERRULED' ? await maybeReinstate(v.sessionId) : false;
  const session = await prisma.examSession.findUniqueOrThrow({ where: { id: v.sessionId } });
  realtime.toExam(session.examId, 'violation:reviewed', { violation: toViolation(updated, sign), riskScore, reinstated });
  audit(req, 'violation.review', v.id, { verdict: body.verdict, reinstated, penaltyMarks });
  // Reviewing the last flagged event can release an "after review" result.
  if (body.verdict) void notifyResultReady(v.sessionId);
  return {
    violation: toViolation(updated, sign), riskScore, reinstated, session: toSession(session),
    record: { violationId: v.id, verdict: body.verdict, reason: body.reason, at: new Date().toISOString(), ...(penaltyMarks !== null ? { marks: penaltyMarks } : {}) },
  };
}));

mentorRouter.post('/sessions/:id/decision', handle(async (req) => {
  const body = parse(z.object({ outcome: z.enum(['CLEAR', 'WARN', 'RETEST', 'DISQUALIFY']), note: z.string().trim().max(1000).default('') }), req.body);
  const s = must(await prisma.examSession.findUnique({ where: { id: String(req.params.id) } }), 'Session');
  const decision = { outcome: body.outcome, note: body.note, decidedAt: new Date().toISOString(), decidedBy: auth(req).sub };
  await prisma.examSession.update({ where: { id: s.id }, data: { decision } });
  if (body.outcome === 'DISQUALIFY') {
    if (s.status === 'LIVE') await finalizeSession(s.id, 'TERMINATED_BY_MENTOR', { disqualify: true });
    else await prisma.candidate.update({ where: { id: s.candidateId }, data: { status: 'DISQUALIFIED' } });
  } else if (body.outcome === 'CLEAR' && s.status !== 'LIVE') {
    await prisma.candidate.update({ where: { id: s.candidateId }, data: { status: 'SUBMITTED' } });
  }
  audit(req, 'session.decision', s.id, { outcome: body.outcome });
  if (body.outcome === 'CLEAR' || body.outcome === 'WARN') void notifyResultReady(s.id);
  return { sessionId: s.id, outcome: body.outcome, note: body.note, decidedAt: decision.decidedAt };
}));

mentorRouter.get('/mentor/dashboard', handle(async (req) => {
  const me = await prisma.user.findUniqueOrThrow({ where: { id: auth(req).sub } });
  const exams = await prisma.exam.findMany({ where: { deletedAt: null, status: { not: 'DRAFT' } }, include: examInclude, orderBy: { startsAt: 'desc' } });
  const sessions = await prisma.examSession.findMany({
    where: { examId: { in: exams.map((e) => e.id) } },
    include: { candidate: true, violations: { orderBy: { at: 'asc' } } },
    orderBy: { riskScore: 'desc' },
  });
  const flagAt = new Map(exams.map((e) => [e.id, readPolicy(e.policy).riskFlagAt]));
  const queue = sessions
    .filter((s) => s.violations.some((v) => !v.reviewed && v.severity !== 'LOW') || s.riskScore >= (flagAt.get(s.examId) ?? 60))
    .map((s) => {
      const e = exams.find((x) => x.id === s.examId)!;
      return { session: toSession(s), candidate: toCandidate(s.candidate), examTitle: e.title, examCode: e.code, violations: s.violations.map((v) => toViolation(v, sign)) };
    });
  return {
    mentorName: me.name,
    exams: exams.map((e) => {
      const own = sessions.filter((s) => s.examId === e.id);
      return { exam: toExam(e), sessionCount: own.length, liveCount: own.filter((s) => s.status === 'LIVE').length, flaggedCount: queue.filter((q) => q.session.examId === e.id).length };
    }),
    queue,
  };
}));

/* ---------------------------------------------------------------- desktop mentor grid */

const FRAME_OF: Partial<Record<ViolationCode, 'NO_FACE' | 'MULTI' | 'AWAY'>> = { NO_FACE: 'NO_FACE', CAMERA_BLOCKED: 'NO_FACE', MULTIPLE_FACES: 'MULTI', GAZE_AWAY: 'AWAY' };
const hue = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

/** A proctor signed in through a join link sees only the exam the link was for. */
const scopedExam = (req: Parameters<typeof auth>[0]) => auth(req).examId;

mentorRouter.get('/monitor/exams', handle(async (req) => {
  const now = new Date();
  const only = scopedExam(req);
  const exams = await prisma.exam.findMany({ where: { deletedAt: null, status: { not: 'DRAFT' }, startsAt: { lte: now }, endsAt: { gt: now }, ...(only ? { id: only } : {}) }, include: examInclude, orderBy: { startsAt: 'asc' } });
  return exams.map(toExam);
}));

mentorRouter.get('/monitor/exams/:id', handle(async (req) => {
  const examId = String(req.params.id);
  const only = scopedExam(req);
  if (only && only !== examId) fail('FORBIDDEN', 'You are not assigned to proctor this exam.');
  const sessions = await prisma.examSession.findMany({ where: { examId }, include: { ...sessionInclude, browsing: { where: { flaggedAi: true }, orderBy: { at: 'desc' }, take: 1 } }, orderBy: { startedAt: 'asc' } });
  const now = Date.now();
  const list = sessions.map((s) => {
    const last = s.violations[0];
    const recent = last && now - last.at.getTime() < 20_000 ? FRAME_OF[last.code] : undefined;
    return {
      ...toSession(s), candidateName: s.candidate.name, userId: s.candidate.userId, hue: hue(s.id), frame: recent ?? 'NORMAL',
      ...(s.candidate.photoPath ? { photoUrl: toCandidate(s.candidate).photoUrl } : {}),
      violationCount: s.violations.length, ...(last ? { lastViolation: toViolation(last, sign) } : {}),
      aiOpen: Boolean(s.browsing[0] && now - s.browsing[0].at.getTime() < 120_000),
    };
  });
  const feed = sessions
    .flatMap((s) => s.violations.slice(0, 15).map((v) => ({ ...toViolation(v, sign), candidateName: s.candidate.name, userId: s.candidate.userId })))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 60);
  return { sessions: list, feed };
}));

mentorRouter.get('/monitor/sessions/:id', handle(async (req) => {
  const id = String(req.params.id);
  const only = scopedExam(req);
  if (only && !(await prisma.examSession.findFirst({ where: { id, examId: only }, select: { id: true } }))) fail('FORBIDDEN', 'You are not assigned to proctor this exam.');
  const [violations, logs, s] = await Promise.all([
    prisma.violation.findMany({ where: { sessionId: id }, orderBy: { at: 'asc' } }),
    prisma.browsingLog.findMany({ where: { sessionId: id }, orderBy: { at: 'asc' } }),
    prisma.examSession.findUnique({ where: { id }, select: { penaltyMarks: true, exam: { select: { policy: true } } } }),
  ]);
  return { violations: violations.map((v) => toViolation(v, sign)), logs: logs.map(toBrowsing), penaltyMarks: s?.penaltyMarks ?? 0, penalties: readPolicy(s?.exam.policy).penalties };
}));

/* ---------------------------------------------------------------- violation list */

mentorRouter.get('/violations', handle(async (req) => {
  const q = req.query as Record<string, string | undefined>;
  const { page, pageSize, skip, take } = pageArgs(q);
  const where: Prisma.ViolationWhereInput = {
    ...(q.sessionId ? { sessionId: q.sessionId } : {}),
    ...(q.examId ? { session: { examId: q.examId } } : {}),
    ...(q.severity && q.severity !== 'ALL' ? { severity: q.severity as Severity } : {}),
    ...(q.code && q.code !== 'ALL' ? { code: q.code as ViolationCode } : {}),
    ...(q.reviewed && q.reviewed !== 'ALL' ? { reviewed: q.reviewed === 'PENDING' ? null : (q.reviewed as 'CONFIRMED' | 'OVERRULED') } : {}),
    ...(q.q ? { OR: [{ message: { contains: q.q, mode: 'insensitive' } }, { session: { candidate: { name: { contains: q.q, mode: 'insensitive' } } } }] } : {}),
  };
  const sortable = ['at', 'severity', 'code'];
  const orderBy = sortable.includes(q.sort ?? '') ? { [q.sort as string]: q.dir === 'asc' ? 'asc' : 'desc' } : { at: 'desc' as const };
  const [total, rows] = await Promise.all([
    prisma.violation.count({ where }),
    prisma.violation.findMany({ where, orderBy, skip, take, include: { session: { include: { candidate: { select: { name: true } }, exam: { select: { code: true } } } } } }),
  ]);
  return {
    items: rows.map((v) => ({ ...toViolation(v, sign), candidateName: v.session.candidate.name, examCode: v.session.exam.code, label: VIOLATION_META[v.code].label })),
    total, page, pageSize,
  };
}));
