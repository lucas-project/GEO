/**
 * Per-layer evidence digests for pipeline transparency UI.
 */

import type { CrawlResult } from '@modules/crawling';
import type { PageExtraction } from '@modules/extraction';
import { selectAuditRootPage } from './root-page';
import {
  PRESENCE_PLATFORMS,
  PLATFORM_LABELS,
  type PresenceSignals,
} from '@modules/brand-presence';
import type { PresenceProbeResult } from '@modules/brand-presence-probe';
import type { OffSitePresenceReport } from '@modules/off-site-presence';
import { PLATFORM_IDS } from '@modules/off-site-presence';
import type { SiteChecklistSignals } from './checklist-schema';
import type { PageExtractionInput } from './scoring';
import {
  DIMENSION_LAYERS,
  type Dimension,
  type DimensionScore,
  type GateApplied,
  type LayerEvidence,
  type LayerEvidenceItem,
  type ScoreLayer,
  SCORE_LAYERS,
} from './schemas';
import { GATE_LAYERS, plainGateExplanation } from './plain-language';

export interface BuildLayerEvidenceInput {
  dimensions: Record<Dimension, DimensionScore>;
  gatesApplied: GateApplied[];
  crawl: CrawlResult;
  rootUrl: string;
  pageExtractions?: PageExtractionInput[];
  presenceSignals?: PresenceSignals;
  presenceProbe?: PresenceProbeResult;
  offSitePresenceReport?: OffSitePresenceReport;
  siteChecklist?: SiteChecklistSignals;
  auxiliaryScores?: {
    technicalPerformance?: number;
    topicCoverage?: number;
  };
  citationSnapshotVisibility?: number;
  shareOfModel?: number;
}

function pathFromUrl(url: string, rootUrl: string): string {
  try {
    return new URL(url, rootUrl).pathname || '/';
  } catch {
    return url;
  }
}

function auditedPaths(input: BuildLayerEvidenceInput): string[] {
  const paths: string[] = [];
  const add = (url: string) => {
    const p = pathFromUrl(url, input.rootUrl);
    if (!paths.includes(p)) paths.push(p);
  };
  for (const p of input.crawl.pages) add(p.finalUrl || p.url);
  if (input.pageExtractions) {
    for (const { page } of input.pageExtractions) add(page.finalUrl || page.url);
  }
  if (paths.length === 0) add(input.rootUrl);
  return paths;
}

function allExtractions(input: BuildLayerEvidenceInput): PageExtraction[] {
  if (input.pageExtractions?.length) {
    return input.pageExtractions.map((p) => p.extraction);
  }
  return [];
}

function dimensionsInLayer(
  layer: ScoreLayer,
  dimensions: Record<Dimension, DimensionScore>,
): string[] {
  const factors: string[] = [];
  for (const dim of Object.keys(dimensions) as Dimension[]) {
    if (DIMENSION_LAYERS[dim] === layer) {
      factors.push(...dimensions[dim].reasons);
    }
  }
  return factors;
}

function gatesForLayer(layer: ScoreLayer, gates: GateApplied[]): string[] {
  return gates
    .filter((g) => GATE_LAYERS[g.type]?.includes(layer))
    .map((g) => plainGateExplanation(g));
}

function scoreFactors(
  layer: ScoreLayer,
  dimensions: Record<Dimension, DimensionScore>,
  gates: GateApplied[],
): string[] {
  const factors = dimensionsInLayer(layer, dimensions);
  const gateFactors = gatesForLayer(layer, gates);
  return [...factors, ...gateFactors];
}

