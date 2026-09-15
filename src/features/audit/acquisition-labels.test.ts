import { describe, expect, it } from 'vitest';
import type { AuditPageEntry } from '@modules/geo-audit';
import {
  acquisitionBadgeLabel,
  acquisitionUserMessage,
  summarizeAcquisition,
} from './acquisition-labels';

function entry(partial: Partial<AuditPageEntry> & Pick<AuditPageEntry, 'url'>): AuditPageEntry {
  return {
    source: 'sitemap',
    title: null,
    audited: true,
    error: null,
    ...partial,
  };
}

describe('acquisition-labels', () => {
  it('never shows legacy_unknown as primary badge or message', () => {
    const page = entry({
      url: 'https://example.test/old',
      observationStatus: 'legacy_unknown',
    });
    expect(acquisitionBadgeLabel(page)).toBe('Old result — retry needed');
    expect(acquisitionUserMessage(page)).not.toMatch(/legacy_unknown/i);
  });

  it('summarizes observed vs acquisition failures for scoring note', () => {
    const pages = [
      entry({ url: 'https://example.test/a', observationStatus: 'observed' }),
      entry({
        url: 'https://example.test/b',
        observationStatus: 'timeout',
        acquisitionDetail: {
          stage: 'navigation',
          reasonCode: 'nav_timeout',
          userMessage: 'The page may work normally, but GEO could not finish loading it in time.',
          nextAction: 'Try this page again.',
          technicalMessage: 'net::ERR_FAILED',
        },
      }),
      entry({ url: 'https://example.test/c', audited: false, observationStatus: 'not_run' }),
    ];
    const summary = summarizeAcquisition(pages);
    expect(summary.observed).toBe(1);
    expect(summary.summaryLine).toContain('3 pages found');
    expect(summary.summaryLine).toContain('1 read successfully');
    expect(summary.summaryLine).toContain('score uses only the 1 pages read successfully');
    expect(acquisitionUserMessage(pages[1]!)).not.toMatch(/ERR_FAILED|domcontentloaded/i);
  });
});
