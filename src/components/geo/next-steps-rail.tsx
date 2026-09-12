/**
 * NextStepsRail — post-audit contextual next actions.
 *
 * Renders 3-4 ranked cards based on audit data already in hand.
 * Each card links to the relevant feature with pre-filled context.
 * Server component — no client state needed.
 */

import Link from 'next/link';
import { ArrowRight, Sparkles, Globe, TrendingUp, Wrench } from 'lucide-react';
import { DIMENSION_LABELS, type Dimension, countSimulationPrompts, simulationPromptText } from '@modules/geo-audit';
import type { GeoAuditResult } from '@modules/geo-audit';

/** Maps a fix artifact type to the optimize page type param. */
const ARTIFACT_LABELS: Record<string, string> = {
  'faq-schema': 'FAQ schema',
  'llms-txt': 'llms.txt',
  'ai-summary': 'AI summary',
  'answer-first': 'Answer-first rewrite',
  'product-schema': 'Product schema',
  metadata: 'Metadata patch',
};

interface NextStepCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
  accent?: boolean;
}

function NextStepCard({ icon, title, description, href, accent }: NextStepCardProps) {
  return (
    <Link
      href={href}
      className={`group flex flex-col gap-2 rounded-xl border p-4 transition-all hover:shadow-sm ${
        accent
          ? 'border-accent/30 bg-accent/5 hover:border-accent/50'
          : 'border-border bg-bg-elevated hover:border-border-strong'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${accent ? 'bg-accent/15 text-accent' : 'bg-bg-muted text-fg-muted'}`}>
          {icon}
        </span>
        <ArrowRight className="w-4 h-4 text-fg-subtle opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <div>
        <p className="text-sm font-medium text-fg">{title}</p>
        <p className="text-xs text-fg-muted leading-relaxed mt-0.5">{description}</p>
      </div>
    </Link>
  );
}

interface NextStepsRailProps {
  audit: GeoAuditResult;
}

export function NextStepsRail({ audit }: NextStepsRailProps) {
  const { scoringMeta, topFixes, dimensions } = audit;

  const steps: NextStepCardProps[] = [];

  // 1. Simulate — use first suggested question if available, otherwise fall back to generic link
  const firstSuggestedPrompt = scoringMeta?.suggestedSimulationPrompts?.[0];
  const firstPromptText = firstSuggestedPrompt
    ? simulationPromptText(firstSuggestedPrompt)
    : undefined;
  const simulateHref = firstPromptText
    ? `/simulate?prompt=${encodeURIComponent(firstPromptText)}`
    : '/simulate';
  const promptCount = countSimulationPrompts(scoringMeta?.suggestedSimulationPrompts);
  steps.push({
    icon: <Sparkles className="w-4 h-4" />,
    title: 'Test AI visibility',
    description:
      promptCount > 0
        ? `${promptCount} tailored question${promptCount !== 1 ? 's' : ''} generated for your site. See how ChatGPT, Gemini, Claude, and Perplexity answer them.`
        : 'Simulate how AI search engines answer queries in your space and whether your brand is cited.',
    href: simulateHref,
    accent: promptCount > 0,
  });

  // 2. Optimize — pick the top fix artifact that addresses the weakest dimension
  const topArtifactFix = topFixes.find((f) => f.artifactType && f.artifactType !== 'generic');
  if (topArtifactFix?.artifactType) {
    steps.push({
      icon: <Wrench className="w-4 h-4" />,
      title: `Generate ${ARTIFACT_LABELS[topArtifactFix.artifactType] ?? topArtifactFix.artifactType}`,
      description: `Fixes "${DIMENSION_LABELS[topArtifactFix.dimension as Dimension] ?? topArtifactFix.dimension}" — your ${topArtifactFix.effort}-effort highest-impact fix.`,
      href: `/optimize?auditId=${audit.id}&type=${topArtifactFix.artifactType}`,
    });
  } else {
    steps.push({
      icon: <Wrench className="w-4 h-4" />,
      title: 'Generate fixes',
      description: 'Auto-generate FAQ schema, llms.txt, answer-first rewrites, and structured markup for your site.',
      href: `/optimize?auditId=${audit.id}`,
    });
  }

  // 3. Presence — scan if not done, or review action plan if already scanned
  if (!scoringMeta?.offSitePresenceReport) {
    steps.push({
      icon: <Globe className="w-4 h-4" />,
      title: 'Scan off-site presence',
      description: 'Find where your brand is missing on Reddit, Trustpilot, G2, and web search. Improves your AI citation score.',
      href: `/presence?url=${encodeURIComponent(audit.url)}`,
    });
  } else {
    steps.push({
      icon: <Globe className="w-4 h-4" />,
      title: 'Review off-site action plan',
      description: 'Profiles to claim, threads to join, and community gaps — based on your latest presence scan.',
      href: '/presence',
    });
  }

  // 4. Competitors — pre-populate with suggested competitors if available
  const suggestedCompetitors = scoringMeta?.suggestedCompetitors ?? [];
  const competitorsHref =
    suggestedCompetitors.length > 0
      ? `/competitors?target=${encodeURIComponent(audit.url)}&suggested=${encodeURIComponent(suggestedCompetitors.slice(0, 3).join(','))}`
      : `/competitors`;

  // Find the weakest dimension for context
  const weakestEntry = (Object.entries(dimensions) as [Dimension, { score: number }][]).reduce(
    (a, b) => (a[1].score < b[1].score ? a : b),
  );

  steps.push({
    icon: <TrendingUp className="w-4 h-4" />,
    title: suggestedCompetitors.length > 0 ? `Compare against ${suggestedCompetitors.length} suggested competitors` : 'Compare with competitors',
    description: `See dimension gaps vs. competing sites${weakestEntry ? ` — especially "${DIMENSION_LABELS[weakestEntry[0]]}"` : ''}.`,
    href: competitorsHref,
  });

  if (steps.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="text-sm font-medium text-fg-muted uppercase tracking-wider mb-3">What to do next</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {steps.map((step) => (
          <NextStepCard key={step.href} {...step} />
        ))}
      </div>
    </div>
  );
}
