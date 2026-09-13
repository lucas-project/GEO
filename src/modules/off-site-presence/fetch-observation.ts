import type { FetchedPage } from './platforms/types';

export function classifyHttpObservation(statusCode: number, html: string): {
  status: NonNullable<FetchedPage['observationStatus']>;
  blockReason?: string;
} {
  const blocked = statusCode === 403 || /captcha|verify you are human|access denied|bot detection/i.test(html);
  if (statusCode === 429) return { status: 'rate_limited' };
  if (blocked) return { status: 'blocked', blockReason: 'HTTP response indicates bot protection or access denial' };
  if (statusCode >= 400) return { status: 'unreachable' };
  return { status: 'observed' };
}
