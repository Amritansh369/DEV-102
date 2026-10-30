import type { CandidateStatus, Question, SessionStatus } from '@prisma/client';
import { config } from '../config.js';
import { logger } from './core.js';
import { prisma } from './db.js';
import { gradeAnswer, readExtras, readNumericKey, readOptions, readSettings, scoreAnswers, type ExamExtras } from './domain.js';
import { sendMail, templates } from './mailer.js';

/** Why a result is not shown yet. Null once the score is released. */
export type ResultBlock = 'NOT_SUBMITTED' | 'DISQUALIFIED' | 'RETEST' | 'PENDING_REVIEW' | 'PENDING_MANUAL';
export type DecisionOutcome = 'CLEAR' | 'WARN' | 'RETEST' | 'DISQUALIFY';

export interface ReleaseInput {
  release: ExamExtras['releaseResults'];
  manualReleasedAt: string | null;
  examEndsAt: Date;
  sessionStatus: SessionStatus;
  candidateStatus: CandidateStatus;
  decision: DecisionOutcome | null;
  /** Flags above LOW in this session that no mentor has confirmed or overruled. */
  pendingFlags: number;
  now: Date;
}

/** What the candidate is told while a result is held back. */
export const BLOCK_MESSAGE: Record<ResultBlock, string> = {
  NOT_SUBMITTED: 'Results appear after you submit the exam.',
  DISQUALIFIED: 'This attempt was disqualified, so no result is available. Contact your exam organiser if you believe this is a mistake.',
  RETEST: 'A retest has been arranged. Your exam organiser will contact you with the details.',
  PENDING_REVIEW: 'Your results will be released after the recorded events are reviewed.',
  PENDING_MANUAL: 'Your results will be released when your exam organiser publishes them.',
};

export interface ReleaseState {
  scoreReleased: boolean;
  /** The per-question review: never before the exam window closes, so answers cannot reach anyone still sitting it. */
  reviewReleased: boolean;
  blockedBy: ResultBlock | null;
  reviewOpensAt: string | null;
}

export function resultRelease(i: ReleaseInput): ReleaseState {
  const blocked = (blockedBy: ResultBlock): ReleaseState => ({ scoreReleased: false, reviewReleased: false, blockedBy, reviewOpensAt: null });
  if (i.sessionStatus !== 'SUBMITTED' && i.sessionStatus !== 'TERMINATED') return blocked('NOT_SUBMITTED');
  if (i.sessionStatus === 'TERMINATED' || i.candidateStatus === 'DISQUALIFIED' || i.decision === 'DISQUALIFY') return blocked('DISQUALIFIED');
  if (i.decision === 'RETEST') return blocked('RETEST');
  if (i.release === 'AFTER_REVIEW' && i.pendingFlags > 0 && i.decision !== 'CLEAR' && i.decision !== 'WARN') return blocked('PENDING_REVIEW');
  if (i.release === 'MANUAL' && !i.manualReleasedAt) return blocked('PENDING_MANUAL');
  const windowClosed = i.now.getTime() >= i.examEndsAt.getTime();
  return { scoreReleased: true, reviewReleased: windowClosed, blockedBy: null, reviewOpensAt: windowClosed ? null : i.examEndsAt.toISOString() };
}

export type ReviewQuestion = Pick<Question, 'id' | 'text' | 'options' | 'correctIds' | 'marks'> & Partial<Pick<Question, 'type' | 'answerKey'>>;
export interface Negative { enabled: boolean; value: number }

export interface ResultSummary {
  score: number;
  totalMarks: number;
  percent: number;
  /** Marks taken off for confirmed violations; `score` and `percent` already include it. */
  penaltyMarks: number;
  correct: number;
  wrong: number;
  unanswered: number;
  negativeMarking: Negative;
}

