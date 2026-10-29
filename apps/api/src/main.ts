import express, { Router } from 'express';
import { createServer } from 'node:http';
import { config } from './config.js';
import { AppError, errorMiddleware, logger } from './lib/core.js';
import { prisma } from './lib/db.js';
import { applySecurity, limits } from './lib/security.js';
import { initRealtime } from './lib/realtime.js';
import { startJobs, stopJobs } from './lib/jobs.js';
import { authRouter } from './modules/auth.js';
import { examsRouter } from './modules/exams.js';
import { candidatesRouter } from './modules/candidates.js';
import { sessionsRouter } from './modules/sessions.js';
import { proctoringRouter } from './modules/proctoring.js';
import { mentorRouter } from './modules/mentor.js';
import { adminRouter } from './modules/admin.js';
import { reportsRouter } from './modules/reports.js';
import { devRouter } from './modules/dev.js';

const app = express();
applySecurity(app);
app.use(express.json({ limit: '5mb' }));

app.get('/health', (_req, res) => res.json({ ok: true, data: { status: 'ok', uptimeSec: Math.round(process.uptime()) } }));

const v1 = Router();
v1.use(limits.general);
v1.use('/auth', authRouter);
v1.use('/sessions', sessionsRouter);
v1.use('/proctoring', proctoringRouter);
v1.use('/exams', examsRouter);
v1.use('/reports', reportsRouter);
v1.use(candidatesRouter);
v1.use(adminRouter);
if (!config.isProd) v1.use('/dev', devRouter);
v1.use(mentorRouter);
app.use('/api/v1', v1);

app.use((_req, _res, next) => next(new AppError('NOT_FOUND', 'Route not found.')));
app.use(errorMiddleware);

const server = createServer(app);
server.headersTimeout = 30_000;
server.requestTimeout = 60_000;
initRealtime(server);

async function start(): Promise<void> {
  await prisma.$connect();
  server.listen(config.PORT, () => {
    logger.info(`API listening on http://localhost:${config.PORT}/api/v1 (${config.NODE_ENV}, mail: ${config.smtpEnabled ? 'smtp' : 'dev outbox'})`);
  });
  startJobs();
}

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'shutting down');
  stopJobs();
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandled rejection'));

start().catch((err: unknown) => {
  logger.fatal({ err }, 'API failed to start. Is PostgreSQL running? Try: npm run db');
  process.exit(1);
});
