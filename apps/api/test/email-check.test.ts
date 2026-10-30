import { beforeEach, describe, expect, it, vi } from 'vitest';

const dns = vi.hoisted(() => ({
  mx: vi.fn<(d: string) => Promise<{ exchange: string; priority: number }[]>>(),
  a4: vi.fn<(d: string) => Promise<string[]>>(),
  a6: vi.fn<(d: string) => Promise<string[]>>(),
}));
vi.mock('node:dns/promises', () => ({
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
    expect(await check('a@example.com')).toBe(false);
  });

  it('accepts a domain without MX that has an address, as mail falls back to it', async () => {
    dns.mx.mockRejectedValue(fail('ENODATA'));
    dns.a4.mockRejectedValue(fail('ENODATA'));
    dns.a6.mockResolvedValue(['2001:db8::1']);
    expect(await check('a@small-host.example')).toBe(true);
  });

  it('answers null when DNS itself fails, and asks again next time', async () => {
    dns.mx.mockRejectedValue(fail('ETIMEOUT'));
    const { mailDomainOk } = await import('../src/lib/email-check.js');
    expect(await mailDomainOk('a@slow.example')).toBeNull();
    dns.mx.mockResolvedValue([{ exchange: 'mx.slow.example', priority: 10 }]);
    expect(await mailDomainOk('a@slow.example')).toBe(true);
  });

  it('caches an answer per domain', async () => {
    dns.mx.mockReset().mockResolvedValue([{ exchange: 'mx.cached.example', priority: 10 }]);
    const { mailDomainOk } = await import('../src/lib/email-check.js');
    await mailDomainOk('a@cached.example');
    await mailDomainOk('b@cached.example');
    expect(dns.mx).toHaveBeenCalledTimes(1);
  });

  it('rejects an address without a domain', async () => {
    expect(await check('not-an-email')).toBe(false);
  });
});

describe('gravatarUrl', () => {
  it('hashes the trimmed, lower-cased email with SHA-256 and asks for a 404 when there is no photo', async () => {
    const { gravatarUrl } = await import('../src/lib/email-check.js');
    // SHA-256 of "test@example.com"
    expect(gravatarUrl('  Test@Example.com ')).toBe('https://gravatar.com/avatar/973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b?s=96&d=404');
  });
});
