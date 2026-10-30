import { Router } from 'express';
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Severity, ViolationCode } from '@prisma/client';
import { ROOT_DIR } from '../config.js';
import { fail, handle, must } from '../lib/core.js';
import { prisma } from '../lib/db.js';
import { adminOnly, auth, candidateOnly, staff } from '../lib/auth.js';
import { SEVERITIES, VIOLATION_META, examInclude, examStatus, readExtras, toCandidate, toExam, toSession, toViolation } from '../lib/domain.js';
import { evidencePath, readFacePhoto, signEvidenceUrl, verifyEvidenceSignature, verifyPhotoSignature } from '../lib/evidence.js';
import { BLOCK_MESSAGE, loadResult } from '../lib/results.js';
import { desktopReleases } from '../lib/releases.js';
import { systemStatus } from '../lib/status.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const clock = (d: Date) => d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });

function buckets(now: number, count: number, size: number) {
  return Array.from({ length: count }, (_, i) => ({ from: now - (count - i) * size, to: now - (count - i - 1) * size }));
}
const countIn = (dates: Date[], from: number, to: number) => dates.filter((d) => d.getTime() >= from && d.getTime() < to).length;
const delta = (now: number, prev: number) => (prev === 0 ? (now > 0 ? 100 : 0) : Math.round(((now - prev) / prev) * 1000) / 10);

export const adminRouter = Router();

/* ---------------------------------------------------------------- dashboard */

adminRouter.get('/admin/dashboard', ...staff, handle(async () => {
  const now = Date.now();
  const [exams, candidates, sessions, violations] = await Promise.all([
    prisma.exam.findMany({ where: { deletedAt: null }, include: examInclude }),
    prisma.candidate.count({ where: { exam: { deletedAt: null } } }),
    prisma.examSession.findMany({ select: { status: true, riskScore: true, startedAt: true } }),
    prisma.violation.findMany({ select: { code: true, at: true, severity: true, reviewed: true }, where: { at: { gte: new Date(now - 7 * 24 * HOUR) } } }),
  ]);
  const live = sessions.filter((s) => s.status === 'LIVE');
  const unreviewed = await prisma.violation.count({ where: { reviewed: null, severity: { not: 'LOW' } } });
  const counts = new Map<ViolationCode, number>();
  violations.forEach((v) => counts.set(v.code, (counts.get(v.code) ?? 0) + 1));
  const alerts = await prisma.violation.findMany({
    where: { severity: { in: ['HIGH', 'CRITICAL'] } }, orderBy: { at: 'desc' }, take: 6,
    include: { session: { include: { candidate: { select: { name: true } } } } },
  });
  return {
    kpis: {
      totalExams: exams.length, liveExams: exams.filter((e) => examStatus(e) === 'LIVE').length, candidates,
      activeSessions: live.length, unreviewed, avgRisk: live.length ? Math.round(live.reduce((s, x) => s + x.riskScore, 0) / live.length) : 0,
    },
    trend: Array.from({ length: 7 }, (_, i) => {
      const day = new Date(now - (6 - i) * 24 * HOUR);
      const same = (d: Date) => d.toDateString() === day.toDateString();
      return { label: day.toLocaleDateString('en-IN', { weekday: 'short' }), violations: violations.filter((v) => same(v.at)).length, sessions: sessions.filter((s) => same(s.startedAt)).length };
    }),
    topCodes: [...counts].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count).slice(0, 6),
    recentExams: exams.sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime()).slice(0, 4).map(toExam),
    alerts: alerts.map((v) => ({ ...toViolation(v, signEvidenceUrl), candidateName: v.session.candidate.name })),
  };
}));

