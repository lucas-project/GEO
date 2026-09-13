import type { CrawledPage } from '@modules/crawling';
import type { PageExtraction } from '@modules/extraction';
import type { CriterionResult, EvidenceBundle } from './evidence-schema';

export const READINESS_RULE_VERSION = 'content-readiness-v3.0';

type Rule = {
  id: string;
  weight: number;
  evaluate: (extraction: PageExtraction) => CriterionResult['outcome'];
  reason: string;
};

const RULES: Rule[] = [
  {
    id: 'readiness.semantic_content', weight: 30,
    evaluate: (x) => x.chunks.length > 0 ? 'pass' : 'fail',
    reason: 'Rendered page content was extracted into semantic chunks.',
  },
  {
    id: 'readiness.document_title', weight: 15,
    evaluate: (x) => x.metadata.title?.trim() ? 'pass' : 'fail',
    reason: 'The HTML document title was inspected.',
  },
  {
    id: 'readiness.heading_structure', weight: 20,
    evaluate: (x) => {
      const h1 = x.headings.filter((h) => h.level === 1).length;
      if (h1 === 1) return 'pass';
      return x.headings.length > 0 ? 'partial' : 'fail';
    },
    reason: 'Heading structure was inspected from the rendered document.',
  },
  {
    id: 'readiness.structured_data', weight: 15,
    evaluate: (x) => x.schemas.length > 0 ? 'pass' : 'partial',
    reason: 'JSON-LD extraction completed; the result records whether structured data was found.',
  },
  {
    id: 'readiness.locatable_content', weight: 20,
    evaluate: (x) => x.chunks.some((chunk) => chunk.text.trim().length >= 40) ? 'pass' : x.chunks.length > 0 ? 'partial' : 'fail',
    reason: 'Extracted text chunks were checked for sufficient, locatable content.',
  },
];

function pageEvidence(bundle: EvidenceBundle, page: CrawledPage): string[] {
  const url = page.finalUrl || page.url;
  return bundle.evidence
    .filter((e) => e.finalUrl === url || e.requestedUrl === page.url)
    .map((e) => e.id);
}

function status(page: CrawledPage): CriterionResult['outcome'] {
  return page.fetchStatus === 'observed' || page.renderedHtml ? 'pass' : 'unknown';
}

/**
 * Evaluate only claims that can be reproduced from captured pages. FAQ,
 * author, pricing and off-site signals deliberately stay outside this v3
 * baseline until a page archetype and suitable evidence make them applicable.
 */
export function evaluateReadinessCriteria(input: {
  evidenceBundle: EvidenceBundle;
  pages: Array<{ page: CrawledPage; extraction: PageExtraction }>;
}): CriterionResult[] {
  const results: CriterionResult[] = [];
  for (const { page, extraction } of input.pages) {
    const evidenceIds = pageEvidence(input.evidenceBundle, page);
    const observed = status(page) === 'pass';
    const url = page.finalUrl || page.url;
    results.push({
      criterionId: 'readiness.page_accessible', ruleVersion: READINESS_RULE_VERSION,
      scope: 'page', applicability: 'applicable', outcome: observed ? 'pass' : 'unknown',
      earned: observed ? 20 : null, possible: 20,
      confidence: observed ? 'high' : 'unrated',
      confidenceReason: observed ? 'A rendered page snapshot is available.' : `Page acquisition status: ${page.fetchStatus ?? 'legacy_unknown'}.`,
      evidenceIds, ...(observed ? {} : { missingReason: 'No rendered page snapshot is available.' }),
    });
    for (const rule of RULES) {
      const outcome = observed ? rule.evaluate(extraction) : 'unknown';
      const ratio = outcome === 'pass' ? 1 : outcome === 'partial' ? 0.5 : outcome === 'fail' ? 0 : null;
      results.push({
        criterionId: `${rule.id}:${url}`, ruleVersion: READINESS_RULE_VERSION,
        scope: 'page', applicability: 'applicable', outcome,
        earned: ratio == null ? null : rule.weight * ratio, possible: rule.weight,
        confidence: observed ? 'high' : 'unrated', confidenceReason: rule.reason,
        evidenceIds, ...(outcome === 'unknown' ? { missingReason: 'Page could not be observed.' } : {}),
      });
    }
  }
  return results;
}
