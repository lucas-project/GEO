import type { PageChecklistSignals } from './schemas';

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
