/**
 * Plain-language labels and explanations for cohort benchmark insights.
 */

import type { BenchmarkInsight, InsightKind, PatternType } from './schemas';
import type { PatternStatMetadata } from './schemas';

const PATTERN_TITLES: Record<string, string> = {
  'multi-chunk': 'Content split into clear sections',
  'answer-first-majority': 'Answers stated upfront in most sections',
  'has-faq': 'FAQ-style questions on the page',
  'clean-h1-h2': 'Clean heading hierarchy (one main title, clear sections)',
  'has-comparison': 'Comparison tables (e.g. plans or products)',
  'organization-present': 'Organization name clearly identified',
  'ai-readability-high': 'Text that is easy for AI to read',
  'target-visible': 'Site already showing up in AI simulations',
  FAQPage: 'FAQ structured data (FAQPage schema)',
  Organization: 'Organization structured data',
  Product: 'Product structured data',
  Article: 'Article structured data',
  WebSite: 'Website structured data',
  BreadcrumbList: 'Breadcrumb structured data',
};

const PATTERN_EXPLANATIONS: Record<string, string> = {
  'multi-chunk':
    'Pages are broken into several focused sections instead of one long block. AI tools retrieve smaller chunks when answering questions — sites with clear sections often score higher in our comparisons.',
  'answer-first-majority':
    'Most content blocks lead with a direct answer, then supporting detail. That matches how ChatGPT, Perplexity, and others prefer to quote sources.',
  'has-faq':
    'Explicit question-and-answer content (on the page or in structured data) gives AI models ready-made snippets to cite.',
  'clean-h1-h2':
    'A single main title and logical section headings help AI understand what the page is about and which part answers which question.',
  'has-comparison':
    'Tables that compare options are easy for AI to summarize when users ask “which is better” or “what’s the difference.”',
  'organization-present':
    'Your brand or organization is clearly named in content or markup, so AI answers can attribute information to the right source.',
  'ai-readability-high':
    'Sentence length, structure, and formatting make the page easy to parse — not too dense, not too thin.',
  'target-visible':
    'In our AI simulation runs, this site already appears in answers sometimes. Patterns here reflect what worked for sites that get cited.',
};

const CATEGORY_INTROS: Record<BenchmarkInsight['category'], string> = {
  structure:
    'How your pages are organized — headings, sections, and layout — compared with similar sites.',
  content: 'What kind of content and markup you use versus sites that score well in AI search.',
  citations:
    'How often sites like yours get mentioned when we test real AI answers with your brand.',
  platform:
    'Differences we see when the same pattern is tested across ChatGPT, Gemini, Claude, or Perplexity.',
  readability: 'How readable your text is for AI, compared with high-scoring sites in the cohort.',
};

export function plainCategoryLabel(category: BenchmarkInsight['category']): string {
  const labels: Record<BenchmarkInsight['category'], string> = {
    structure: 'Page structure',
    content: 'Content & markup',
    citations: 'AI citations',
    platform: 'By AI platform',
    readability: 'Readability',
  };
  return labels[category] ?? category;
}

export function plainCategoryIntro(category: BenchmarkInsight['category']): string {
  return CATEGORY_INTROS[category] ?? '';
}

