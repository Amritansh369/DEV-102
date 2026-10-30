import { Router } from 'express';
import { z } from 'zod';
import { fail, handle, parse } from '../lib/core.js';
import { prisma } from '../lib/db.js';
import { candidateOnly } from '../lib/auth.js';
import { VIOLATION_CODES, hostAllowed, isAiUrl, readSettings, toBrowsing } from '../lib/domain.js';
import { decodeImage, readFacePhoto, saveEvidence } from '../lib/evidence.js';
import { agent } from '../lib/agent.js';
import { inCooldown, recordViolation, type RecordResult } from '../lib/policy.js';
import { realtime } from '../lib/realtime.js';
import { limits } from '../lib/security.js';
import { ownSession } from './sessions.js';

const code = z.enum(VIOLATION_CODES as [string, ...string[]]).transform((c) => c as (typeof VIOLATION_CODES)[number]);
const eventSchema = z.object({
  code, message: z.string().max(500).optional(), at: z.string().datetime({ offset: true }).optional(), confidence: z.number().min(0).max(1).optional(),
  source: z.enum(['client', 'native']).default('client'),
  /** A picture of the screen taken with the event (e.g. while away from the exam window), kept as its evidence. */
  screenshot: z.string().min(100).max(4_000_000).optional(),
});

/** Sessions that already sent the reference photo to the agent (the agent caches the embedding). */
const faceRegistered = new Set<string>();
/** The newest webcam frame of each live session: proof for events that come without a picture. */
const latestFrame = new Map<string, { image: { buffer: Buffer; mime: string }; at: number }>();
const FRAME_FRESH_MS = 30_000;

async function liveSession(req: Parameters<typeof ownSession>[0], id: string) {
  const s = await ownSession(req, id);
  if (s.status !== 'LIVE') fail('CONFLICT', 'Monitoring only runs during an active exam session.', { status: s.status });
  return s;
}

export const proctoringRouter = Router();

/** Single event, or a batch replayed by the offline queue (processed in timestamp order). */
proctoringRouter.post('/events', ...candidateOnly, limits.ingest, handle(async (req) => {
  const body = parse(z.object({ sessionId: z.string().max(64), events: z.array(eventSchema).max(200).optional() }).merge(eventSchema.partial()), req.body);
  const s = await liveSession(req, body.sessionId);
  const events = body.events ?? (body.code ? [eventSchema.parse(body)] : []);
  if (events.length === 0) fail('VALIDATION', 'No events to record.');
  events.sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''));
  const results: RecordResult[] = [];
  for (const e of events) {
    const at = e.at ? new Date(Math.min(Date.parse(e.at), Date.now())) : undefined;
    const evidenceId = await eventProof(s, e.code, e.screenshot, at);
    const r = await recordViolation({ sessionId: s.id, code: e.code, ...(e.message ? { message: e.message } : {}), source: e.source, ...(e.confidence !== undefined ? { confidence: e.confidence } : {}), ...(at ? { at } : {}), ...(evidenceId ? { evidenceId } : {}) });
    results.push(r);
    if (r.status !== 'LIVE') break;
  }
  const last = results[results.length - 1];
  if (last && last.status !== 'LIVE') latestFrame.delete(s.id);
  return body.events ? { results, last } : last;
}));

/** The picture kept with an event: its screenshot, else the webcam at that moment. Repeats inside the cooldown keep none. */
async function eventProof(s: Parameters<typeof inCooldown>[0], code: (typeof VIOLATION_CODES)[number], screenshot: string | undefined, at: Date | undefined): Promise<string | undefined> {
  if (await inCooldown(s, code, at)) return undefined;
  const shot = screenshot ? decodeImage(screenshot) : null;
  if (shot) return saveEvidence(s.id, 'screen', shot);
  const frame = latestFrame.get(s.id);
  return frame && Math.abs((at?.getTime() ?? Date.now()) - frame.at) < FRAME_FRESH_MS ? saveEvidence(s.id, 'webcam', frame.image) : undefined;
}