adminRouter.get('/admin/dashboard/summary', ...staff, handle(async () => {
  const now = Date.now();
  const hours = buckets(now, 14, HOUR);
  const since = new Date(now - 48 * HOUR);
  const [exams, sessions, violations] = await Promise.all([
    prisma.exam.findMany({ where: { deletedAt: null, status: { not: 'DRAFT' } }, select: { status: true, startsAt: true, endsAt: true } }),
    prisma.examSession.findMany({ where: { OR: [{ status: 'LIVE' }, { startedAt: { gte: since } }] }, select: { status: true, startedAt: true, submittedAt: true, riskScore: true } }),
    prisma.violation.findMany({ where: { at: { gte: since } }, select: { at: true, severity: true } }),
  ]);
  const liveAt = (t: number) => exams.filter((e) => e.startsAt.getTime() <= t && e.endsAt.getTime() > t).length;
  const onlineAt = (t: number) => sessions.filter((s) => s.startedAt.getTime() <= t && (!s.submittedAt || s.submittedAt.getTime() > t)).length;
  const vDates = violations.map((v) => v.at);
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const today = countIn(vDates, startOfDay.getTime(), now);
  const yesterday = countIn(vDates, startOfDay.getTime() - 24 * HOUR, now - 24 * HOUR);
  const live = sessions.filter((s) => s.status === 'LIVE');
  const avgRisk = live.length ? Math.round(live.reduce((s, x) => s + x.riskScore, 0) / live.length) : 0;
  const liveSeries = hours.map((b) => liveAt(b.to));
  const onlineSeries = hours.map((b) => onlineAt(b.to));
  return {
    liveExams: { value: liveAt(now), deltaPct: delta(liveAt(now), liveAt(now - HOUR)), series: liveSeries },
    candidatesOnline: { value: live.length, deltaPct: delta(live.length, onlineAt(now - HOUR)), series: onlineSeries },
    violationsToday: { value: today, deltaPct: delta(today, yesterday), series: hours.map((b) => countIn(vDates, b.from, b.to)) },
    avgRisk: { value: avgRisk, deltaPct: 0, series: hours.map(() => avgRisk) },
  };
}));

adminRouter.get('/admin/dashboard/live-series', ...staff, handle(async () => {
  const now = Date.now();
  const steps = buckets(now, 30, MIN);
  const [sessions, violations] = await Promise.all([
    prisma.examSession.findMany({ where: { OR: [{ status: 'LIVE' }, { submittedAt: { gte: new Date(now - 30 * MIN) } }] }, select: { startedAt: true, submittedAt: true } }),
    prisma.violation.findMany({ where: { at: { gte: new Date(now - 30 * MIN) } }, select: { at: true } }),
  ]);
  return steps.map((b) => ({
    ts: b.to, label: clock(new Date(b.to)),
    online: sessions.filter((s) => s.startedAt.getTime() <= b.to && (!s.submittedAt || s.submittedAt.getTime() > b.to)).length,
    violations: countIn(violations.map((v) => v.at), b.from, b.to),
  }));
}));

adminRouter.get('/admin/dashboard/violations-by-type', ...staff, handle(async () => {
  const rows = await prisma.violation.groupBy({ by: ['code'], _count: true });
  return rows.map((r) => ({ code: r.code, label: VIOLATION_META[r.code].label, severity: VIOLATION_META[r.code].severity, count: r._count })).sort((a, b) => b.count - a.count);
}));

adminRouter.get('/admin/activity', ...staff, handle(async (req) => {
  const limit = Math.min(50, Number(req.query.limit) || 14);
  const [violations, sessions, warnings, emails, publishes] = await Promise.all([
    prisma.violation.findMany({ orderBy: { at: 'desc' }, take: limit, include: { session: { include: { candidate: { select: { name: true } }, exam: { select: { code: true } } } } } }),
    prisma.examSession.findMany({ orderBy: { startedAt: 'desc' }, take: limit, include: { candidate: { select: { name: true } }, exam: { select: { code: true } } } }),
    prisma.warningMessage.findMany({ orderBy: { at: 'desc' }, take: limit, include: { session: { include: { candidate: { select: { name: true } }, exam: { select: { code: true } } } } } }),
    prisma.emailLog.findMany({ where: { kind: 'credentials', status: 'SENT' }, orderBy: { at: 'desc' }, take: limit, include: { candidate: { include: { exam: { select: { code: true } } } } } }),
    prisma.auditLog.findMany({ where: { action: 'exam.publish' }, orderBy: { at: 'desc' }, take: 5 }),
  ]);
  const items = [
    ...violations.map((v) => ({ id: `v_${v.id}`, kind: 'VIOLATION' as const, at: v.at.toISOString(), examCode: v.session.exam.code, candidateName: v.session.candidate.name, code: v.code, severity: v.severity, text: VIOLATION_META[v.code].label })),
    ...sessions.flatMap((s) => [
      { id: `ss_${s.id}`, kind: 'SESSION_STARTED' as const, at: s.startedAt.toISOString(), examCode: s.exam.code, candidateName: s.candidate.name, text: 'passed the system check and started the exam' },
      ...(s.submittedAt ? [{
        id: `sd_${s.id}`, kind: s.status === 'TERMINATED' ? ('TERMINATED' as const) : ('SESSION_SUBMITTED' as const), at: s.submittedAt.toISOString(), examCode: s.exam.code, candidateName: s.candidate.name,
        text: s.status === 'TERMINATED' ? (s.submitReason === 'TERMINATED_BY_MENTOR' ? 'was terminated by a proctor' : 'was auto-submitted after repeated violations') : 'submitted the exam',
      }] : []),
    ]),
    ...warnings.map((w) => ({ id: `w_${w.id}`, kind: 'WARNING_SENT' as const, at: w.at.toISOString(), examCode: w.session.exam.code, candidateName: w.session.candidate.name, text: 'received a warning from the proctor' })),
    ...emails.map((e) => ({ id: `e_${e.id}`, kind: 'EMAIL_SENT' as const, at: e.at.toISOString(), examCode: e.candidate?.exam.code ?? '', text: `Credentials emailed to ${e.to}` })),
    ...publishes.map((p) => ({ id: `p_${p.id}`, kind: 'EXAM_PUBLISHED' as const, at: p.at.toISOString(), examCode: p.target ?? '', text: 'Exam published and scheduled by the organization' })),
  ];
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}));

