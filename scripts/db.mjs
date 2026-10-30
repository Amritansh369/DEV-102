// Runs a real PostgreSQL 16+ server from node_modules (no Docker or system install needed).
// Usage: node scripts/db.mjs            -> start and keep running
//        node scripts/db.mjs --once     -> start, make sure the database exists, then stop
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = join(root, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const url = new URL(process.env.DATABASE_URL ?? 'postgresql://dev102:dev102pass@localhost:5432/dev102');
const isLocal = ['localhost', '127.0.0.1'].includes(url.hostname);
if (!isLocal) {
  console.log(`[db] DATABASE_URL points at ${url.hostname}; using that server, embedded Postgres not started.`);
  process.exit(0);
}

const dataDir = join(root, '.data', 'pg');
const port = Number(url.port || 5432);
const fresh = !existsSync(join(dataDir, 'PG_VERSION'));
// The server's stderr goes to onLog; keep the tail so a failed start can say why.
const serverLog = [];
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  port,
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C', '--auth=scram-sha-256'],
  onLog: (m) => { serverLog.push(...String(m).split(/\r?\n/).filter(Boolean)); serverLog.splice(0, serverLog.length - 20); },
  onError: (m) => { const s = String(m); if (/FATAL|PANIC/.test(s)) console.error('[db]', s.trim()); },
});

// embedded-postgres rejects start() with no value when the server exits early.
function startFailure() {
  const log = serverLog.join('\n');
  const pid = log.match(/another postmaster \(PID (\d+)\)/i)?.[1];
  if (/postmaster\.pid.*already exists/i.test(log)) {
    return `.data/pg is already in use by another PostgreSQL process${pid ? ` (PID ${pid})` : ''}. Another "npm start" is probably still running; stop it first.`;
  }
  if (/could not bind|address already in use/i.test(log)) {
    return `port ${port} is already taken by another PostgreSQL server (for example a system install). Change the port in DATABASE_URL in .env, e.g. localhost:5433.`;
  }
  const detail = serverLog.filter((l) => /FATAL|PANIC|ERROR/.test(l)).slice(-3).join('\n  ') || serverLog.slice(-3).join('\n  ');
  return `the server exited during startup.${detail ? `\n  ${detail}` : ''}`;
}

let started = false;
async function main() {
  if (fresh) {
    console.log('[db] Initialising data directory at .data/pg');
    await pg.initialise();
  }
  try {
    await pg.start();
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : startFailure());
  }
  started = true;
  const dbName = url.pathname.replace(/^\//, '') || 'dev102';
  // Older local clusters may have been initialized with only the application
  // database, so use PostgreSQL's template database for maintenance queries.
  const client = pg.getPgClient('template1');
  await client.connect();
  const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (exists.rowCount === 0) {
    await client.query(`CREATE DATABASE ${client.escapeIdentifier(dbName)}`);
    console.log(`[db] Created database "${dbName}"`);
  }
  await client.end();
  console.log(`[db] PostgreSQL ready on localhost:${url.port || 5432}/${dbName}`);

  const stop = async () => { await pg.stop().catch(() => {}); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  if (process.argv.includes('--once')) await stop();
}

main().catch(async (err) => {
  console.error('[db] Failed to start embedded Postgres:', err?.message ?? err);
  // stop() waits for an exit event that never comes if the server already died, so only call it when running.
  if (started) await pg.stop().catch(() => {});
  process.exit(1);
});