/** `capturedAt` marks a frame the desktop kept while offline: it is analysed and recorded at that time, not shown as live. */
async function analyzeImage(kind: 'webcam' | 'screen', sessionId: string, examId: string, candidateId: string, image: string, capturedAt?: Date) {
  const img = decodeImage(image) ?? fail('VALIDATION', 'The image could not be read.');
  const b64 = img.buffer.toString('base64');
  if (!capturedAt) {
    if (kind === 'webcam') latestFrame.set(sessionId, { image: img, at: Date.now() });
    if (kind === 'webcam') realtime.snapshot(examId, sessionId, `data:${img.mime};base64,${b64}`);
    else realtime.toExam(examId, 'screen:snapshot', { sessionId, image: `data:${img.mime};base64,${b64}`, at: new Date().toISOString() });
  }

  let registered: string | undefined;
  if (kind === 'webcam' && !faceRegistered.has(sessionId)) {
    const c = await prisma.candidate.findUnique({ where: { id: candidateId }, select: { photoPath: true } });
    registered = (await readFacePhoto(candidateId, c?.photoPath ?? null))?.toString('base64');
  }
  const result = kind === 'webcam' ? await agent.analyzeFrame(sessionId, b64, registered) : await agent.analyzeScreen(sessionId, b64);
  if (registered && !result.degraded) faceRegistered.add(sessionId);

  const recorded: RecordResult[] = [];
  let evidenceId: string | undefined;
  for (const v of result.violations) {
    if (!VIOLATION_CODES.includes(v.code)) continue;
    // One stored image per frame, linked to the first violation it proves (the unique key allows one link).
    const link = evidenceId ? undefined : (evidenceId = await saveEvidence(sessionId, kind, img));
    const message = capturedAt ? `${v.message} (captured while offline)` : v.message;
    const r = await recordViolation({ sessionId, code: v.code, severity: v.severity, message, source: 'agent', confidence: v.confidence, ...(link ? { evidenceId: link } : {}), ...(capturedAt ? { at: capturedAt } : {}) });
    recorded.push(r);
    if (r.status !== 'LIVE') break;
  }
  return { violations: result.violations, metrics: result.metrics, degraded: Boolean(result.degraded), recorded };
}

const frameSchema = z.object({ sessionId: z.string().max(64), image: z.string().min(100).max(4_000_000), capturedAt: z.string().datetime({ offset: true }).optional() });

/** A capture time inside the session, or undefined for a live frame. */
const captureTime = (capturedAt: string | undefined, startedAt: Date) =>
  capturedAt ? new Date(Math.min(Math.max(Date.parse(capturedAt), startedAt.getTime()), Date.now())) : undefined;

proctoringRouter.post('/frames', ...candidateOnly, limits.frames, handle(async (req) => {
  const body = parse(frameSchema, req.body);
  const s = await liveSession(req, body.sessionId);
  return analyzeImage('webcam', s.id, s.examId, s.candidateId, body.image, captureTime(body.capturedAt, s.startedAt));
}));

proctoringRouter.post('/screen', ...candidateOnly, limits.frames, handle(async (req) => {
  const body = parse(frameSchema, req.body);
  const s = await liveSession(req, body.sessionId);
  return analyzeImage('screen', s.id, s.examId, s.candidateId, body.image, captureTime(body.capturedAt, s.startedAt));
}));

const entrySchema = z.object({
  url: z.string().url().max(2000), title: z.string().max(300).default(''), query: z.string().max(2000).optional(), at: z.string().datetime({ offset: true }).optional(),
  /** What the AI assistant answered to `query`. Such an entry only adds the answer to the log: its visit and query were already flagged. */
  reply: z.string().max(8000).optional(),
  /** A picture of the AI tab taken by the desktop app, kept as evidence for this entry. */
  screenshot: z.string().min(100).max(4_000_000).optional(),
});