function buildFoundation(input: BuildLayerEvidenceInput, pages: string[]): LayerEvidence {
  const extractions = allExtractions(input);
  const schemaTypes = new Set(extractions.flatMap((e) => e.schemas.map((s) => s.type)));
  const crawlFindings: LayerEvidenceItem[] = [];

  const robots = input.crawl.robots;
  crawlFindings.push({
    label: robots.fetched
      ? robots.allowed
        ? 'robots.txt allows crawling'
        : 'robots.txt disallows or restricts crawling'
      : 'robots.txt not fetched',
  });
  if (schemaTypes.size > 0) {
    crawlFindings.push({
      label: `JSON-LD types: ${[...schemaTypes].slice(0, 8).join(', ')}${schemaTypes.size > 8 ? '…' : ''}`,
    });
  }

  const perf = selectAuditRootPage(input.crawl.pages, input.crawl.rootUrl)?.performance;
  if (perf?.lcpMs != null) {
    crawlFindings.push({
      label: `Homepage LCP: ${Math.round(perf.lcpMs)}ms`,
      detail:
        perf.lcpMs <= 2000
          ? 'Good for render stability'
          : perf.lcpMs <= 3500
            ? 'Moderate — may affect crawl quality'
            : 'Slow — may limit AI-readable render',
    });
  }
  if (perf?.mobileBodyTextLength != null) {
    crawlFindings.push({
      label: `Mobile body text: ${perf.mobileBodyTextLength} characters`,
    });
  }

  const aux = input.auxiliaryScores;
  if (aux?.technicalPerformance != null) {
    crawlFindings.push({
      label: `Technical performance score: ${aux.technicalPerformance}/100`,
    });
  }
  if (aux?.topicCoverage != null) {
    crawlFindings.push({
      label: `Topic coverage (embeddings): ${aux.topicCoverage}/100`,
    });
  }

  const pageCount = pages.length;
  return {
    layer: 'foundation',
    methodology: `We rendered ${pageCount} page${pageCount === 1 ? '' : 's'} with Playwright, checked robots.txt and sitemap access, and parsed JSON-LD and heading structure on each page.`,
    pagesAudited: pages,
    crawlFindings,
    externalFindings: [],
    scoreFactors: scoreFactors('foundation', input.dimensions, input.gatesApplied),
  };
}

function buildUnderstanding(input: BuildLayerEvidenceInput, pages: string[]): LayerEvidence {
  const extractions = allExtractions(input);
  const entityCount = extractions.reduce((n, e) => n + e.entities.length, 0);
  const chunkCount = extractions.reduce((n, e) => n + e.chunks.length, 0);
  const checklist = input.siteChecklist;
  const crawlFindings: LayerEvidenceItem[] = [
    { label: `${entityCount} named entities extracted across audited pages` },
    { label: `${chunkCount} content chunks for AI parsing` },
  ];

  if (checklist) {
    if (checklist.termDefinitionHits > 0) {
      crawlFindings.push({
        label: `${checklist.termDefinitionHits} inline term definitions`,
      });
    }
    if (checklist.skippedHeadingLevels > 0) {
      crawlFindings.push({
        label: `${checklist.skippedHeadingLevels} skipped heading levels`,
        detail: 'May reduce semantic clarity for LLMs',
      });
    }
    if (checklist.h2h3Count > 0) {
      crawlFindings.push({
        label: `${checklist.h2h3Count} H2/H3 sections`,
      });
    }
    if (checklist.authorWithBio) {
      crawlFindings.push({ label: 'Author bio detected' });
    }
  }

  return {
    layer: 'understanding',
    methodology:
      'We extracted entities, chunks, trust signals, and checklist signals (definitions, headings, media alt text) from each audited page.',
    pagesAudited: pages,
    crawlFindings,
    externalFindings: [],
    scoreFactors: scoreFactors('understanding', input.dimensions, input.gatesApplied),
  };
}

