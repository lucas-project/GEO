import type { PageChecklistSignals } from './schemas';
import type { PageExtraction } from './schemas';

export function emptyPageChecklist(): PageChecklistSignals {
  return {
    media: {
      imageCount: 0,
      imagesWithGoodAlt: 0,
      imagesMissingAlt: 0,
      videoCount: 0,
      videosWithTranscript: 0,
    },
    definitions: {
      leadHasDefinition: false,
      leadWordCount: 0,
      sectionsInDefinitionBand: 0,
      sectionCount: 1,
      termDefinitionHits: 0,
    },
    citations: {
      explicitCitationCount: 0,
      hasAccordingTo: false,
      hasSourceLabel: false,
      hasYearAndOrg: false,
    },
    caseStudies: {
      caseStudyMentions: 0,
      quantifiedOutcomes: 0,
      hasCaseStudySection: false,
    },
    questionHeadings: {
      questionHeadingCount: 0,
      h2h3Count: 0,
      questionRatio: 0,
    },
    internalLinks: {
      internalCount: 0,
      uniquePathKinds: [],
      hasPricingLink: false,
      hasSignupLink: false,
      anchorDiversity: 0,
    },
    listCount: 0,
    skippedHeadingLevels: 0,
  };
}

/** Shape used when acquisition failed; callers must surface the missing evidence. */
export function emptyPageExtraction(url: string): PageExtraction {
  return {
    url,
    metadata: {
      title: null,
      description: null,
      canonical: null,
      ogTitle: null,
      ogSiteName: null,
      ogDescription: null,
      ogType: null,
      twitterCard: null,
      language: null,
      charset: null,
      robots: null,
    },
    headings: [],
    schemas: [],
    faqs: [],
    entities: [],
    chunks: [],
    links: [],
    tables: [],
    authors: [],
    checklist: emptyPageChecklist(),
  };
}
