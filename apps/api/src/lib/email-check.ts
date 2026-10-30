import { Resolver, lookup as osLookup } from 'node:dns/promises';
import { createHash } from 'node:crypto';
import { config } from '../config.js';
import { logger } from './core.js';

const resolver = new Resolver({ timeout: 3000, tries: 2 });
const cache = new Map<string, { ok: boolean | null; until: number }>();
const TTL_MS = 60 * 60_000;
const GONE = new Set(['ENOTFOUND', 'ENODATA', 'NXDOMAIN']);
// Reserved for testing (RFC 2606 / 6761). They take no mail, but outside production every email goes to the dev outbox.
const TEST_DOMAIN = /(^|\.)(example\.(com|org|net)|test|example)$/;

async function lookup(domain: string): Promise<boolean | null> {
  try {
    const mx = await resolver.resolveMx(domain);
    // RFC 7505 "null MX": the domain says it accepts no mail.
    return !(mx.length === 1 && mx[0]?.exchange === '');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? '';
    if (!GONE.has(code)) {
      // The DNS server did not answer (a cold start can time out). The operating system resolver can still tell
      // whether the domain exists at all, which is what catches typos like gmial.com.
      logger.warn({ domain, code }, 'MX lookup failed; checking the domain with the system resolver');
      return osLookup(domain).then(() => null, (e: NodeJS.ErrnoException) => (GONE.has(e.code ?? '') ? false : null));
    }
  }
  // No MX record: mail falls back to the domain's own address (RFC 5321 implicit MX).
  const hasAddress = await Promise.any([resolver.resolve4(domain), resolver.resolve6(domain)]).then(() => true, () => false);
  return hasAddress;
}

/**
 * Whether the email's domain can receive mail: true, false (no such domain, or it refuses mail),
 * or null when DNS could not answer. Mail providers do not reveal whether a single mailbox exists,
 * so a real address is only confirmed when the emailed link is used.
 */
export async function mailDomainOk(email: string): Promise<boolean | null> {
  const domain = email.trim().toLowerCase().split('@')[1];
  if (!domain) return false;
  if (!config.isProd && TEST_DOMAIN.test(domain)) return true;
  const hit = cache.get(domain);
  if (hit && hit.until > Date.now()) return hit.ok;
  const ok = await lookup(domain);
  // Only cache real answers, so a DNS hiccup is retried next time.
  if (ok !== null) cache.set(domain, { ok, until: Date.now() + TTL_MS });
  return ok;
}

/** The person's Gravatar photo; `d=blank` returns a transparent image when there is none, so the initials behind it show through. */
export function gravatarUrl(email: string, size = 96): string {
  const hash = createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  return `https://gravatar.com/avatar/${hash}?s=${size}&d=blank`;
}
