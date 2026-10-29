import { describe, expect, it } from 'vitest';
import { INVITE_TOKEN, inviteStatus } from '../src/lib/domain.js';

const NOW = new Date('2026-10-28T10:00:00Z');
const at = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

describe('inviteStatus', () => {
  it('is pending until first use, then used', () => {
    expect(inviteStatus({ revokedAt: null, usedAt: null, expiresAt: at(2) }, NOW)).toBe('PENDING');
    expect(inviteStatus({ revokedAt: null, usedAt: at(-1), expiresAt: at(2) }, NOW)).toBe('USED');
  });

  it('expires exactly when the exam ends', () => {
    expect(inviteStatus({ revokedAt: null, usedAt: null, expiresAt: NOW }, NOW)).toBe('EXPIRED');
  });

  it('reports revoked ahead of expiry and use', () => {
    expect(inviteStatus({ revokedAt: at(-1), usedAt: at(-2), expiresAt: at(-0.5) }, NOW)).toBe('REVOKED');
  });
});

describe('INVITE_TOKEN', () => {
  it('accepts only 48 lowercase hex characters', () => {
    expect(INVITE_TOKEN.test('0f'.repeat(24))).toBe(true);
    expect(INVITE_TOKEN.test('0F'.repeat(24))).toBe(false);
    expect(INVITE_TOKEN.test('0f'.repeat(23))).toBe(false);
    expect(INVITE_TOKEN.test(`${'0f'.repeat(24)}x`)).toBe(false);
  });
});
