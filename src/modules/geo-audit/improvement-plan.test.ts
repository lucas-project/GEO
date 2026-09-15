import { expect, it } from 'vitest';
import { buildImprovementPlan } from './improvement-plan';
import type { GeoAuditResult } from './schemas';

it('does not recommend FAQ or Product markup for a documentation-only sample', () => {
  const audit = {
    id: 'a', siteId: null, url: 'https://example.test/docs', overallScore: 30,
    dimensions: { citationFriendliness: { score: 20, reasons: [] } },
    narrative: '', topIssues: [], createdAt: '', status: 'completed',
    topFixes: [
      { id: 'faq', title: 'FAQ', description: '', effort: 'low', dimension: 'citationFriendliness', artifactType: 'faq-schema' },
      { id: 'product', title: 'Product', description: '', effort: 'low', dimension: 'structuredContent', artifactType: 'product-schema' },
      { id: 'metadata', title: 'Metadata', description: '', effort: 'low', dimension: 'crawlerFriendliness', artifactType: 'metadata' },
    ],
    pageInventory: { auditedCount: 1, discoveredCount: 1, pages: [{ url: 'https://example.test/docs', source: 'seed', audited: true, archetype: 'documentation' }] },
  } as unknown as GeoAuditResult;
  const titles = buildImprovementPlan(audit).map(item => item.title);
  expect(titles.some(title => /FAQ|Product/i.test(title))).toBe(false);
  expect(titles.some(title => /Metadata/i.test(title))).toBe(true);
});
