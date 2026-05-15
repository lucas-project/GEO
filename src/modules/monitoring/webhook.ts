import { config } from '@shared/config';
import { logger } from '@shared/logger';
import type { Alert } from './schemas';

const whLogger = logger.child({ module: 'monitoring-webhook' });

export async function postMonitoringAlerts(input: {
  siteUrl: string;
  webhookUrl: string | null;
  runId: string;
  auditId: string | null;
  alerts: Alert[];
}): Promise<void> {
  const url = (input.webhookUrl?.trim() || config.monitoring.defaultWebhookUrl?.trim()) ?? '';
  if (!url || input.alerts.length === 0) return;

  const body = {
    source: 'geo-ai-os',
    siteUrl: input.siteUrl,
    runId: input.runId,
    auditId: input.auditId,
    alertCount: input.alerts.length,
    alerts: input.alerts,
  };

  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    if (!res.ok) {
      whLogger.warn({ url, status: res.status }, 'monitoring webhook non-OK response');
    } else {
      whLogger.info({ url, alertCount: input.alerts.length }, 'monitoring webhook delivered');
    }
  } catch (err) {
    whLogger.warn({ err: (err as Error).message, url }, 'monitoring webhook failed');
  } finally {
    clearTimeout(tid);
  }
}
