import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/api', () => ({ api: { reportViolation: vi.fn() } }))
vi.mock('../src/lib/live', () => ({ proofShot: vi.fn() }))
const { aiWindow, outsideEntry } = await import('../src/lib/away')

describe('aiWindow', () => {
  it('names the AI tool open in a browser tab, from the window title', () => {
    expect(aiWindow([{ app: 'POWERPNT', title: 'Deck - PowerPoint' }, { app: 'chrome', title: 'ChatGPT - Google Chrome' }]))
      .toEqual({ tool: 'ChatGPT', app: 'chrome', title: 'ChatGPT - Google Chrome' })
    expect(aiWindow([{ app: 'msedge', title: 'Google Gemini - Microsoft Edge' }])?.tool).toBe('Gemini')
    expect(aiWindow([{ app: 'firefox', title: 'Perplexity — Mozilla Firefox' }])?.tool).toBe('Perplexity')
  })

  it('names AI desktop apps by their program name', () => {
    expect(aiWindow([{ app: 'ChatGPT Classic', title: 'Clarify completion status' }])?.tool).toBe('ChatGPT')
    expect(aiWindow([{ app: 'claude', title: 'Claude' }])?.tool).toBe('Claude')
  })

  it('ignores ordinary windows', () => {
    expect(aiWindow([{ app: 'chrome', title: 'Prime number - Wikipedia - Google Chrome' }, { app: 'WhatsApp.Root', title: 'WhatsApp' }, { app: 'explorer', title: 'Downloads' }])).toBeNull()
    expect(aiWindow([])).toBeNull()
  })
})

describe('outsideEntry', () => {
  it('logs an AI tool open outside the exam under its real address, so it is flagged like any other visit', () => {
    expect(outsideEntry({ app: 'chrome', title: 'ChatGPT - Google Chrome' })).toEqual({ url: 'https://chatgpt.com/', title: 'ChatGPT - Google Chrome (outside the exam, chrome)' })
  })

  it('reads a search from the browser title', () => {
    expect(outsideEntry({ app: 'chrome', title: 'is 91 prime - Google Search - Google Chrome' })).toMatchObject({ query: 'is 91 prime', url: 'https://www.google.com/search?q=is%2091%20prime' })
    expect(outsideEntry({ app: 'msedge', title: 'hash table - Bing - Microsoft Edge' })?.query).toBe('hash table')
  })

  it('ignores ordinary windows', () => {
    expect(outsideEntry({ app: 'chrome', title: 'Prime number - Wikipedia - Google Chrome' })).toBeNull()
  })
})
