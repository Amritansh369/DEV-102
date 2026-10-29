/** Fetch client for the DEV102 API: bearer token, envelope unwrap, timeouts, typed errors, 401 redirect. */
export const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/(api)?\/?$/, '')
const BASE = `${API_ORIGIN}/api/v1`
const TOKEN_KEY = 'dev102.token'

export type HttpErrorCode = 'NETWORK' | 'AUTH' | 'FORBIDDEN' | 'VALIDATION' | 'NOT_FOUND' | 'CONFLICT' | 'LOCKED' | 'RATE_LIMITED' | 'SERVER'
const STATUS: Record<HttpErrorCode, number> = { NETWORK: 0, AUTH: 401, FORBIDDEN: 403, VALIDATION: 400, NOT_FOUND: 404, CONFLICT: 409, LOCKED: 423, RATE_LIMITED: 429, SERVER: 500 }

export class HttpError extends Error {
  readonly status: number
  constructor(message: string, readonly code: HttpErrorCode, readonly details?: Record<string, unknown>) {
    super(message)
    this.name = 'HttpError'
    this.status = STATUS[code]
  }
}

export function getToken(): string | null {
  return typeof window === 'undefined' ? null : window.localStorage.getItem(TOKEN_KEY)
}
export function setToken(token: string | null): void {
  if (typeof window === 'undefined') return
  if (token) window.localStorage.setItem(TOKEN_KEY, token)
  else window.localStorage.removeItem(TOKEN_KEY)
}

function onUnauthorized(): void {
  setToken(null)
  window.localStorage.removeItem('dev102.session')
  const here = window.location.pathname
  if (!here.startsWith('/login')) {
    const role = here.startsWith('/admin') ? 'admin' : here.startsWith('/mentor') ? 'mentor' : 'candidate'
    window.location.assign(`/login?role=${role}&next=${encodeURIComponent(here)}`)
  }
}

export async function http<T>(method: string, path: string, body?: unknown, opts: { timeoutMs?: number } = {}): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20_000)
  const token = getToken()
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      signal: ctrl.signal,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
  } catch {
    throw new HttpError('Could not reach the server. Check your connection and try again.', 'NETWORK')
  } finally {
    clearTimeout(timer)
  }
  const json = (await res.json().catch(() => null)) as { ok: boolean; data?: T; error?: { code: HttpErrorCode; message: string; details?: Record<string, unknown> } } | null
  if (!res.ok || !json?.ok) {
    const err = json?.error
    const code = err?.code ?? (res.status >= 500 ? 'SERVER' : 'VALIDATION')
    if (code === 'AUTH' && token && !path.startsWith('/auth/')) onUnauthorized()
    throw new HttpError(err?.message ?? `Request failed (${res.status})`, code, err?.details)
  }
  return json.data as T
}

export const get = <T>(path: string) => http<T>('GET', path)
export const post = <T>(path: string, body?: unknown) => http<T>('POST', path, body ?? {})
export const put = <T>(path: string, body: unknown) => http<T>('PUT', path, body)
export const patch = <T>(path: string, body: unknown) => http<T>('PATCH', path, body)
export const del = <T>(path: string) => http<T>('DELETE', path)

export function qs(params: object): string {
  const out = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '' && v !== 'ALL') out.set(k, String(v))
  const s = out.toString()
  return s ? `?${s}` : ''
}

/** Authenticated file download (Excel, PDF): fetches with the bearer token and saves via a blob URL. */
export async function download(path: string, fallbackName: string): Promise<void> {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) throw new HttpError(`Download failed (${res.status})`, res.status === 401 ? 'AUTH' : 'SERVER')
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? fallbackName
  const url = URL.createObjectURL(await res.blob())
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
