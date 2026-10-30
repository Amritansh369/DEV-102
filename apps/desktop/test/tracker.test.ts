import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sendToHost = vi.hoisted(() => vi.fn())
vi.mock('electron', () => ({ ipcRenderer: { sendToHost } }))

type Listener = (e: { key?: string; shiftKey?: boolean }) => void

class FakeInput {}
class FakeTextArea { value = '' }

/** The little of a chat page the tracker touches: one input box, and the answers shown so far. */
function fakePage(hostname: string) {
  const listeners = new Map<string, Listener[]>()
  const box = new FakeTextArea()
  const answers: { innerText: string }[] = []
  const body = { innerText: '' }
  vi.stubGlobal('HTMLInputElement', FakeInput)
  vi.stubGlobal('HTMLTextAreaElement', FakeTextArea)
  vi.stubGlobal('HTMLElement', class {})
  vi.stubGlobal('location', { hostname, href: `https://${hostname}/c/1` })
  vi.stubGlobal('document', {
    title: 'Chat', body, activeElement: box,
    addEventListener: (type: string, fn: Listener) => listeners.set(type, [...(listeners.get(type) ?? []), fn]),
    querySelectorAll: () => answers,
  })
  const fire = (type: string, e: Parameters<Listener>[0] = {}) => listeners.get(type)?.forEach((fn) => fn(e))
  return { box, answers, body, fire }
}

const replies = () => sendToHost.mock.calls.filter(([channel]) => channel === 'sandbox:reply').map(([, p]) => p as { prompt: string; text: string })

describe('AI reply capture', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
    sendToHost.mockClear()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('reports the answer to a question sent with Enter once it stops changing, then again if it grows', async () => {
    const page = fakePage('chatgpt.com')
    await import('../electron/browser-sandbox/tracker')
    page.box.value = 'what is 2+2'
    page.fire('keydown', { key: 'Enter' })

    const answer = { innerText: 'It' }
    page.answers.push(answer)
    await vi.advanceTimersByTimeAsync(2000)
    expect(replies()).toEqual([])
    answer.innerText = 'It is 4.'
    await vi.advanceTimersByTimeAsync(5000)
    expect(replies()).toEqual([expect.objectContaining({ prompt: 'what is 2+2', text: 'It is 4.' })])

    answer.innerText = 'It is 4. Do you want the working?'
    await vi.advanceTimersByTimeAsync(5000)
    expect(replies().map((r) => r.text)).toEqual(['It is 4.', 'It is 4. Do you want the working?'])
  })

  it('catches a question sent with the send button, when the box empties', async () => {
    const page = fakePage('claude.ai')
    await import('../electron/browser-sandbox/tracker')
    page.box.value = 'what is 2+2'
    page.fire('input')
    await vi.advanceTimersByTimeAsync(900)
    page.box.value = ''
    page.fire('click')
    await vi.advanceTimersByTimeAsync(300)
    page.answers.push({ innerText: 'Four.' })
    await vi.advanceTimersByTimeAsync(5000)
    expect(replies()).toEqual([expect.objectContaining({ prompt: 'what is 2+2', text: 'Four.' })])
  })

  it('falls back to the new text on the page when an answer element cannot be found', async () => {
    const page = fakePage('perplexity.ai')
    await import('../electron/browser-sandbox/tracker')
    page.body.innerText = 'Ask anything'
    page.box.value = 'what is 2+2'
    page.fire('keydown', { key: 'Enter' })
    page.body.innerText = 'Ask anything\nwhat is 2+2\nThe answer is 4.'
    await vi.advanceTimersByTimeAsync(5000)
    expect(replies()).toEqual([expect.objectContaining({ text: 'The answer is 4.' })])
  })

  it('does not read pages on ordinary sites, but still reports what was typed', async () => {
    const page = fakePage('en.wikipedia.org')
    await import('../electron/browser-sandbox/tracker')
    page.box.value = 'prime numbers'
    page.fire('keydown', { key: 'Enter' })
    page.answers.push({ innerText: 'Not an AI answer.' })
    await vi.advanceTimersByTimeAsync(5000)
    expect(replies()).toEqual([])
    expect(sendToHost).toHaveBeenCalledWith('sandbox:typed', expect.objectContaining({ text: 'prime numbers', trigger: 'submit' }))
  })
})