adminRouter.get('/admin/notifications', ...staff, handle(async () => {
  const rows = await prisma.notification.findMany({ orderBy: { at: 'desc' }, take: 30 });
  return rows.map((n) => ({ id: n.id, title: n.title, body: n.body, at: n.at.toISOString(), tone: n.tone, read: n.read, ...(n.href ? { href: n.href } : {}) }));
}));

adminRouter.post('/admin/notifications/read-all', ...staff, handle(async () => {
  const r = await prisma.notification.updateMany({ where: { read: false }, data: { read: true } });
  return { updated: r.count };
}));

adminRouter.get('/admin/audit', ...adminOnly, handle(async () => {
  const rows = await prisma.auditLog.findMany({ orderBy: { at: 'desc' }, take: 100, include: { actor: { select: { name: true } } } });
  return rows.map((r) => ({ id: r.id, at: r.at.toISOString(), action: r.action, target: r.target, actor: r.actor?.name ?? r.actorRole ?? 'system', ip: r.ip }));
}));

/* ---------------------------------------------------------------- results */

adminRouter.get('/exams/:id/results', ...staff, handle(async (req) => {
  const exam = must(await prisma.exam.findFirst({ where: { id: String(req.params.id), deletedAt: null }, include: examInclude }), 'Exam');
  const total = toExam(exam).totalMarks;
  const sessions = await prisma.examSession.findMany({
    where: { examId: exam.id, status: { in: ['SUBMITTED', 'TERMINATED'] } },
    include: { candidate: true, _count: { select: { violations: { where: { OR: [{ reviewed: null }, { reviewed: 'CONFIRMED' }] } } } } },
    orderBy: { score: 'desc' },
  });
  return sessions.map((s, i) => ({
    candidateId: s.candidateId, name: s.candidate.name, userId: s.candidate.userId, score: s.score ?? 0, totalMarks: total,
    percentage: total ? Math.round(((s.score ?? 0) / total) * 100) : 0, rank: i + 1, violations: s._count.violations,
    status: s.candidate.status, sessionStatus: s.status, sessionId: s.id,
  }));
}));

adminRouter.get('/reports/violations', ...staff, handle(async (req) => {
  const examId = typeof req.query.examId === 'string' ? req.query.examId : undefined;
  const where = examId ? { session: { examId } } : {};
  const [byCode, bySev, reviewed] = await Promise.all([
    prisma.violation.groupBy({ by: ['code'], where, _count: true }),
    prisma.violation.groupBy({ by: ['severity'], where, _count: true }),
    prisma.violation.groupBy({ by: ['reviewed'], where, _count: true }),
  ]);
  return {
    byCode: byCode.map((r) => ({ code: r.code, label: VIOLATION_META[r.code].label, count: r._count })).sort((a, b) => b.count - a.count),
    bySeverity: SEVERITIES.map((severity: Severity) => ({ severity, count: bySev.find((r) => r.severity === severity)?._count ?? 0 })),
    reviewed: {
      confirmed: reviewed.find((r) => r.reviewed === 'CONFIRMED')?._count ?? 0,
      overruled: reviewed.find((r) => r.reviewed === 'OVERRULED')?._count ?? 0,
      pending: reviewed.find((r) => r.reviewed === null)?._count ?? 0,
    },
  };
}));