function buildPresence(input: BuildLayerEvidenceInput, pages: string[]): LayerEvidence {
  const signals = input.presenceSignals;
  const probe = input.presenceProbe;
  const deepReport = input.offSitePresenceReport;
  const crawlFindings: LayerEvidenceItem[] = [];
  const externalFindings: LayerEvidenceItem[] = [];

  if (signals) {
    for (const platform of PRESENCE_PLATFORMS) {
      const entry = signals.platforms[platform];
      if (!entry.linked) continue;
      const label = PLATFORM_LABELS[platform];
      const url = entry.urls[0];
      const fromPages = entry.foundOnPages?.length
        ? entry.foundOnPages.join(', ')
        : undefined;
      crawlFindings.push({
        label: `${label}${url ? ` → ${url}` : ''}`,
        detail: fromPages ? `Linked from ${fromPages}` : undefined,
        url,
      });
    }
    if (signals.sameAsCount > 0) {
      crawlFindings.push({
        label: `Organization sameAs: ${signals.sameAsCount} URL${signals.sameAsCount === 1 ? '' : 's'}`,
        detail: signals.sameAsUrls.slice(0, 3).join('; '),
      });
    }
    if (signals.hasPricingPage) crawlFindings.push({ label: 'Pricing page linked' });
    if (signals.hasComparePage) crawlFindings.push({ label: 'Comparison page linked' });
  }

  if (probe?.verifiedPlatforms?.length) {
    for (const p of probe.verifiedPlatforms) {
      externalFindings.push({
        label: `Search-verified: ${PLATFORM_LABELS[p] ?? p}`,
      });
    }
  }
  if (probe?.redditMentionEstimate != null && probe.redditMentionEstimate > 0) {
    externalFindings.push({
      label: `~${probe.redditMentionEstimate} Reddit search hit${probe.redditMentionEstimate === 1 ? '' : 's'}`,
    });
  }
  if (probe?.mediaMentions != null && probe.mediaMentions > 0) {
    externalFindings.push({
      label: `${probe.mediaMentions} authority media mention${probe.mediaMentions === 1 ? '' : 's'}`,
    });
  }

  if (deepReport) {
    externalFindings.push({
      label: `Deep scan influence: ${deepReport.scores.total}/100 (${deepReport.scores.band.replace(/_/g, ' ')})`,
      detail: `Reviews ${deepReport.scores.reviews}/40 · Community ${deepReport.scores.community}/35 · Media ${deepReport.scores.media}/25`,
    });
    for (const id of PLATFORM_IDS) {
      const p = deepReport.platforms[id];
      if (!p || p.status === 'unreachable') continue;
      externalFindings.push({
        label: `${PLATFORM_LABELS[id as keyof typeof PLATFORM_LABELS] ?? id}: ${p.status}`,
        detail: p.message,
        url: p.url,
      });
    }
    if (deepReport.engagement.redditTopPosts[0]) {
      const top = deepReport.engagement.redditTopPosts[0];
      externalFindings.push({
        label: `Top Reddit: ${top.title.slice(0, 80)}`,
        detail: `${top.upvotes}↑ ${top.comments} comments`,
        url: top.url,
      });
    }
  }

  const pageCount = pages.length;
  const brand = deepReport?.entity.primaryBrand ?? probe?.brandName ?? 'brand';
  const domain = probe?.siteDomain ?? pathFromUrl(input.rootUrl, input.rootUrl);
  const searchMode =
    probe?.source === 'serper' || probe?.source === 'tavily' ? 'search-verified' : 'crawl-only';
  const queryCount = probe?.searchQueries?.length ?? 0;

  let methodology = `We scanned outbound links in the full page HTML (including footer and navigation) on ${pageCount} audited page${pageCount === 1 ? '' : 's'}, read Organization sameAs JSON-LD`;
  if (deepReport) {
    methodology += `, and ran a live Playwright probe across Reddit, Quora, G2, Capterra, and Trustpilot for "${brand}".`;
  } else if (searchMode === 'search-verified' && queryCount > 0) {
    methodology += `, and ran ${queryCount} web searches for brand "${brand}" and domain ${domain} (Serper).`;
  } else {
    methodology += ' (crawl-only — no external search API configured).';
  }

  return {
    layer: 'presence',
    methodology,
    pagesAudited: pages,
    searchQueries: probe?.searchQueries?.map((q) => ({
      query: q.query,
      resultCount: q.resultCount,
      topHits: q.topHits,
    })),
    crawlFindings,
    externalFindings,
    scoreFactors: scoreFactors('presence', input.dimensions, input.gatesApplied),
  };
}

