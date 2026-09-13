import type { CrawledPage, CrawlResult } from '@modules/crawling';
import type { PageExtraction } from '@modules/extraction';
import { buildSiteProfile } from '@modules/extraction';
import { buildEvidenceBundle } from './evidence';
import { evaluateReadinessCriteria } from './criteria';
import { computeReadinessScore, type ReadinessScore } from './scoring-v3';
import type { ScoringMeta } from './schemas';

/** One pure assembly path for report facts produced from a crawl snapshot. */
export function recomputeAuditPresentation(input: {
  siteUrl: string;
  crawl: CrawlResult;
  pageExtractions: Array<{ page: CrawledPage; extraction: PageExtraction }>;
  legacyScoringMeta: ScoringMeta;
}): { scoringMeta: ScoringMeta; readiness: ReadinessScore } {
  const evidenceBundle = buildEvidenceBundle({ crawl: input.crawl, pageExtractions: input.pageExtractions });
  const criteria = evaluateReadinessCriteria({ evidenceBundle, pages: input.pageExtractions });
  const readiness = computeReadinessScore(criteria);
  const siteProfile = buildSiteProfile({
    siteUrl: input.siteUrl,
    pages: input.pageExtractions.map(({ page, extraction }) => ({ pageUrl: page.finalUrl || page.url, extraction })),
    evidenceBundle,
  });
  return {
    readiness,
    scoringMeta: {
      ...input.legacyScoringMeta,
      scoreVersion: 'content-readiness-v3', coverage: readiness.coverage,
      evidenceBundle, siteProfile, readiness,
    },
  };
}