/** Data for the exam reports page: one row per finished session plus each violation as an hour-stamped event. */
adminRouter.get('/reports/exams/:id/summary', ...staff, handle(async (req) => {
  const exam = must(await prisma.exam.findFirst({ where: { id: String(req.params.id), deletedAt: null }, include: examInclude }), 'Exam');
  const view = toExam(exam);
  const sessions = await prisma.examSession.findMany({ where: { examId: exam.id }, include: { candidate: true, violations: { select: { code: true, at: true, reviewed: true } } } });
  const finished = sessions.filter((s) => s.status === 'SUBMITTED' || s.status === 'TERMINATED');
  const pct = (score: number | null) => (view.totalMarks ? Math.round(((score ?? 0) / view.totalMarks) * 100) : 0);
  return {
    examName: `${exam.title} (${exam.code})`,
    maxScore: 100,
    passMark: 40,
    rows: finished.map((s) => ({
      id: s.candidateId, sessionId: s.id, name: s.candidate.name, userId: s.candidate.userId, score: pct(s.score),
      durationMin: Math.round(((s.submittedAt ?? new Date()).getTime() - s.startedAt.getTime()) / MIN),
      violations: s.violations.filter((v) => v.reviewed !== 'OVERRULED').length, risk: s.riskScore,
    })),
    events: finished.flatMap((s) => s.violations.map((v) => ({
      candidateId: s.candidateId, type: VIOLATION_META[v.code].label,
      hour: Number(v.at.toLocaleString('en-IN', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })) % 24,
    }))),
  };
}));

/* ---------------------------------------------------------------- public, lobby, downloads, evidence */

/** Public: whether the database and the AI agent are answering right now (shown in the site footer and admin sidebar). */
adminRouter.get('/system/status', handle(() => systemStatus()));

adminRouter.get('/public/stats', handle(async () => {
  const [exams, candidates, violations] = await Promise.all([prisma.exam.count(), prisma.candidate.count(), prisma.violation.count()]);
  return { examsConducted: exams, candidatesProctored: candidates, violationsCaught: violations, uptimePct: 99.9 };
}));

/** Download test for the desktop system check. Size is capped so it cannot be used to exhaust bandwidth. */
const SPEED_CHUNK = Buffer.alloc(64 * 1024, 0x5a);
adminRouter.get('/net/speed', (req, res) => {
  const bytes = Math.min(4_000_000, Math.max(64 * 1024, Number(req.query.bytes) || 1_000_000));
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Length', String(bytes));
  let sent = 0;
  const pump = () => {
    while (sent < bytes) {
      const n = Math.min(SPEED_CHUNK.length, bytes - sent);
      sent += n;
      if (!res.write(n === SPEED_CHUNK.length ? SPEED_CHUNK : SPEED_CHUNK.subarray(0, n))) return void res.once('drain', pump);
    }
    res.end();
  };
  pump();
});

/** A locally built installer (npm run build -w apps/desktop) wins; otherwise the newest one on GitHub Releases. */
function localInstaller(): string | undefined {
  const dir = join(ROOT_DIR, 'apps', 'desktop', 'release');
  return existsSync(dir) ? readdirSync(dir).find((f) => f.endsWith('.exe')) : undefined;
}

adminRouter.get('/downloads/latest', handle(async () => {
  const dir = join(ROOT_DIR, 'apps', 'desktop', 'release');
  const exe = localInstaller();
  const { stable, beta } = exe ? { stable: null, beta: null } : await desktopReleases();
  const size = exe ? Math.round((statSync(join(dir, exe)).size / 1_048_576) * 10) / 10 : stable?.sizeMb ?? 0;
  const version = exe?.match(/(\d+\.\d+\.\d+(?:-[a-z]+(?:\.\d+)?)?)/)?.[1] ?? stable?.version ?? '0.1.0';
  return {
    version,
    releasedAt: exe ? statSync(join(dir, exe)).mtime.toISOString() : stable?.releasedAt ?? new Date().toISOString(),
    // A newer test build for testers, when one is published as a GitHub pre-release.
    beta: beta ? { version: beta.version, file: beta.file, sizeMb: beta.sizeMb, url: beta.url, releasedAt: beta.releasedAt } : null,
    builds: [
      { os: 'windows', label: 'Windows 10 / 11 (64-bit)', file: exe ?? stable?.file ?? 'Where-U-Elevate-Setup.exe', sizeMb: size, url: exe ? '/api/v1/downloads/windows' : stable?.url ?? '/api/v1/downloads/windows', available: Boolean(exe ?? stable) },
      { os: 'macos', label: 'macOS 12+ (Apple silicon & Intel)', file: `Where-U-Elevate-${version}.dmg`, sizeMb: 0, url: '', available: false },
      { os: 'linux', label: 'Ubuntu 22.04+ (AppImage)', file: `Where-U-Elevate-${version}.AppImage`, sizeMb: 0, url: '', available: false },
    ],
    requirements: ['Webcam and microphone', '4 GB RAM, dual-core CPU', '2 Mbps stable internet', 'One display, no virtual machine'],
  };
}));