function buildGeneration(input: BuildLayerEvidenceInput, pages: string[]): LayerEvidence {
  const checklist = input.siteChecklist;
  const crawlFindings: LayerEvidenceItem[] = [];

  if (checklist) {
    if (checklist.leadHasDefinition) {
      crawlFindings.push({ label: 'Opening section has a definitional lead' });
    }
    if (checklist.sectionsInDefinitionBand > 0) {
      crawlFindings.push({
        label: `${checklist.sectionsInDefinitionBand}/${checklist.sectionCount} sections in ideal 40–60 word definition length`,
      });
    }
    if (checklist.questionHeadingCount > 0) {
      crawlFindings.push({
        label: `${checklist.questionHeadingCount} question-style headings (${Math.round(checklist.questionRatio * 100)}% of H2/H3)`,
      });
    }
    if (checklist.listCount > 0) {
      crawlFindings.push({ label: `${checklist.listCount} bulleted/numbered lists` });
    }
  }

  return {
    layer: 'generation',
    methodology:
      'We scored answer-first structure, chunk sizes, summarization signals, and checklist items (definitional leads, section lengths, question headings).',
    pagesAudited: pages,
    crawlFindings,
    externalFindings: [],
    scoreFactors: scoreFactors('generation', input.dimensions, input.gatesApplied),
  };
}

function buildOutcome(input: BuildLayerEvidenceInput, pages: string[]): LayerEvidence {
  const extractions = allExtractions(input);
  const types = new Set(extractions.flatMap((e) => e.schemas.map((s) => s.type)));
  const checklist = input.siteChecklist;
  const crawlFindings: LayerEvidenceItem[] = [];
  const externalFindings: LayerEvidenceItem[] = [];

  if (types.has('FAQPage')) crawlFindings.push({ label: 'FAQ schema present' });
  if (types.has('Product') || types.has('SoftwareApplication')) {
    crawlFindings.push({ label: 'Product / SoftwareApplication schema' });
  }
  if (input.presenceSignals?.hasPricingPage) {
    crawlFindings.push({ label: 'Pricing page in site graph' });
  }
  if (input.presenceSignals?.hasPrimaryCta) {
    crawlFindings.push({ label: 'Primary CTA detected on homepage' });
  }
  if (checklist?.hasCaseStudySection) {
    crawlFindings.push({ label: 'Case study section detected' });
  }
  if (checklist && checklist.quantifiedOutcomes > 0) {
    crawlFindings.push({
      label: `${checklist.quantifiedOutcomes} quantified outcome statements`,
    });
  }

  if (input.citationSnapshotVisibility != null) {
    externalFindings.push({
      label: `Citation snapshot visibility: ${Math.round(input.citationSnapshotVisibility * 100)}%`,
    });
  }
  if (input.shareOfModel != null) {
    externalFindings.push({
      label: `Share of Model: ${Math.round(input.shareOfModel * 100)}%`,
    });
  }

  return {
    layer: 'outcome',
    methodology:
      'We combined citation-friendly markup (FAQ, product schema), commercial readiness (pricing, CTAs, trust), and optional citation simulation / snapshot data.',
    pagesAudited: pages,
    crawlFindings,
    externalFindings,
    scoreFactors: scoreFactors('outcome', input.dimensions, input.gatesApplied),
  };
}

const BUILDERS: Record<
  ScoreLayer,
  (input: BuildLayerEvidenceInput, pages: string[]) => LayerEvidence
> = {
  foundation: buildFoundation,
  understanding: buildUnderstanding,
  presence: buildPresence,
  generation: buildGeneration,
  outcome: buildOutcome,
};

export function buildLayerEvidence(input: BuildLayerEvidenceInput): Record<ScoreLayer, LayerEvidence> {
  const pages = auditedPaths(input);
  const result = {} as Record<ScoreLayer, LayerEvidence>;
  for (const layer of SCORE_LAYERS) {
    result[layer] = BUILDERS[layer](input, pages);
  }
  return result;
}
