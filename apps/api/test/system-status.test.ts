import { beforeEach, describe, expect, it, vi } from 'vitest';

const deps = vi.hoisted(() => ({ dbUp: true, agentUp: true }));
vi.mock('../src/lib/db.js', () => ({ prisma: { $queryRaw: vi.fn(async () => { if (!deps.dbUp) throw new Error('db down'); return [{ '?column?': 1 }]; }) } }));
vi.mock('../src/lib/agent.js', () => ({ agent: { health: vi.fn(async () => (deps.agentUp ? { ok: true } : { ok: false, detail: 'ECONNREFUSED' })) } }));

beforeEach(() => { vi.resetModules(); Object.assign(deps, { dbUp: true, agentUp: true }); });
const load = async () => (await import('../src/lib/status.js')).systemStatus;

describe('systemStatus', () => {
  it('is ok with a latency when the database and the agent answer', async () => {
    const s = await (await load())();
    expect(s).toMatchObject({ ok: true, database: true, agent: true });
    expect(s.agentLatencyMs).toEqual(expect.any(Number));
  });

  it('reports an unreachable agent without failing the whole check', async () => {
    deps.agentUp = false;
    expect(await (await load())()).toMatchObject({ ok: false, database: true, agent: false, agentLatencyMs: null, agentError: 'ECONNREFUSED' });
  });

  it('reports a database outage', async () => {
    deps.dbUp = false;
    expect(await (await load())()).toMatchObject({ ok: false, database: false, agent: true });
  });

  it('reuses one check for 15 seconds', async () => {
    const systemStatus = await load();
    const { agent } = await import('../src/lib/agent.js');
    await systemStatus();
    await systemStatus();
    expect(agent.health).toHaveBeenCalledTimes(1);
  });
});