adminRouter.get('/downloads/windows', (req, res, next) => {
  const exe = localInstaller();
  if (exe) return res.download(join(ROOT_DIR, 'apps', 'desktop', 'release', exe), exe);
  void desktopReleases().then(({ stable, beta }) => {
    const build = req.query.channel === 'beta' ? beta ?? stable : stable;
    if (!build) return next(fail('NOT_FOUND', 'The Windows installer has not been built yet. Run npm run build -w apps/desktop, or publish a release.'));
    res.redirect(302, build.url);
  }, next);
});

adminRouter.get('/candidate/lobby', ...candidateOnly, handle(async (req) => {
  const c = must(await prisma.candidate.findUnique({ where: { id: auth(req).sub }, include: { exam: { include: examInclude } } }), 'Candidate');
  const session = await prisma.examSession.findFirst({ where: { candidateId: c.id }, orderBy: { startedAt: 'desc' } });
  const exam = toExam(c.exam);
  const extras = readExtras(c.exam.extras, c.exam.title);
  // The score is only loaded, and only sent, once the exam's release rule allows it.
  const released = session?.submittedAt ? await loadResult(c.id) : null;
  return {
    candidate: toCandidate(c), exam, ...(session ? { session: toSession(session) } : {}),
    msToStart: Math.max(0, c.exam.startsAt.getTime() - Date.now()),
    canEnter: exam.status === 'LIVE' && c.status !== 'SUBMITTED' && c.status !== 'DISQUALIFIED',
    instructions: extras.instructions,
    lateEntryMin: extras.lateEntryMin,
    faceRegistered: Boolean(c.photoPath),
    ...(session?.submittedAt ? {
      result: {
        receiptId: session.receiptId, submittedAt: session.submittedAt.toISOString(), reason: session.submitReason,
        ...(released ? { release: released.state } : {}),
        ...(released?.state.blockedBy ? { message: BLOCK_MESSAGE[released.state.blockedBy] } : {}),
        ...(released?.summary ? { summary: released.summary } : {}),
      },
    } : {}),
  };
}));

adminRouter.get('/candidate/results', ...candidateOnly, handle(async (req) => {
  const r = await loadResult(auth(req).sub, { review: true });
  if (!r) return fail('NOT_FOUND', BLOCK_MESSAGE.NOT_SUBMITTED);
  if (r.state.blockedBy) return fail('FORBIDDEN', BLOCK_MESSAGE[r.state.blockedBy], { blockedBy: r.state.blockedBy });
  if (!r.state.reviewReleased || !r.review) {
    const at = r.state.reviewOpensAt ? new Date(r.state.reviewOpensAt).toUTCString() : 'the end of the exam';
    return fail('FORBIDDEN', `The answer review opens when the exam window closes (${at}).`, { reviewOpensAt: r.state.reviewOpensAt });
  }
  return {
    exam: { id: r.cand.exam.id, title: r.cand.exam.title, code: r.cand.exam.code },
    receiptId: r.session.receiptId, summary: r.summary, questions: r.review, release: r.state,
  };
}));

adminRouter.get('/photos/:candidateId', async (req, res, next) => {
  try {
    const id = String(req.params.candidateId);
    if (!verifyPhotoSignature(id, String(req.query.exp ?? ''), String(req.query.sig ?? ''))) return next(fail('FORBIDDEN', 'This photo link has expired.'));
    const c = await prisma.candidate.findUnique({ where: { id }, select: { photoPath: true } });
    const photo = await readFacePhoto(id, c?.photoPath ?? null);
    if (!photo) return next(fail('NOT_FOUND', 'Photo not found.'));
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=900');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(photo);
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/evidence/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    if (!verifyEvidenceSignature(id, String(req.query.exp ?? ''), String(req.query.sig ?? ''))) return next(fail('FORBIDDEN', 'This evidence link has expired.'));
    const e = await prisma.evidence.findUnique({ where: { id } });
    if (!e || (!e.data && !existsSync(evidencePath(e.path)))) return next(fail('NOT_FOUND', 'Evidence not found.'));
    res.setHeader('Content-Type', e.mime);
    res.setHeader('Cache-Control', 'private, max-age=900');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Seeded frames are SVGs that embed the portrait as a data: image.
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src data:; style-src 'unsafe-inline'");
    if (e.data) res.end(Buffer.from(e.data));
    else createReadStream(evidencePath(e.path)).pipe(res);
  } catch (err) {
    next(err);
  }
});
