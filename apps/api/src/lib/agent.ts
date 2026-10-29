import axios, { type AxiosInstance } from 'axios';
import type { Severity, ViolationCode } from '@prisma/client';
import { config } from '../config.js';
import { logger } from './core.js';

export interface AgentViolation { code: ViolationCode; severity: Severity; confidence: number; message: string }
export interface AgentResult { violations: AgentViolation[]; metrics: Record<string, unknown>; riskDelta: number; degraded?: boolean }
export interface FaceMatch { match: boolean; similarity: number; faces: number; liveness: boolean; degraded?: boolean }

const http: AxiosInstance = axios.create({
  baseURL: config.AGENT_URL,
  timeout: 6000,
  headers: { 'X-Agent-Key': config.AGENT_API_KEY },
});

/** Opens after 4 consecutive failures and probes again after 20 s, so a dead agent never slows exams down. */
const breaker = { failures: 0, openUntil: 0 };
let lastHealthy: boolean | null = null;

async function call<T>(path: string, body: unknown, fallback: T, retries = 1): Promise<T> {
  if (Date.now() < breaker.openUntil) return fallback;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { data } = await http.post<T>(path, body);
      breaker.failures = 0;
      if (lastHealthy === false) logger.info('agent recovered');
      lastHealthy = true;
      return data;
    } catch (err) {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
        continue;
      }
      breaker.failures += 1;
      if (breaker.failures >= 4) breaker.openUntil = Date.now() + 20_000;
      if (lastHealthy !== false) logger.warn({ path, err: (err as Error).message }, 'agent unavailable, using fallback');
      lastHealthy = false;
    }
  }
  return fallback;
}

const EMPTY: AgentResult = { violations: [], metrics: {}, riskDelta: 0, degraded: true };

export const agent = {
  analyzeFrame: (sessionId: string, imageBase64: string, registeredFace?: string) =>
    call<AgentResult>('/analyze/frame', { sessionId, imageBase64, ts: new Date().toISOString(), registeredFaceBase64: registeredFace ?? null }, EMPTY, 0),
  analyzeScreen: (sessionId: string, imageBase64: string) =>
    call<AgentResult>('/analyze/screen', { sessionId, imageBase64, ts: new Date().toISOString() }, EMPTY, 0),
  analyzeBrowsing: (sessionId: string, entries: { url: string; title: string; query?: string; at: string }[], examTexts: string[]) =>
    call<AgentResult>('/analyze/browsing', { sessionId, entries, examTexts }, EMPTY),
  faceMatch: (imageBase64: string, registeredBase64: string | null) =>
    call<FaceMatch>('/verify/face', { imageBase64, registeredBase64 }, { match: true, similarity: 0, faces: 1, liveness: true, degraded: true }),
  async health(): Promise<{ ok: boolean; detail?: unknown }> {
    try {
      const { data } = await http.get('/health', { timeout: 2000 });
      return { ok: true, detail: data };
    } catch (err) {
      return { ok: false, detail: (err as Error).message };
    }
  },
  get circuitOpen(): boolean {
    return Date.now() < breaker.openUntil;
  },
};
