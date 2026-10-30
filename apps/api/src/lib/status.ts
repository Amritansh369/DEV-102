import { agent } from './agent.js';
import { prisma } from './db.js';

export interface SystemStatus {
  /** True when the database and the AI agent both answer. */
  ok: boolean;
  database: boolean;
  agent: boolean;
  /** Round trip to the agent's /health, or null when it did not answer. */
  agentLatencyMs: number | null;
  checkedAt: string;
}

const TTL_MS = 15_000;
let cache: { at: number; value: Promise<SystemStatus> } | null = null;

async function check(): Promise<SystemStatus> {
  const database = await prisma.$queryRaw`SELECT 1`.then(() => true, () => false);
  const started = Date.now();
  const health = await agent.health();
  return {
    ok: database && health.ok, database, agent: health.ok,
    agentLatencyMs: health.ok ? Date.now() - started : null, checkedAt: new Date().toISOString(),
  };
}

/** Live health of the database and the AI agent, shared for 15 seconds so a public page cannot flood the agent. */
export function systemStatus(): Promise<SystemStatus> {
  if (!cache || Date.now() - cache.at > TTL_MS) cache = { at: Date.now(), value: check() };
  return cache.value;
}