proctoringRouter.post('/browsing-logs', ...candidateOnly, limits.ingest, handle(async (req) => {
  const body = parse(z.object({ sessionId: z.string().max(64), entries: z.array(entrySchema).min(1).max(100) }), req.body);
  const s = await liveSession(req, body.sessionId);
  const allowed = readSettings(s.exam.settings).allowedSites;
  const items = body.entries.filter((e) => /^https?:/i.test(e.url));
  const rows = items.map((e) => ({
    sessionId: s.id, url: e.url, title: e.title.slice(0, 300), query: e.query?.slice(0, 2000) || null, reply: e.reply || null,
    at: e.at ? new Date(Math.min(Date.parse(e.at), Date.now())) : new Date(), flaggedAi: isAiUrl(e.url),
  }));
  const created = await prisma.$transaction(rows.map((data) => prisma.browsingLog.create({ data })));
  realtime.toExam(s.examId, 'browsing:new', { sessionId: s.id, entries: created.map(toBrowsing) });

  const results: RecordResult[] = [];
  for (const [i, r] of created.entries()) {
    if (!r.flaggedAi || r.reply) continue;
    const host = new URL(r.url).hostname;
    // The screenshot proves the typed query when there is one, else the visit.
    const shot = items[i]?.screenshot ? decodeImage(items[i].screenshot) : null;
    const evidenceId = shot && !(await inCooldown(s, r.query ? 'AI_QUERY_DETECTED' : 'AI_SITE_OPENED', r.at)) ? await saveEvidence(s.id, 'screen', shot) : undefined;
    const proof = (forQuery: boolean) => (evidenceId && forQuery === Boolean(r.query) ? { evidenceId } : {});
    results.push(await recordViolation({ sessionId: s.id, code: 'AI_SITE_OPENED', source: 'server', at: r.at, message: `Opened ${host} (${r.title || 'AI assistant'}).`, ...proof(false) }));
    if (r.query) {
      results.push(await recordViolation({ sessionId: s.id, code: 'AI_QUERY_DETECTED', source: 'server', at: r.at, message: `Typed into ${host}: "${r.query.slice(0, 160)}"`, ...proof(true) }));
    }
  }
  // The agent catches pasted exam questions typed into ordinary search engines too.
  const queries = created.filter((r) => r.query && !r.flaggedAi && !r.reply);
  if (queries.length) {
    const qs = await prisma.question.findMany({ where: { id: { in: s.questionOrder } }, select: { text: true } });
    const verdict = await agent.analyzeBrowsing(s.id, queries.map((q) => ({ url: q.url, title: q.title, query: q.query ?? '', at: q.at.toISOString() })), qs.map((q) => q.text));
    for (const v of verdict.violations) results.push(await recordViolation({ sessionId: s.id, code: v.code, severity: v.severity, message: v.message, source: 'agent', confidence: v.confidence }));
  }
  return { stored: created.length, flagged: created.filter((r) => r.flaggedAi).length, blocked: created.filter((r) => !r.flaggedAi && allowed.length > 0 && !hostAllowed(r.url, allowed)).length, results };
}));

const activitySchema = z.object({
  kind: z.enum(['keys', 'mouse', 'focus', 'nav']),
  at: z.string().datetime({ offset: true }).optional(),
  // Summaries only (counts, intervals, distances): never raw key values.
  data: z.record(z.string().max(40), z.union([z.number(), z.string().max(200), z.boolean(), z.array(z.number()).max(200)])).refine((d) => Object.keys(d).length <= 40, 'Too many fields'),
});

proctoringRouter.post('/activity', ...candidateOnly, limits.ingest, handle(async (req) => {
  const body = parse(z.object({ sessionId: z.string().max(64), batches: z.array(activitySchema).min(1).max(120) }), req.body);
  const s = await liveSession(req, body.sessionId);
  const r = await prisma.activityLog.createMany({
    data: body.batches.map((b) => ({ sessionId: s.id, kind: b.kind, data: b.data, at: b.at ? new Date(Math.min(Date.parse(b.at), Date.now())) : new Date() })),
  });
  return { stored: r.count };
}));
