import { config } from '../config.js';
import { logger } from './core.js';

export interface ViolationAlert {
  event: 'violation.critical' | 'session.auto_submitted';
  examId: string;
  examTitle: string;
  sessionId: string;
  candidateName: string;
  userId: string;
  code: string;
  label: string;
  severity: string;
  message: string;
  outcome: string;
  riskScore: number;
  warnings: number;
  maxWarnings: number;
  at: string;
  sessionUrl: string;
}

/**
 * Posts a serious violation to ALERT_WEBHOOK_URL (an n8n webhook) for email/chat alerts.
 * Fire-and-forget: a slow or failing webhook never delays or breaks the exam.
 */
export async function sendAlert(alert: ViolationAlert): Promise<void> {
  if (!config.ALERT_WEBHOOK_URL) return;
  try {
    const res = await fetch(config.ALERT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Alert-Key': config.ALERT_WEBHOOK_KEY },
      body: JSON.stringify(alert),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) logger.warn({ status: res.status, event: alert.event }, 'alert webhook rejected');
  } catch (err) {
    logger.warn({ err: (err as Error).message, event: alert.event }, 'alert webhook unavailable');
  }
}
