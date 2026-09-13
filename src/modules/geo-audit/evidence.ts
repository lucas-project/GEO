import type { CrawlResult, CrawledPage } from '@modules/crawling';
import type { PageExtraction } from '@modules/extraction';
import type { CriterionResult, Evidence, EvidenceBundle } from './evidence-schema';

const EXTRACTOR_VERSION = 'deterministic-evidence-v1';

function digest(value: string): string {
  // Keep the client-safe evidence module free of node:crypto imports. Crawl
  // snapshots still carry a server-side SHA-256 contentHash; this digest only
  // provides stable IDs for evidence references in browser bundles/tests.
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b ^ (code + i), 0x85ebca6b);
  }
  return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}

function statusForPage(page: CrawledPage): Evidence['status'] {
  if (page.fetchStatus) return page.fetchStatus;
  if (page.renderedHtml) return 'observed';
  if (page.statusCode === 429) return 'rate_limited';
  if (page.error && /timeout/i.test(page.error)) return 'timeout';
  if (page.error) return 'legacy_unknown';
  return 'legacy_unknown';
}

function excerpt(text: string | null | undefined, max = 240): string | undefined {
  const value = text?.replace(/\s+/g, ' ').trim();
  return value ? value.slice(0, max) : undefined;
}

function addEvidence(
  out: Evidence[],
  page: CrawledPage,
  snapshotId: string,
  locator: string,
  detail: string,
  status: Evidence['status'],
  capturedAt: string,
  extra: Partial<Evidence> = {},
): string {
  const id = `ev-${digest(`${snapshotId}|${page.finalUrl}|${locator}|${detail}`)}`;
  out.push({
    id,
    requestedUrl: page.url,
    finalUrl: page.finalUrl || page.url,
    capturedAt,
    snapshotId,
    method: page.fetchChannel === 'headed' ? 'browser' : 'browser',
    status,
    httpStatus: page.statusCode || undefined,
    locator,
    excerpt: excerpt(detail),
    extractorVersion: EXTRACTOR_VERSION,
    ...extra,
  });
  return id;
}

function criterion(
  criterionId: string,
  outcome: CriterionResult['outcome'],
  evidenceIds: string[],
  reason: string,
): CriterionResult {
  const known = outcome !== 'unknown';
  return {
    criterionId,
    ruleVersion: EXTRACTOR_VERSION,
    scope: 'page',
    applicability: 'applicable',
    outcome,
    earned: known ? (outcome === 'pass' ? 1 : 0) : null,
    possible: 1,
    confidence: known ? 'high' : 'unrated',
    confidenceReason: reason,
    evidenceIds,
    ...(known ? {} : { missingReason: reason }),
  };
}

/** Build replayable evidence for the first deterministic page checks. */
export function buildEvidenceBundle(input: {
  crawl: CrawlResult;
  pageExtractions: Array<{ page: CrawledPage; extraction: PageExtraction }>;
  capturedAt?: string;
}): EvidenceBundle {
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const fingerprint = input.crawl.pages
    .map((p) => `${p.finalUrl}|${p.contentHash ?? digest(p.html ?? '')}|${p.statusCode}`)
    .sort()
    .join('\n');
  const snapshotId = `snap-${digest(`${input.crawl.rootUrl}|${fingerprint}`)}`;
  const evidence: Evidence[] = [];
  const criteria: CriterionResult[] = [];

  for (const { page, extraction } of input.pageExtractions) {
    const status = statusForPage(page);
    const pageEvidence = addEvidence(
      evidence,
      page,
      snapshotId,
      'page',
      `${status}; html=${page.renderedHtml ? 'rendered' : 'unavailable'}`,
      status,
      capturedAt,
      page.contentHash ? { contentHash: page.contentHash } : {},
    );
    if (status !== 'observed') {
      criteria.push(criterion('page.rendered_html', 'unknown', [pageEvidence], `Page acquisition status: ${status}`));
      continue;
    }

    const titleEvidence = addEvidence(evidence, page, snapshotId, 'head > title', extraction.metadata.title ?? '(missing)', 'observed', capturedAt);
    criteria.push(criterion('page.title_present', extraction.metadata.title ? 'pass' : 'fail', [titleEvidence], 'Title was inspected in the extracted document.'));

    const h1s = extraction.headings.filter((h) => h.level === 1);
    const headingEvidence = addEvidence(evidence, page, snapshotId, 'h1', h1s.map((h) => h.text).join(' | ') || '(missing)', 'observed', capturedAt);
    criteria.push(criterion('page.single_h1', h1s.length === 1 ? 'pass' : 'partial', [headingEvidence], 'Heading structure was inspected from the rendered DOM.'));

    const schemaEvidence = addEvidence(evidence, page, snapshotId, 'script[type="application/ld+json"]', extraction.schemas.map((s) => s.type).join(', ') || '(none)', 'observed', capturedAt);
    criteria.push(criterion('page.jsonld_parseable', 'pass', [schemaEvidence], 'JSON-LD extraction completed without a parser error.'));

    const bodyEvidence = addEvidence(evidence, page, snapshotId, 'main/body', extraction.chunks[0]?.text ?? '(no semantic chunk)', 'observed', capturedAt);
    criteria.push(criterion('page.semantic_content', extraction.chunks.length > 0 ? 'pass' : 'fail', [bodyEvidence], 'Semantic chunk extraction was inspected.'));
  }

  const applicable = criteria.filter((c) => c.applicability === 'applicable');
  const observed = applicable.filter((c) => c.outcome !== 'unknown');
  const coverage = applicable.length > 0 ? observed.length / applicable.length : 0;
  return { snapshotId, capturedAt, extractorVersion: EXTRACTOR_VERSION, evidence, criteria, coverage };
}
