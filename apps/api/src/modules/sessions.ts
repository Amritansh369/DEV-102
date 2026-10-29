import { Router, type Request } from 'express';
import { z } from 'zod';
import { fail, handle, must, parse } from '../lib/core.js';
import { prisma } from '../lib/db.js';
import { auth, authenticate, candidateOnly } from '../lib/auth.js';
import { examInclude, examStatus, readExtras, resumedDeadline, readOptions, readPolicy, readSettings, toExam, toQuestion, toSession } from '../lib/domain.js';
import { finalizeSession } from '../lib/policy.js';
import { realtime } from '../lib/realtime.js';
import { sendMail, templates } from '../lib/mailer.js';
import { notifyResultReady } from '../lib/results.js';
import { VERIFY_WINDOW_MS } from './auth.js';

const GRACE_MS = 15_000;

/** Loads a session the caller may act on: candidates only their own, staff any. */
export async function ownSession(req: Request, sessionId: string) {
  const a = auth(req);
  const s = must(await prisma.examSession.findUnique({ where: { id: sessionId }, include: { exam: true } }), 'Session');
  if (a.role === 'CANDIDATE') {
    if (s.candidateId !== a.sub) fail('FORBIDDEN', 'This is not your exam session.');
    if (s.deviceId && a.deviceId && s.deviceId !== a.deviceId) fail('FORBIDDEN', 'This session belongs to another device.');
  }
  return s;
}

const remainingSec = (deadline: Date) => Math.max(0, Math.round((deadline.getTime() - Date.now()) / 1000));

type LoadedSession = Awaited<ReturnType<typeof ownSession>>;

