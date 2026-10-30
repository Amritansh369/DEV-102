import { Resolver } from 'node:dns/promises';
import { createHash } from 'node:crypto';

const resolver = new Resolver({ timeout: 3000, tries: 2 });
const cache = new Map<string, { ok: boolean | null; until: number }>();
const TTL_MS = 60 * 60_000;
const GONE = new Set(['ENOTFOUND', 'ENODATA', 'NXDOMAIN']);

async function lookup(domain: string): Promise<boolean | null> {
  try {
    const mx = await resolver.resolveMx(domain);
    // RFC 7505 "null MX": the domain says it accepts no mail.
    return !(mx.length === 1 && mx[0]?.exchange === '');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? '';
    if (!GONE.has(code)) return null;
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
  const hit = cache.get(domain);
  if (hit && hit.until > Date.now()) return hit.ok;
  const ok = await lookup(domain);
  // Only cache real answers, so a DNS hiccup is retried next time.
  if (ok !== null) cache.set(domain, { ok, until: Date.now() + TTL_MS });
  return ok;
}

/** The person's Gravatar photo; `d=404` makes the image fail when there is none, and the UI shows initials. */
export function gravatarUrl(email: string, size = 96): string {
  const hash = createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  return `https://gravatar.com/avatar/${hash}?s=${size}&d=404`;
}
