/** API client and session storage shared by the exam page and the background worker. */
declare const __API_URL__: string;

export const API_URL = __API_URL__;
const BASE = `${API_URL}/api/v1`;

/** Kept in chrome.storage.session: cleared when the browser closes, never visible to content scripts. */
export interface Stored {
  token?: string;
  sessionId?: string;
  examTabId?: number;
}

export const store = {
  get: () => chrome.storage.session.get(null) as Promise<Stored>,
  set: (patch: Stored) => chrome.storage.session.set(patch),
  clear: (...keys: (keyof Stored)[]) => chrome.storage.session.remove(keys),
};

export class ApiError extends Error {
  constructor(message: string, readonly code: string, readonly status: number, readonly details?: Record<string, unknown>) {
    super(message);
  }
}

export async function call<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError('Cannot reach the exam server. Check your connection.', 'NETWORK', 0);
  }
  const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: T; error?: { code: string; message: string; details?: Record<string, unknown> } } | null;
  if (!res.ok || !json?.ok) throw new ApiError(json?.error?.message ?? `Request failed (${res.status})`, json?.error?.code ?? 'SERVER', res.status, json?.error?.details);
  return json.data as T;
}

/** Messages content scripts send to the background worker. */
export type ContentMessage = { type: 'typed'; text: string; url: string; title: string } | { type: 'reply'; prompt: string; text: string; url: string; title: string } | { type: 'status' };
