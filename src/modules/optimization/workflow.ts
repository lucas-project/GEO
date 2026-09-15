import { prisma, parseJson } from '@shared/database/client';
import { queue } from '@shared/queue';
import { compareAuditSampleScopes } from '@modules/monitoring';
import type { EvidenceBundle } from '@modules/geo-audit';
import { compareTargetCriteria } from './verification';

export async function disposeArtifact(id: string, disposition: 'applied' | 'dismissed') {
  const row = await prisma.optimizationSuggestion.findUnique({ where: { id } });
  if (!row || !row.generatedContent) throw new Error('A supported draft is required');
  return prisma.optimizationSuggestion.update({ where: { id }, data: {
    disposition, applied: disposition === 'applied', recheckAuditId: null,
  } });
}
export async function recheckArtifact(id: string) {
  const row = await prisma.optimizationSuggestion.findUnique({ where: { id }, include: { audit: true } });
  if (!row || !row.applied) throw new Error('Mark the draft applied before rechecking');
  const pageUrls = parseJson<string[]>(row.audit.sampleManifest, []);
  if (!pageUrls.length) throw new Error('Historical audit has no page manifest. Run a new baseline audit first.');
  return queue.enqueue('geo-audit.run', { url: row.audit.url, pageUrls, maxPages: pageUrls.length,
    recheckOptimizationId: id });
}
export async function readArtifactVerification(id: string) {
  const row = await prisma.optimizationSuggestion.findUnique({ where: { id }, include: { audit: true } });
  if (!row?.recheckAuditId) return { state: 'not_checked', items: [] };
  const after = await prisma.geoAudit.findUnique({ where: { id: row.recheckAuditId } });
  if (!after) return { state: 'unavailable', items: [] };
  const scope = compareAuditSampleScopes(row.audit, after);
  if (!scope.comparable) return { state: 'not_comparable', reason: scope.reason, auditId: after.id, items: [] };
  const criteria = (meta: string) => parseJson<{ evidenceBundle?: EvidenceBundle }>(meta, {});
  const beforeMeta = criteria(row.audit.scoringMeta).evidenceBundle;
  const afterMeta = criteria(after.scoringMeta).evidenceBundle;
  if (!beforeMeta || !afterMeta || !row.targetUrl) {
    return { state: 'cannot_determine', reason: 'Target-page evidence is unavailable for this artifact.', auditId: after.id, items: [] };
  }
  const items = compareTargetCriteria({ before: beforeMeta, after: afterMeta, targetUrl: row.targetUrl, rootUrl: row.audit.url });
  return { state: items.length ? 'checked' : 'no_comparable_issues', auditId: after.id, items };
}
