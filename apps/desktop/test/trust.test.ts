import { describe, expect, it } from 'vitest'
import { isAppPage } from '../electron/trust'

const INSTALLED = 'file:///C:/Users/a/AppData/Local/Programs/where-u-elevate/resources/app.asar/out/renderer/'

describe('isAppPage', () => {
  it('trusts the installed app\'s own pages, whose file:// origin is "null"', () => {
    expect(new URL(`${INSTALLED}index.html`).origin).toBe('null')
    expect(isAppPage(`${INSTALLED}index.html`, INSTALLED)).toBe(true)
    expect(isAppPage(`${INSTALLED}index.html#/exam`, INSTALLED)).toBe(true)
  })

  it('refuses other local files and web pages in the installed app', () => {
    expect(isAppPage('file:///C:/Users/a/Downloads/evil.html', INSTALLED)).toBe(false)
    expect(isAppPage('https://chatgpt.com/', INSTALLED)).toBe(false)
  })

  it('trusts only the dev server origin in development', () => {
    expect(isAppPage('http://localhost:5173/', 'http://localhost:5173')).toBe(true)
    expect(isAppPage('http://localhost:5174/', 'http://localhost:5173')).toBe(false)
    expect(isAppPage('not a url', 'http://localhost:5173')).toBe(false)
  })
})
