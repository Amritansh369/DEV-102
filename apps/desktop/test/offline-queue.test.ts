import { beforeEach, describe, expect, it, vi } from 'vitest'

class HttpError extends Error {
  constructor(message: string, readonly code: string) { super(message) }
}
const http = vi.hoisted(() => ({ post: vi.fn(), put: vi.fn() }))
vi.mock('../src/lib/http', () => ({ API_ORIGIN: 'http://api', HttpError, getToken: () => 't', post: http.post, put: http.put }))
vi.mock('socket.io-client', () => ({ io: vi.fn() }))
vi.mock('../src/lib/audio', () => ({ startAudioMonitor: vi.fn() }))
vi.mock('../src/lib/proctorMock', () => ({ getScreenStream: () => null }))

const store = new Map<string, string>()
vi.stubGlobal('window', {})
vi.stubGlobal('navigator', { onLine: true })
vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) })

const live = await import('../src/lib/live')

const visit = (i: number) => ({ kind: 'browsing' as const, body: { url: `https://example.com/${i}`, title: `Page ${i}`, at: new Date(i).toISOString(), flaggedAi: false } })
const sentUrls = () => http.post.mock.calls.filter(([path]) => path === '/proctoring/browsing-logs').flatMap(([, body]) => (body as { entries: { url: string }[] }).entries.map((e) => e.url))

beforeEach(async () => {
  http.post.mockReset().mockResolvedValue({})
  http.put.mockReset().mockResolvedValue({})
  store.clear()
  await live.restoreQueue(`sess-${Math.random()}`)
})

describe('offline queue sync', () => {
  it('sends the whole browsing backlog in batches of 100', async () => {
    const sid = `sess-${Math.random()}`
    for (let i = 0; i < 250; i++) await live.enqueue(sid, visit(i))
    await live.flushQueue()
    expect(sentUrls()).toHaveLength(250)
    expect(new Set(sentUrls()).size).toBe(250)
    expect(live.queueSize()).toBe(0)
  })

  it('keeps unsent batches when the connection drops mid-sync, without resending sent ones', async () => {
    const sid = `sess-${Math.random()}`
    for (let i = 0; i < 250; i++) await live.enqueue(sid, visit(i))
    http.post.mockResolvedValueOnce({}).mockRejectedValueOnce(new HttpError('offline', 'NETWORK'))
    await live.flushQueue()
    expect(live.queueSize()).toBe(150)
    http.post.mockReset().mockResolvedValue({})
    await live.flushQueue()
    expect(sentUrls()).toHaveLength(150)
    expect(sentUrls()[0]).toBe('https://example.com/100')
  })

  it('drops the backlog once the session has ended', async () => {
    const sid = `sess-${Math.random()}`
    await live.enqueue(sid, visit(1))
    http.post.mockRejectedValueOnce(new HttpError('ended', 'CONFLICT'))
    await live.flushQueue()
    expect(live.queueSize()).toBe(0)
  })
})

describe('frames kept while offline', () => {
  it('thins out every other frame when full, so the whole outage stays covered', async () => {
    const sid = `sess-${Math.random()}`
    for (let i = 0; i < 121; i++) await live.enqueueFrame(sid, 'webcam', `data:image/jpeg;base64,${i}`)
    // 121 exceeds the cap of 120, so the odd-numbered frames go and the first and latest stay.
    expect(live.queueSize()).toBe(61)
    for (let i = 0; i < 31; i++) await live.enqueueFrame(sid, 'screen', `data:image/jpeg;base64,s${i}`)
    expect(live.queueSize()).toBe(61 + 16)
  })
})
