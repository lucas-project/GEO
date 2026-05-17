/**
 * Stable issue keys for cross-audit aggregation and fix-outcome tracking.
 */

import type { Dimension } from '@modules/geo-audit';

export function slugifyReason(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

export function buildIssueKey(dimension: Dimension, title: string): string {
  const slug = slugifyReason(title) || 'unknown';
  return `${dimension}:${slug}`;
}