export interface ReviewItem {
  position: number;
  questionId: string;
  text: string;
  options: { id: string; text: string; picked: boolean; correct: boolean }[];
  /** Numeric questions only: what was typed and what was accepted. */
  numeric?: { given: number | null; value: number; tolerance: number; unit: string | null };
  marks: number;
  earned: number;
  status: 'CORRECT' | 'WRONG' | 'UNANSWERED';
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Questions in the order this candidate saw them; questions removed after the exam are skipped. */
function inOrder(order: string[], questions: ReviewQuestion[]): ReviewQuestion[] {
  const byId = new Map(questions.map((q) => [q.id, q]));
  return order.map((id) => byId.get(id)).filter((q): q is ReviewQuestion => Boolean(q));
}

export function summarize(order: string[], questions: ReviewQuestion[], answers: Map<string, string[]>, negative: Negative, values: Map<string, number> = new Map(), penaltyMarks = 0): ResultSummary {
  const qs = inOrder(order, questions);
  const r = scoreAnswers(qs, answers, negative, values);
  const totalMarks = qs.reduce((s, q) => s + q.marks, 0);
  const score = Math.max(0, round2(r.score - penaltyMarks));
  return { ...r, score, totalMarks, percent: totalMarks ? round2((score / totalMarks) * 100) : 0, penaltyMarks, negativeMarking: negative };
}

export function buildReview(order: string[], questions: ReviewQuestion[], answers: Map<string, string[]>, negative: Negative, values: Map<string, number> = new Map()): ReviewItem[] {
  return inOrder(order, questions).map((q, i) => {
    const picked = answers.get(q.id) ?? [];
    const status = gradeAnswer(q, picked, values.get(q.id));
    const key = q.type === 'NUMERIC' ? readNumericKey(q.answerKey) : null;
    const earned = status === 'CORRECT' ? q.marks : status === 'WRONG' && negative.enabled ? round2(-q.marks * negative.value) : 0;
    const options = readOptions(q.options).map((o) => ({
      id: o.id, text: o.text, picked: picked.includes(o.id), correct: q.correctIds.includes(o.id),
    }));
    return {
      position: i + 1, questionId: q.id, text: q.text, options, marks: q.marks, earned, status,
      ...(key ? { numeric: { given: values.get(q.id) ?? null, value: key.value, tolerance: key.tolerance, unit: key.unit } } : {}),
    };
  });
}

/* ---------------------------------------------------------------- database */

/** Loads the candidate's latest session and works out what may be shown. Null when they never started. */
export async function loadResult(candidateId: string, opts: { review?: boolean } = {}) {
  const cand = await prisma.candidate.findUniqueOrThrow({ where: { id: candidateId }, include: { exam: true } });
  const session = await prisma.examSession.findFirst({ where: { candidateId }, orderBy: { startedAt: 'desc' }, include: { answers: true } });
  if (!session) return null;
  const extras = readExtras(cand.exam.extras, cand.exam.title);
  // Flags can cost marks, so anything above LOW waits for a proctor before an "after review" result is released.
  const pendingFlags = await prisma.violation.count({ where: { sessionId: session.id, outcome: { not: 'SUPPRESSED' }, severity: { not: 'LOW' }, reviewed: null } });
  const decision = (session.decision as { outcome?: DecisionOutcome } | null)?.outcome ?? null;
  const state = resultRelease({
    release: extras.releaseResults, manualReleasedAt: extras.resultsReleasedAt ?? null, examEndsAt: cand.exam.endsAt,
    sessionStatus: session.status, candidateStatus: cand.status, decision, pendingFlags, now: new Date(),
  });
  if (!state.scoreReleased) return { cand, session, state, summary: undefined, review: undefined };
  const questions = await prisma.question.findMany({
    where: { examId: cand.exam.id },
    select: { id: true, text: true, options: true, correctIds: true, marks: true, type: true, answerKey: true },
  });
  const answers = new Map(session.answers.map((a) => [a.questionId, a.optionIds]));
  const values = new Map(session.answers.flatMap((a) => (a.value === null ? [] : [[a.questionId, a.value] as const])));
  const negative = { enabled: readSettings(cand.exam.settings).negativeMarking, value: extras.negativeValue };
  return {
    cand, session, state,
    summary: summarize(session.questionOrder, questions, answers, negative, values, session.penaltyMarks),
    review: opts.review && state.reviewReleased ? buildReview(session.questionOrder, questions, answers, negative, values) : undefined,
  };
}

/** Emails "your results are ready" once per candidate, as soon as the score is released. Never throws. */
export async function notifyResultReady(sessionId: string): Promise<void> {
  try {
    const s = await prisma.examSession.findUnique({ where: { id: sessionId }, select: { candidateId: true } });
    if (!s) return;
    const r = await loadResult(s.candidateId);
    if (!r?.state.scoreReleased) return;
    const already = await prisma.emailLog.findFirst({ where: { candidateId: r.cand.id, kind: 'result-ready', status: 'SENT' }, select: { id: true } });
    if (already) return;
    const lobbyUrl = `${config.clientOrigins[0] ?? 'http://localhost:3000'}/lobby`;
    await sendMail({ to: r.cand.email, ...templates.resultReady(r.cand.name, r.cand.exam.title, lobbyUrl), kind: 'result-ready', candidateId: r.cand.id });
  } catch (err) {
    logger.warn({ err, sessionId }, 'result-ready email failed');
  }
}