/** First contact after an outage the sweeper flagged: give the offline time back to the clock and tell staff. */
async function resumeIfPaused(s: LoadedSession): Promise<LoadedSession> {
  if (s.status !== 'LIVE' || !s.networkLost || !s.lastHeartbeatAt) return s;
  const now = Date.now();
  const deadlineAt = resumedDeadline(s.deadlineAt, s.lastHeartbeatAt, s.exam.endsAt, now);
  const lastHeartbeatAt = new Date(now);
  // Only the request that clears the flag credits the time, so parallel requests on reconnect can't add it twice.
  const { count } = await prisma.examSession.updateMany({ where: { id: s.id, networkLost: true }, data: { networkLost: false, deadlineAt, lastHeartbeatAt } });
  if (count === 0) return must(await prisma.examSession.findUnique({ where: { id: s.id }, include: { exam: true } }), 'Session');
  const pausedSec = Math.round((now - s.lastHeartbeatAt.getTime()) / 1000);
  realtime.toExam(s.examId, 'session:presence', { sessionId: s.id, online: true, pausedSec, deadlineAt: deadlineAt.toISOString() });
  return { ...s, networkLost: false, deadlineAt, lastHeartbeatAt };
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

async function paper(sessionId: string) {
  const s = await prisma.examSession.findUniqueOrThrow({ where: { id: sessionId }, include: { exam: { include: examInclude }, answers: true } });
  const questions = await prisma.question.findMany({ where: { id: { in: s.questionOrder } } });
  const byId = new Map(questions.map((q) => [q.id, q]));
  const ordered = s.questionOrder.map((id) => byId.get(id)).filter((q) => q !== undefined);
  const policy = readPolicy(s.exam.policy);
  const settings = readSettings(s.exam.settings);
  return {
    exam: toExam(s.exam),
    sessionId: s.id,
    session: toSession(s),
    questions: ordered.map((q) => ({ ...toQuestion(q, false), correctIds: [] as string[] })),
    saved: {
      answers: Object.fromEntries(s.answers.filter((a) => a.optionIds.length > 0).map((a) => [a.questionId, a.optionIds])),
      values: Object.fromEntries(s.answers.filter((a) => a.value !== null).map((a) => [a.questionId, a.value])),
      flagged: s.flagged,
    },
    remainingSec: remainingSec(s.deadlineAt),
    deadlineAt: s.deadlineAt.toISOString(),
    serverTime: new Date().toISOString(),
    warningsUsed: s.warnings,
    maxWarnings: Math.min(policy.maxWarnings, settings.maxWarnings),
    instructions: readExtras(s.exam.extras, s.exam.title).instructions,
  };
}

const answersSchema = z.record(z.string().max(64), z.array(z.string().max(8)).max(6)).refine((o) => Object.keys(o).length <= 2000, 'Too many answers');
/** Numeric answers by question id; null clears an answer. */
const valuesSchema = z.record(z.string().max(64), z.number().finite().nullable()).refine((o) => Object.keys(o).length <= 2000, 'Too many answers');

/**
 * Validates answers against the session's questions and stores them in one transaction. Choice questions change only
 * when listed in `answers` and numeric ones only when listed in `values`, so a client that sends one map never wipes the other.
 */
async function saveAnswers(sessionId: string, questionOrder: string[], answers: Record<string, string[]>, flagged?: string[], values: Record<string, number | null> = {}) {
  const allowed = new Set(questionOrder);
  const ids = [...new Set([...Object.keys(answers), ...Object.keys(values)])].filter((k) => allowed.has(k));
  const questions = await prisma.question.findMany({ where: { id: { in: ids } }, select: { id: true, options: true, type: true } });
  const valid = questions.flatMap((q) => {
    if (q.type === 'NUMERIC') return q.id in values ? [{ questionId: q.id, optionIds: [] as string[], value: values[q.id] ?? null }] : [];
    if (!(q.id in answers)) return [];
    const optionIds = new Set(readOptions(q.options).map((o) => o.id));
    return [{ questionId: q.id, optionIds: [...new Set(answers[q.id] ?? [])].filter((o) => optionIds.has(o)), value: null }];
  });
  const answered = valid.filter((v) => v.optionIds.length > 0 || v.value !== null);
  await prisma.$transaction([
    prisma.answer.deleteMany({ where: { sessionId, questionId: { in: valid.map((v) => v.questionId) } } }),
    prisma.answer.createMany({ data: answered.map((v) => ({ sessionId, ...v })) }),
  ]);
  const totalAnswered = await prisma.answer.count({ where: { sessionId } });
  const progress = questionOrder.length ? Math.round((totalAnswered / questionOrder.length) * 100) : 0;
  await prisma.examSession.update({
    where: { id: sessionId },
    data: { progress, lastHeartbeatAt: new Date(), ...(flagged ? { flagged: flagged.filter((f) => allowed.has(f)).slice(0, 2000) } : {}) },
  });
  return { count: totalAnswered, progress };
}

export const sessionsRouter = Router();

sessionsRouter.post('/start', ...candidateOnly, handle(async (req) => {
  const a = auth(req);
  parse(z.object({ consent: z.literal(true, { errorMap: () => ({ message: 'You must accept the monitoring consent to start.' }) }) }), req.body);
  const cand = must(await prisma.candidate.findUnique({ where: { id: a.sub }, include: { exam: true } }), 'Candidate');
  const exam = cand.exam;
  if (exam.deletedAt) fail('NOT_FOUND', 'This exam is no longer available.');
  if (cand.status === 'SUBMITTED' || cand.status === 'DISQUALIFIED') fail('CONFLICT', 'You have already completed this exam.');

  const existing = await prisma.examSession.findFirst({ where: { candidateId: cand.id, status: { in: ['LIVE', 'WAITING'] } } });
  if (existing) {
    if (existing.deviceId && a.deviceId && existing.deviceId !== a.deviceId) fail('FORBIDDEN', 'This exam is in progress on another device.');
    return paper(existing.id);
  }

  const status = examStatus(exam);
  if (status === 'SCHEDULED' || status === 'DRAFT') fail('CONFLICT', `The exam has not started yet. It opens at ${exam.startsAt.toISOString()}.`);
  if (status === 'COMPLETED') fail('CONFLICT', 'The exam window has closed.');
  const extras = readExtras(exam.extras, exam.title);
  if (extras.lateEntryMin > 0 && Date.now() > exam.startsAt.getTime() + extras.lateEntryMin * 60_000) {
    fail('CONFLICT', `Late entry closed ${extras.lateEntryMin} minutes after the start.`);
  }

  const since = new Date(Date.now() - VERIFY_WINDOW_MS);
  const otp = await prisma.otpCode.findFirst({ where: { subjectId: cand.id, consumedAt: { gte: since } } });
  if (!otp) fail('FORBIDDEN', 'Verify the one-time code sent to your email before starting.');
  if (!cand.faceVerifiedAt || cand.faceVerifiedAt < since) fail('FORBIDDEN', 'Complete face verification before starting.');

  const settings = readSettings(exam.settings);
  const qs = await prisma.question.findMany({ where: { examId: exam.id }, orderBy: { position: 'asc' }, select: { id: true } });
  if (qs.length === 0) fail('CONFLICT', 'This exam has no questions yet.');
  const ids = qs.map((q) => q.id);
  const now = Date.now();
  const session = await prisma.examSession.create({
    data: {
      candidateId: cand.id, examId: exam.id, status: 'LIVE', deviceId: a.deviceId ?? null, consentAt: new Date(now),
      faceVerifiedAt: cand.faceVerifiedAt, faceScore: cand.faceScore, otpVerifiedAt: otp!.consumedAt,
      questionOrder: settings.shuffle ? shuffle(ids) : ids,
      deadlineAt: new Date(Math.min(now + exam.durationMin * 60_000, exam.endsAt.getTime())),
      lastHeartbeatAt: new Date(now),
    },
  });
  await prisma.riskPoint.create({ data: { sessionId: session.id, score: 0 } });
  await prisma.candidate.update({ where: { id: cand.id }, data: { status: 'IN_EXAM' } });
  realtime.toExam(exam.id, 'session:status', { session: toSession(session), candidateName: cand.name, userId: cand.userId, reason: 'STARTED' });
  return paper(session.id);
}));

sessionsRouter.get('/:id/paper', ...candidateOnly, handle(async (req) => {
  const s = await ownSession(req, String(req.params.id));
  return paper(s.id);
}));

sessionsRouter.get('/:id/questions', ...candidateOnly, handle(async (req) => {
  const s = await ownSession(req, String(req.params.id));
  return (await paper(s.id)).questions;
}));

sessionsRouter.put('/:id/answers', ...candidateOnly, handle(async (req) => {
  const s = await resumeIfPaused(await ownSession(req, String(req.params.id)));
  const body = parse(z.object({ answers: answersSchema, values: valuesSchema.optional(), flagged: z.array(z.string().max(64)).max(2000).optional() }), req.body);
  if (s.status !== 'LIVE' || Date.now() > s.deadlineAt.getTime() + GRACE_MS) fail('CONFLICT', 'This exam has ended. Answers can no longer be changed.', { status: s.status });
  const r = await saveAnswers(s.id, s.questionOrder, body.answers, body.flagged, body.values);
  realtime.toExam(s.examId, 'session:progress', { sessionId: s.id, progress: r.progress });
  return { savedAt: new Date().toISOString(), count: r.count, progress: r.progress, remainingSec: remainingSec(s.deadlineAt) };
}));

sessionsRouter.post('/:id/heartbeat', ...candidateOnly, handle(async (req) => {
  const s = await resumeIfPaused(await ownSession(req, String(req.params.id)));
  const body = parse(z.object({ currentQuestion: z.number().int().min(0).max(5000).optional(), online: z.boolean().optional() }), req.body ?? {});
  if (s.status === 'LIVE') await prisma.examSession.update({ where: { id: s.id }, data: { lastHeartbeatAt: new Date() } });
  if (body.currentQuestion !== undefined) realtime.toExam(s.examId, 'session:progress', { sessionId: s.id, progress: s.progress, currentQuestion: body.currentQuestion });
  return { status: s.status, remainingSec: remainingSec(s.deadlineAt), warnings: s.warnings, riskScore: s.riskScore, serverTime: new Date().toISOString() };
}));

sessionsRouter.post('/:id/submit', ...candidateOnly, handle(async (req) => {
  const s = await resumeIfPaused(await ownSession(req, String(req.params.id)));
  const body = parse(z.object({
    answers: answersSchema.optional(),
    values: valuesSchema.optional(),
    flagged: z.array(z.string().max(64)).max(2000).optional(),
    reason: z.enum(['MANUAL', 'TIME_UP']).default('MANUAL'),
  }), req.body ?? {});
  if (s.status === 'LIVE' && (body.answers || body.values) && Date.now() <= s.deadlineAt.getTime() + GRACE_MS) {
    await saveAnswers(s.id, s.questionOrder, body.answers ?? {}, body.flagged, body.values);
  }
  const done = await finalizeSession(s.id, s.status === 'LIVE' ? body.reason : (s.submitReason ?? body.reason));
  const answered = await prisma.answer.count({ where: { sessionId: s.id } });
  const cand = await prisma.candidate.findUniqueOrThrow({ where: { id: s.candidateId } });
  if (done.receiptId) {
    const release = readExtras(s.exam.extras, s.exam.title).releaseResults;
    void sendMail({ to: cand.email, ...templates.result(cand.name, s.exam.title, done.receiptId, release), kind: 'result', candidateId: cand.id })
      .then(() => notifyResultReady(s.id));
  }
  return {
    receiptId: done.receiptId, submittedAt: (done.submittedAt ?? new Date()).toISOString(), answered, total: s.questionOrder.length,
    reason: done.submitReason ?? body.reason, status: done.status,
  };
}));

sessionsRouter.get('/:id/state', authenticate, handle(async (req) => {
  const s = await ownSession(req, String(req.params.id));
  return { session: toSession(s), remainingSec: remainingSec(s.deadlineAt), submitReason: s.submitReason, receiptId: s.receiptId };
}));
