import { logger } from './core.js';
import { prisma } from './db.js';
import { finalizeSession, recordViolation } from './policy.js';
import { runRetention } from './evidence.js';

const HEARTBEAT_TIMEOUT_MS = 30_000;
const timers: NodeJS.Timeout[] = [];
let running = false;

/** Server-side exam clock: auto-submits sessions past their deadline and flags silent clients as NETWORK_LOST. */
async function sweep(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const expired = await prisma.examSession.findMany({ where: { status: 'LIVE', deadlineAt: { lt: new Date() } }, select: { id: true }, take: 200 });
    for (const s of expired) await finalizeSession(s.id, 'TIME_UP').catch((err: unknown) => logger.error({ err, sessionId: s.id }, 'auto-submit failed'));

    const silent = await prisma.examSession.findMany({
      where: { status: 'LIVE', networkLost: false, lastHeartbeatAt: { lt: new Date(Date.now() - HEARTBEAT_TIMEOUT_MS) } },
      select: { id: true }, take: 200,
    });
    for (const s of silent) {
      await prisma.examSession.update({ where: { id: s.id }, data: { networkLost: true } });
      await recordViolation({ sessionId: s.id, code: 'NETWORK_LOST', source: 'server', message: 'No heartbeat for 30 seconds. The candidate may be offline; answers are cached on the device.' });
    }
  } catch (err) {
    logger.error({ err }, 'session sweeper failed');
  } finally {
    running = false;
  }
}

export function startJobs(): void {
  timers.push(setInterval(() => void sweep(), 5_000));
  timers.push(setInterval(() => void runRetention().catch((err: unknown) => logger.error({ err }, 'retention failed')), 6 * 60 * 60_000));
  void runRetention().catch(() => undefined);
  logger.info('background jobs started (session sweeper 5s, retention 6h)');
}

export function stopJobs(): void {
  timers.splice(0).forEach(clearInterval);
}
