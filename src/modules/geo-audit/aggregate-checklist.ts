import type { PageChecklistSignals, PageExtraction } from '@modules/extraction';

export interface SiteChecklistSignals {
  leadHasDefinition: boolean;
  sectionsInDefinitionBand: number;
  sectionCount: number;
  questionRatio: number;
  questionHeadingCount: number;
  h2h3Count: number;
  imagesWithGoodAlt: number;
  imagesMissingAlt: number;
  imageCount: number;
  videoCount: number;
  videosWithTranscript: number;
  listCount: number;
  skippedHeadingLevels: number;
  explicitCitationCount: number;
  hasAccordingTo: boolean;
  hasCaseStudySection: boolean;
  quantifiedOutcomes: number;
  termDefinitionHits: number;
  authorWithBio: boolean;
  internalLinkCount: number;
  anchorDiversity: number;
  hasPricingLink: boolean;
  hasSignupLink: boolean;
  minHopsToPricing: number | null;
}

export function aggregateChecklist(
  extractions: PageExtraction[],
  rootUrl: string,
): SiteChecklistSignals {
  let leadHasDefinition = false;
  let sectionsInDefinitionBand = 0;
  let sectionCount = 0;
  let questionHeadingCount = 0;
  let h2h3Count = 0;
  let imagesWithGoodAlt = 0;
  let imagesMissingAlt = 0;
  let imageCount = 0;
  let videoCount = 0;
  let videosWithTranscript = 0;
  let listCount = 0;
  let skippedHeadingLevels = 0;
  let explicitCitationCount = 0;
  let hasAccordingTo = false;
  let hasCaseStudySection = false;
  let quantifiedOutcomes = 0;
  let termDefinitionHits = 0;
  let authorWithBio = false;
  let internalLinkCount = 0;
  const anchorSet = new Set<string>();
  let hasPricingLink = false;
  let hasSignupLink = false;

  for (const ext of extractions) {
    const c = ext.checklist;
    if (!c) continue;
    if (ext.url === rootUrl || ext.url.replace(/\/$/, '') === rootUrl.replace(/\/$/, '')) {
      leadHasDefinition = leadHasDefinition || c.definitions.leadHasDefinition;
    }
    sectionsInDefinitionBand += c.definitions.sectionsInDefinitionBand;
    sectionCount += c.definitions.sectionCount;
    questionHeadingCount += c.questionHeadings.questionHeadingCount;
    h2h3Count += c.questionHeadings.h2h3Count;
    imagesWithGoodAlt += c.media.imagesWithGoodAlt;
    imagesMissingAlt += c.media.imagesMissingAlt;
    imageCount += c.media.imageCount;
    videoCount += c.media.videoCount;
    videosWithTranscript += c.media.videosWithTranscript;
    listCount += c.listCount;
    skippedHeadingLevels += c.skippedHeadingLevels;
    explicitCitationCount += c.citations.explicitCitationCount;
    hasAccordingTo = hasAccordingTo || c.citations.hasAccordingTo;
    hasCaseStudySection = hasCaseStudySection || c.caseStudies.hasCaseStudySection;
    quantifiedOutcomes += c.caseStudies.quantifiedOutcomes;
    termDefinitionHits += c.definitions.termDefinitionHits;
    internalLinkCount += c.internalLinks.internalCount;
    hasPricingLink = hasPricingLink || c.internalLinks.hasPricingLink;
    hasSignupLink = hasSignupLink || c.internalLinks.hasSignupLink;
    for (const l of c.internalLinks.uniquePathKinds) {
      anchorSet.add(l);
    }
  }

  for (const ext of extractions) {
    if (ext.authors.some((a) => a.bioSnippet && a.bioSnippet.length > 30)) {
      authorWithBio = true;
      break;
    }
  }

  const minHopsToPricing = computeMinHopsToPricing(rootUrl, extractions);

  return {
    leadHasDefinition,
    sectionsInDefinitionBand,
    sectionCount: Math.max(sectionCount, 1),
    questionRatio: h2h3Count > 0 ? questionHeadingCount / h2h3Count : 0,
    questionHeadingCount,
    h2h3Count,
    imagesWithGoodAlt,
    imagesMissingAlt,
    imageCount,
    videoCount,
    videosWithTranscript,
    listCount,
    skippedHeadingLevels,
    explicitCitationCount,
    hasAccordingTo,
    hasCaseStudySection,
    quantifiedOutcomes,
    termDefinitionHits,
    authorWithBio,
    internalLinkCount,
    anchorDiversity: anchorSet.size,
    hasPricingLink,
    hasSignupLink,
    minHopsToPricing,
  };
}

function computeMinHopsToPricing(
  rootUrl: string,
  extractions: PageExtraction[],
): number | null {
  try {
    const root = new URL(rootUrl);
    const rootPath = root.pathname === '/' ? '/' : root.pathname;
    const graph = new Map<string, Set<string>>();

    for (const ext of extractions) {
      const c = ext.checklist;
      if (!c?.enrichedInternalLinks) continue;
      const fromPath = new URL(ext.url).pathname || '/';
      if (!graph.has(fromPath)) graph.set(fromPath, new Set());
      for (const link of c.enrichedInternalLinks) {
        try {
          const p = new URL(link.href).pathname || '/';
          graph.get(fromPath)!.add(p);
        } catch {
          /* ignore */
        }
      }
    }

    const queue: Array<{ path: string; depth: number }> = [{ path: rootPath, depth: 0 }];
    const seen = new Set<string>([rootPath]);
    while (queue.length > 0) {
      const { path, depth } = queue.shift()!;
      if (/\/pricing|\/plans(\/|$)/i.test(path)) return depth;
      const next = graph.get(path);
      if (!next) continue;
      for (const n of next) {
        if (seen.has(n)) continue;
        seen.add(n);
        queue.push({ path: n, depth: depth + 1 });
      }
    }
    return null;
  } catch {
    return null;
  }
}
