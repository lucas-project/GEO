import { DIMENSION_LABELS, type Dimension, type GeoAuditResult } from './schemas';
import { countSimulationPrompts } from './simulation-prompts';

export type ImprovementPlanItemKind =
  | 'fix'
  | 'issue'
  | 'simulate'
  | 'presence-scan'
  | 'presence-review'
  | 'competitors';

export type ImprovementPlanItemStatus = 'pending' | 'done';

export interface ImprovementPlanItem {
  id: string;
  rank: number;
  kind: ImprovementPlanItemKind;
  title: string;
  description: string;
  effort: 'low' | 'medium' | 'high';
  href: string;
  status: ImprovementPlanItemStatus;
}

export const ARTIFACT_LABELS: Record<string, string> = {
  'faq-schema': 'FAQ schema',
  'llms-txt': 'llms.txt',
  'ai-summary': 'AI summary',
  'answer-first': 'Answer-first rewrite',
  'product-schema': 'Product schema',
  metadata: 'Metadata patch',
};

function weakestDimension(audit: GeoAuditResult): Dimension {
  return (Object.entries(audit.dimensions) as [Dimension, { score: number }][]).reduce((a, b) =>
    a[1].score < b[1].score ? a : b,
  )[0];
}

function pushItem(
  items: Omit<ImprovementPlanItem, 'rank'>[],
  item: Omit<ImprovementPlanItem, 'rank'>,
  seen: Set<string>,
): void {
  if (seen.has(item.id)) return;
  seen.add(item.id);
  items.push(item);
}

/** Build a ranked improvement plan from audit data — no LLM, pure heuristics. */
export function buildImprovementPlan(audit: GeoAuditResult): ImprovementPlanItem[] {
  const { scoringMeta, topFixes, topIssues } = audit;
  const weakest = weakestDimension(audit);
  const dimLabel = (d: Dimension) => DIMENSION_LABELS[d] ?? d;
  const items: Omit<ImprovementPlanItem, 'rank'>[] = [];
  const seen = new Set<string>();

  const hasPresenceScan = Boolean(scoringMeta?.offSitePresenceReport);
  const hasVisibilityCheck = Boolean(scoringMeta?.simulationVisibilityCheck);
  const promptCount = countSimulationPrompts(scoringMeta?.suggestedSimulationPrompts);
  const suggestedCompetitors = scoringMeta?.suggestedCompetitors ?? [];

  // 1. Top artifact fix for weakest dimension (or first artifact fix)
  const primaryFix =
    topFixes.find(
      (f) => f.artifactType && f.artifactType !== 'generic' && f.dimension === weakest,
    ) ?? topFixes.find((f) => f.artifactType && f.artifactType !== 'generic');

  if (primaryFix?.artifactType) {
    const label = ARTIFACT_LABELS[primaryFix.artifactType] ?? primaryFix.artifactType;
    pushItem(items, {
      id: `fix-${primaryFix.id}`,
      kind: 'fix',
      title: `Generate ${label}`,
      description: `Fixes ${dimLabel(primaryFix.dimension as Dimension)} — your ${primaryFix.effort}-effort highest-impact on-site change.`,
      effort: primaryFix.effort,
      href: `/optimize?auditId=${audit.id}&type=${primaryFix.artifactType}`,
      status: 'pending',
    }, seen);
  }

  // Additional artifact fixes (excluding primary)
  for (const fix of topFixes) {
    if (items.length >= 7) break;
    if (!fix.artifactType || fix.artifactType === 'generic') continue;
    if (primaryFix && fix.id === primaryFix.id) continue;
    const label = ARTIFACT_LABELS[fix.artifactType] ?? fix.artifactType;
    pushItem(items, {
      id: `fix-${fix.id}`,
      kind: 'fix',
      title: `Generate ${label}`,
      description: `Improves ${dimLabel(fix.dimension as Dimension)}.`,
      effort: fix.effort,
      href: `/optimize?auditId=${audit.id}&type=${fix.artifactType}`,
      status: 'pending',
    }, seen);
  }

  // 2. High-severity issues without a matching fix artifact
  const fixDimensions = new Set(topFixes.filter((f) => f.artifactType).map((f) => f.dimension));
  let issueCount = 0;
  for (const issue of topIssues) {
    if (items.length >= 7 || issueCount >= 2) break;
    if (!['critical', 'high'].includes(issue.severity)) continue;
    if (fixDimensions.has(issue.dimension)) continue;
    pushItem(items, {
      id: `issue-${issue.id}`,
      kind: 'issue',
      title: issue.title,
      description:
        issue.summaryPlain ??
        `Address this to improve ${dimLabel(issue.dimension)}.`,
      effort: issue.severity === 'critical' ? 'high' : 'medium',
      href: `#issue-${issue.id}`,
      status: 'pending',
    }, seen);
    issueCount++;
  }

  // 3. Batch AI visibility check
  if (promptCount > 0) {
    pushItem(items, {
      id: 'simulate-batch',
      kind: 'simulate',
      title: hasVisibilityCheck
        ? 'Re-check AI visibility'
        : `Check if AI search engines cite you (${promptCount} questions)`,
      description: hasVisibilityCheck
        ? `${scoringMeta!.simulationVisibilityCheck!.promptsCiting} of ${scoringMeta!.simulationVisibilityCheck!.promptsTested} questions cited you last time. Run again after fixes.`
        : `Test all ${promptCount} tailored questions on ChatGPT, Gemini, Claude, and Perplexity.`,
      effort: 'low',
      href: `/simulate?batch=1&auditId=${audit.id}`,
      status: hasVisibilityCheck ? 'done' : 'pending',
    }, seen);
  } else {
    pushItem(items, {
      id: 'simulate-single',
      kind: 'simulate',
      title: 'Test AI visibility',
      description: 'See how AI search engines answer queries in your space and whether your brand is cited.',
      effort: 'low',
      href: '/simulate',
      status: 'pending',
    }, seen);
  }

  // 4. Presence
  if (!hasPresenceScan) {
    pushItem(items, {
      id: 'presence-scan',
      kind: 'presence-scan',
      title: 'Scan off-site presence',
      description: 'Find where your brand is missing on Reddit, reviews, and forums — then update your audit score.',
      effort: 'medium',
      href: `/presence?url=${encodeURIComponent(audit.url)}`,
      status: 'pending',
    }, seen);
  } else {
    pushItem(items, {
      id: 'presence-review',
      kind: 'presence-review',
      title: 'Review off-site action plan',
      description: 'Profiles to claim, threads to join, and community gaps from your latest scan.',
      effort: 'low',
      href: '/presence',
      status: 'done',
    }, seen);
  }

  // 5. Competitors
  if (suggestedCompetitors.length > 0) {
    pushItem(items, {
      id: 'competitors',
      kind: 'competitors',
      title: `Compare with ${suggestedCompetitors.length} competitors`,
      description: `See dimension gaps vs. competing sites — especially ${dimLabel(weakest)}.`,
      effort: 'low',
      href: `/competitors?target=${encodeURIComponent(audit.url)}&suggested=${encodeURIComponent(suggestedCompetitors.slice(0, 3).join(','))}`,
      status: 'pending',
    }, seen);
  } else {
    pushItem(items, {
      id: 'competitors',
      kind: 'competitors',
      title: 'Compare with competitors',
      description: `See how you stack up on AI visibility — especially ${dimLabel(weakest)}.`,
      effort: 'low',
      href: `/competitors?target=${encodeURIComponent(audit.url)}`,
      status: 'pending',
    }, seen);
  }

  return items.slice(0, 7).map((item, i) => ({ ...item, rank: i + 1 }));
}
