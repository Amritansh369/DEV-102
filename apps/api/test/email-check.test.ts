import { beforeEach, describe, expect, it, vi } from 'vitest';

const dns = vi.hoisted(() => ({
  os: vi.fn<(d: string) => Promise<{ address: string }>>(),
  mx: vi.fn<(d: string) => Promise<{ exchange: string; priority: number }[]>>(),
  a4: vi.fn<(d: string) => Promise<string[]>>(),
  a6: vi.fn<(d: string) => Promise<string[]>>(),
}));
vi.mock('../src/lib/core.js', () => ({ logger: { warn: vi.fn() } }));
vi.mock('node:dns/promises', () => ({
  lookup: dns.os,
  Resolver: class {
    resolveMx = dns.mx;
    resolve4 = dns.a4;
    resolve6 = dns.a6;
  },
}));

const fail = (code: string) => Object.assign(new Error(code), { code });

beforeEach(() => vi.resetModules());

async function check(email: string) {
  const { mailDomainOk } = await import('../src/lib/email-check.js');
  return mailDomainOk(email);
}

describe('mailDomainOk', () => {
  it('accepts a domain with mail servers', async () => {
    dns.mx.mockResolvedValue([{ exchange: 'gmail-smtp-in.l.google.com', priority: 5 }]);
    expect(await check('Someone@Gmail.com')).toBe(true);
    expect(dns.mx).toHaveBeenLastCalledWith('gmail.com');
  });

  it('rejects a domain that does not exist', async () => {
    dns.mx.mockRejectedValue(fail('ENOTFOUND'));
    dns.a4.mockRejectedValue(fail('ENOTFOUND'));
    dns.a6.mockRejectedValue(fail('ENOTFOUND'));
    expect(await check('a@gmial.con')).toBe(false);
  });

  it('rejects a domain whose null MX says it takes no mail', async () => {
    dns.mx.mockResolvedValue([{ exchange: '', priority: 0 }]);
    expect(await check('a@no-mail.example.io')).toBe(false);
  });

  it('accepts reserved test domains outside production, where mail goes to the dev outbox', async () => {
    dns.mx.mockReset();
    expect(await check('a@example.com')).toBe(true);
    expect(await check('b@school.test')).toBe(true);
    expect(dns.mx).not.toHaveBeenCalled();
  });

  it('rejects reserved test domains in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', 'a-real-production-secret');
    vi.stubEnv('AGENT_API_KEY', 'a-real-agent-key');
    dns.mx.mockResolvedValue([{ exchange: '', priority: 0 }]);
    expect(await check('a@example.com')).toBe(false);
    vi.unstubAllEnvs();
  });

  it('accepts a domain without MX that has an address, as mail falls back to it', async () => {
    dns.mx.mockRejectedValue(fail('ENODATA'));
    dns.a4.mockRejectedValue(fail('ENODATA'));
    dns.a6.mockResolvedValue(['2001:db8::1']);
    expect(await check('a@small-host.example.io')).toBe(true);
  });

  it('still rejects a typo domain when the MX lookup times out, using the system resolver', async () => {
    dns.mx.mockRejectedValue(fail('ETIMEOUT'));
    dns.os.mockRejectedValue(fail('ENOTFOUND'));
    expect(await check('a@gmial.con')).toBe(false);
  });

  it('answers null when DNS itself fails, and asks again next time', async () => {
    dns.mx.mockRejectedValue(fail('ETIMEOUT'));
    dns.os.mockResolvedValue({ address: '203.0.113.5' });
    const { mailDomainOk } = await import('../src/lib/email-check.js');
    expect(await mailDomainOk('a@slow.example.io')).toBeNull();
    dns.mx.mockResolvedValue([{ exchange: 'mx.slow.example.io', priority: 10 }]);
    expect(await mailDomainOk('a@slow.example.io')).toBe(true);
  });

  it('caches an answer per domain', async () => {
    dns.mx.mockReset().mockResolvedValue([{ exchange: 'mx.cached.example.io', priority: 10 }]);
    const { mailDomainOk } = await import('../src/lib/email-check.js');
    await mailDomainOk('a@cached.example.io');
    await mailDomainOk('b@cached.example.io');
    expect(dns.mx).toHaveBeenCalledTimes(1);
  });

  it('rejects an address without a domain', async () => {
    expect(await check('not-an-email')).toBe(false);
  });
});

describe('gravatarUrl', () => {
  it('hashes the trimmed, lower-cased email with SHA-256 and asks for a transparent image when there is no photo', async () => {
    const { gravatarUrl } = await import('../src/lib/email-check.js');
    // SHA-256 of "test@example.com"
    expect(gravatarUrl('  Test@Example.com ')).toBe('https://gravatar.com/avatar/973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b?s=96&d=blank');
  });
});
