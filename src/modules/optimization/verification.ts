import type { CriterionResult, EvidenceBundle } from '@modules/geo-audit';
import { canonicalPageUrl } from '@/lib/website-url';

type EvidenceMeta = Pick<EvidenceBundle, 'evidence' | 'criteria'>;

function criteriaForTarget(meta: EvidenceMeta, targetUrl: string, rootUrl: string): CriterionResult[] {
  const target = canonicalPageUrl(targetUrl, rootUrl);
  const evidenceById = new Map(meta.evidence.map((evidence) => [evidence.id, evidence]));
  return meta.criteria.filter((criterion) =>
    criterion.evidenceIds.some((id) => {
      const evidence = evidenceById.get(id);
      return evidence && canonicalPageUrl(evidence.finalUrl || evidence.requestedUrl, rootUrl) === target;
    }),
  );
}

export function compareTargetCriteria(input: {
  before: EvidenceMeta;
  after: EvidenceMeta;
  targetUrl: string;
  rootUrl: string;
}) {
  const before = criteriaForTarget(input.before, input.targetUrl, input.rootUrl);
  const after = criteriaForTarget(input.after, input.targetUrl, input.rootUrl);
  return before.filter((criterion) => criterion.outcome !== 'pass').map((criterion) => {
    const next = after.find((candidate) =>
      candidate.criterionId === criterion.criterionId && candidate.ruleVersion === criterion.ruleVersion,
    );
    return {
      criterionId: criterion.criterionId,
      before: criterion.outcome,
      after: next?.outcome ?? 'unknown',
      state: !next || next.outcome === 'unknown'
        ? 'cannot_determine'
        : next.outcome === 'pass'
          ? 'resolved'
          : 'still_present',
    };
  });
}
