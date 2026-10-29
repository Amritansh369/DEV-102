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
const fresh = !existsSync(join(dataDir, 'PG_VERSION'));
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  port: Number(url.port || 5432),
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C', '--auth=scram-sha-256'],
  onLog: () => {},
  onError: (m) => { const s = String(m); if (/FATAL|PANIC/.test(s)) console.error('[db]', s.trim()); },
});

async function main() {
  if (fresh) {
    console.log('[db] Initialising data directory at .data/pg');
    await pg.initialise();
  }
  try {
    await pg.start();
  } catch (err) {
    const msg = String(err?.message ?? err);
    if (/already|in use|lock/i.test(msg)) {
      console.log(`[db] A Postgres server is already running on port ${url.port || 5432}; reusing it.`);
      if (process.argv.includes('--once')) process.exit(0);
      return new Promise(() => {});
    }
    throw err;
  }
  const dbName = url.pathname.replace(/^\//, '') || 'dev102';
  const client = pg.getPgClient();
  await client.connect();
  const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  await client.end();
  if (exists.rowCount === 0) {
    await pg.createDatabase(dbName);
    console.log(`[db] Created database "${dbName}"`);
  }
  console.log(`[db] PostgreSQL ready on localhost:${url.port || 5432}/${dbName}`);

  const stop = async () => { await pg.stop().catch(() => {}); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  if (process.argv.includes('--once')) await stop();
}

main().catch(async (err) => {
  console.error('[db] Failed to start embedded Postgres:', err?.message ?? err);
  await pg.stop().catch(() => {});
  process.exit(1);
});
