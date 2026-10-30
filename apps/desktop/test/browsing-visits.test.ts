import { describe, expect, it } from 'vitest'
import { groupVisits } from '../src/lib/monitorUtils'
import type { BrowsingLog } from '../src/lib/types'

let n = 0
const entry = (min: number, url: string, extra: Partial<BrowsingLog> = {}): BrowsingLog => ({
  id: `b${++n}`, sessionId: 's1', at: new Date(Date.UTC(2026, 9, 29, 10, min)).toISOString(), url, title: '', flaggedAi: false, ...extra,
})

describe('groupVisits', () => {
  it('shows an AI site being opened and then what was typed on it', () => {
    const visits = groupVisits([
      entry(1, 'https://chatgpt.com/', { title: 'ChatGPT', flaggedAi: true }),
      entry(2, 'https://chatgpt.com/', { query: 'solve 2x + 5 = 11', flaggedAi: true }),
      entry(3, 'https://chatgpt.com/c/abc', { query: 'explain step 2', flaggedAi: true }),
    ])
    expect(visits).toHaveLength(1)
    expect(visits[0]).toMatchObject({ site: 'ChatGPT', ai: true, returned: false })
    expect(visits[0]!.queries.map((q) => q.text)).toEqual(['solve 2x + 5 = 11', 'explain step 2'])
  })

  it('starts a new visit on each site change and marks a return to an earlier site', () => {
    const visits = groupVisits([
      entry(1, 'https://chatgpt.com/', { flaggedAi: true }),
      entry(2, 'https://en.wikipedia.org/wiki/Algebra', { title: 'Algebra - Wikipedia' }),
      entry(3, 'https://claude.ai/new', { flaggedAi: true }),
      entry(4, 'https://claude.ai/new', { query: 'what is a prime', flaggedAi: true }),
      entry(5, 'https://chatgpt.com/', { query: 'and the next one?', flaggedAi: true }),
    ])
    expect(visits.map((v) => [v.site, v.returned, v.queries.length])).toEqual([
      ['ChatGPT', false, 0], ['Algebra - Wikipedia', false, 0], ['Claude', false, 1], ['ChatGPT', true, 1],
    ])
  })

  it('names search engines and the sandbox search, keeping the searched text', () => {
    const visits = groupVisits([
      entry(1, 'https://www.google.com/search?q=binary+search', { title: 'Google Search', query: 'binary search' }),
      entry(2, 'sandbox://search?q=sorting', { title: 'Search', query: 'sorting' }),
    ])
    expect(visits.map((v) => [v.site, v.queries[0]?.text, v.ai])).toEqual([['Google', 'binary search', false], ['Search', 'sorting', false]])
  })

  it('puts an AI reply under its question and keeps the newest version of a growing answer', () => {
    const base = { sessionId: 's', url: 'https://chatgpt.com/c/1', title: 'ChatGPT', flaggedAi: true }
    const [visit] = groupVisits([
      { ...base, id: '1', at: '2026-10-30T10:00:00Z', query: 'what is 2+2' },
      { ...base, id: '2', at: '2026-10-30T10:00:05Z', query: 'what is 2+2', reply: 'It is' },
      { ...base, id: '3', at: '2026-10-30T10:00:09Z', query: 'what is 2+2', reply: 'It is 4.' },
    ])
    expect(visit?.queries).toEqual([{ id: '1', at: '2026-10-30T10:00:00Z', text: 'what is 2+2', reply: 'It is 4.' }])
  })

  it('shows a message once when the tracker reported it after a pause and again on Enter', () => {
    const visits = groupVisits([
      entry(1, 'https://claude.ai/', { flaggedAi: true }),
      entry(2, 'https://claude.ai/', { query: 'give answer only', flaggedAi: true }),
      entry(2, 'https://claude.ai/', { query: 'give answer only', flaggedAi: true }),
      entry(3, 'https://claude.ai/', { query: 'thanks', flaggedAi: true }),
    ])
    expect(visits[0]!.queries.map((q) => q.text)).toEqual(['give answer only', 'thanks'])
  })

  it('orders entries by time even when they arrive out of order', () => {
    const visits = groupVisits([
      entry(5, 'https://claude.ai/', { query: 'second', flaggedAi: true }),
      entry(1, 'https://claude.ai/', { flaggedAi: true }),
      entry(3, 'https://claude.ai/', { query: 'first', flaggedAi: true }),
    ])
    expect(visits).toHaveLength(1)
    expect(visits[0]!.queries.map((q) => q.text)).toEqual(['first', 'second'])
  })
})
