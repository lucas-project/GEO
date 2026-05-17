/**
 * Lightweight page discovery before a full audit — delegates to GEO discovery engine.
 */

import { discoverGeoPages } from '@modules/geo-discovery/server';
import type { AuditPageEntry } from './schemas';

export interface DiscoverAuditPagesResult {
  url: string;
  pages: AuditPageEntry[];
  suggestedUrls: string[];
  maxSelectable: number;
  discoveredCount: number;
  probedCount: number;
}

export async function discoverAuditPages(rawUrl: string): Promise<DiscoverAuditPagesResult> {
  const result = await discoverGeoPages(rawUrl);
  return {
    url: result.url,
    pages: result.pages,
    suggestedUrls: result.suggestedUrls,
    maxSelectable: result.maxSelectable,
    discoveredCount: result.discoveredCount,
    probedCount: result.probedCount,
  };
}
