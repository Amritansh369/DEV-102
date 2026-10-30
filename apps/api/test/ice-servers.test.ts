import { afterEach, describe, expect, it, vi } from 'vitest';

async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return (await import('../src/config.js')).config.iceServers;
}

afterEach(() => { vi.unstubAllEnvs(); });

describe('config.iceServers', () => {
  it('is STUN only when no TURN relay is configured', async () => {
    expect(await load({ TURN_URLS: '' })).toEqual([{ urls: 'stun:stun.l.google.com:19302' }]);
  });

  it('adds the TURN relay with its credentials, ignoring entries that are not turn: or turns: URLs', async () => {
    const servers = await load({
      TURN_URLS: 'turn:relay.example.com:80, turns:relay.example.com:443?transport=tcp, https://not-a-relay',
      TURN_USERNAME: 'user1', TURN_CREDENTIAL: 'secret1',
    });
    expect(servers).toEqual([
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: ['turn:relay.example.com:80', 'turns:relay.example.com:443?transport=tcp'], username: 'user1', credential: 'secret1' },
    ]);
  });
});
