import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/live', () => ({ enqueue: vi.fn(), restoreQueue: vi.fn() }))
vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() })
const { parseInviteToken } = await import('../src/lib/api')

const TOKEN = '3f'.repeat(24)

describe('parseInviteToken', () => {
  it('reads the token from the emailed link', () => {
    expect(parseInviteToken(`https://wue.in/join/${TOKEN}`)).toBe(TOKEN)
    expect(parseInviteToken(`  http://localhost:3000/join/${TOKEN}?utm=mail \n`)).toBe(TOKEN)
  })

  it('accepts a bare token in any case', () => {
    expect(parseInviteToken(TOKEN.toUpperCase())).toBe(TOKEN)
  })

  it('rejects text that is not a whole link', () => {
    for (const text of ['', 'CPA-26', `https://wue.in/join/${TOKEN.slice(2)}`, `https://wue.in/join/${TOKEN}ab`]) expect(parseInviteToken(text)).toBeNull()
  })
})
