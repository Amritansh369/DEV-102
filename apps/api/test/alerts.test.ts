import { afterEach, describe, expect, it, vi } from 'vitest';

const cfg = vi.hoisted(() => ({ ALERT_WEBHOOK_URL: 'https://n8n.example.com/webhook/alerts', ALERT_WEBHOOK_KEY: 'k1' }));
vi.mock('../src/config.js', () => ({ config: cfg }));
vi.mock('../src/lib/core.js', () => ({ logger: { warn: vi.fn() } }));

const { sendAlert } = await import('../src/lib/alerts.js');
const { logger } = await import('../src/lib/core.js');

const alert = {
  event: 'violation.critical' as const, examId: 'exam-1', examTitle: 'Campus Placement Test', sessionId: 'sess-1',
  candidateName: 'Asha Rao', userId: 'asha01', code: 'VM_DETECTED', label: 'Virtual machine', severity: 'CRITICAL',
  message: 'The exam is running inside a virtual machine', outcome: 'WARNING', riskScore: 50, warnings: 1, maxWarnings: 2,
  at: '2026-10-28T10:00:00.000Z', sessionUrl: 'http://localhost:3000/proctor/sessions/sess-1',
};

afterEach(() => { cfg.ALERT_WEBHOOK_URL = 'https://n8n.example.com/webhook/alerts'; vi.unstubAllGlobals(); });

describe('sendAlert', () => {
  it('posts the alert as JSON with the shared key', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await sendAlert(alert);
    expect(fetchMock).toHaveBeenCalledWith('https://n8n.example.com/webhook/alerts', expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ 'X-Alert-Key': 'k1' }), body: JSON.stringify(alert),
    }));
  });

  it('does nothing when no webhook is configured', async () => {
    cfg.ALERT_WEBHOOK_URL = '';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await sendAlert(alert);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('logs and never throws when the webhook fails or rejects', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    await expect(sendAlert(alert)).resolves.toBeUndefined();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 403 })));
    await expect(sendAlert(alert)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });
});