export function plainPatternTitle(patternType: PatternType, patternKey: string): string {
  if (PATTERN_TITLES[patternKey]) return PATTERN_TITLES[patternKey];
  if (patternType === 'schema') return `${patternKey} structured data on the page`;
  return patternKey.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function plainPatternExplanation(patternType: PatternType, patternKey: string): string {
  if (PATTERN_EXPLANATIONS[patternKey]) return PATTERN_EXPLANATIONS[patternKey];
  if (patternType === 'schema') {
    return `${patternKey} markup helps search and AI systems understand what type of content the page is (product, FAQ, organization, etc.).`;
  }
  return 'This pattern was detected across multiple audited sites. We compare average GEO scores for sites that have it versus sites that do not.';
}

export function plainCohortLabel(cohortKey: string): string {
  if (cohortKey === 'global') return 'all audited sites in our database';
  if (cohortKey.startsWith('vertical:')) {
    const v = cohortKey.slice('vertical:'.length);
    return `sites in the “${v}” category`;
  }
  if (cohortKey.startsWith('platform:')) {
    const p = cohortKey.slice('platform:'.length);
    const names: Record<string, string> = {
      openai: 'ChatGPT',
      anthropic: 'Claude',
      gemini: 'Gemini',
      perplexity: 'Perplexity',
    };
    return `AI answers on ${names[p] ?? p}`;
  }
  if (cohortKey.startsWith('scoreBand:')) return 'high-scoring sites (80+)';
  return 'similar sites in our database';
}

function sampleSizePhrase(n: number): string {
  if (n >= 50) return `Based on ${n} audited sites`;
  if (n >= 20) return `Based on ${n} sites we have compared`;
  return `Early signal from ${n} sites (more audits improve accuracy)`;
}

export interface BenchmarkCopyInput {
  insightKind: InsightKind;
  patternType: PatternType;
  patternKey: string;
  cohortKey: string;
  sampleCount: number;
  youHavePattern?: boolean;
  liftPoints?: number;
  liftPercent?: number;
  yourScore?: number;
  avgOverallScore?: number;
  meta?: PatternStatMetadata;
}

export function buildBenchmarkCopy(input: BenchmarkCopyInput): {
  title: string;
  summary: string;
  explanation: string;
  message: string;
} {
  const title = plainPatternTitle(input.patternType, input.patternKey);
  const patternExplain = plainPatternExplanation(input.patternType, input.patternKey);
  const cohort = plainCohortLabel(input.cohortKey);
  const sample = sampleSizePhrase(input.sampleCount);
  const youHave = input.youHavePattern === true;
  const missing = input.youHavePattern === false;
  const pts = input.liftPoints;
  const pct = input.liftPercent;

  let summary: string;
  let explanation: string;

  if (input.insightKind === 'citation_lift' && input.meta?.citationRateWith != null) {
    const lift = Math.round(
      ((input.meta.citationRateWith ?? 0) - (input.meta.citationRateWithout ?? 0)) * 100,
    );
    summary = youHave
      ? `Your site is cited about ${lift} percentage points more often in AI tests when this pattern is present.`
      : `Sites with this pattern are cited about ${lift} points more often in our AI simulations.`;
    explanation = `${sample} in ${cohort}. ${patternExplain}`;
  } else if (input.insightKind === 'platform' && pts != null) {
    const plat = plainCohortLabel(input.cohortKey);
    summary = `This pattern is linked to about ${pts} extra GEO points ${plat}.`;
    explanation = `${sample}. ${patternExplain} Platform-specific effects can vary — use simulations to confirm for your brand.`;
  } else if (pts != null && pts > 0) {
    if (youHave) {
      summary = 'Already on your site.';
      explanation = `${sample} in ${cohort}. ${patternExplain} See the chart for how much this pattern tends to raise scores in our data. Focus on other gaps if your overall score is still low.`;
    } else if (missing) {
      summary = 'Not detected on your site — worth adding.';
      explanation = `${sample} in ${cohort}. ${patternExplain} The chart shows average scores for sites with vs. without this pattern.`;
    } else {
      summary = 'Correlates with higher scores in our cohort.';
      explanation = `${sample} in ${cohort}. ${patternExplain}`;
    }
  } else if (input.avgOverallScore != null) {
    summary = `Sites with this pattern average ${input.avgOverallScore} out of 100 in ${cohort}.`;
    if (input.yourScore != null) {
      summary += ` Your latest score is ${input.yourScore}.`;
    }
    explanation = `${sample}. ${patternExplain}`;
  } else {
    summary = `We see this pattern across ${cohort}.`;
    explanation = `${sample}. ${patternExplain}`;
  }

  const message = `${summary} ${explanation}`;

  return { title, summary, explanation, message };
}

export function enrichBenchmarkInsight(
  insight: Omit<BenchmarkInsight, 'title' | 'summary' | 'explanation'> & {
    title?: string;
    summary?: string;
    explanation?: string;
  },
  meta?: PatternStatMetadata,
): BenchmarkInsight {
  const copy = buildBenchmarkCopy({
    insightKind: insight.insightKind,
    patternType: insight.patternType,
    patternKey: insight.patternKey,
    cohortKey: insight.cohortKey,
    sampleCount: insight.sampleCount,
    youHavePattern: insight.youHavePattern,
    liftPoints: insight.liftPoints,
    liftPercent: insight.liftPercent,
    yourScore: insight.yourScore,
    avgOverallScore: insight.avgOverallScore,
    meta,
  });
  return {
    ...insight,
    title: insight.title ?? copy.title,
    summary: insight.summary ?? copy.summary,
    explanation: insight.explanation ?? copy.explanation,
    message: copy.message,
    withPatternAvgScore:
      insight.withPatternAvgScore ??
      (meta?.withPatternAvgScore != null ? Math.round(meta.withPatternAvgScore) : undefined),
    withoutPatternAvgScore:
      insight.withoutPatternAvgScore ??
      (meta?.withoutPatternAvgScore != null
        ? Math.round(meta.withoutPatternAvgScore)
        : undefined),
  };
}
