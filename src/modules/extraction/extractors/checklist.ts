import type { CheerioAPI } from 'cheerio';
import type { Heading } from '../schemas';
import { extractMediaSignals } from './media';
import { extractDefinitionSignals } from './definitions';
import { extractCitationPhrases } from './citations';
import { extractCaseStudySignals } from './case-studies';
import { extractQuestionHeadings } from './question-headings';
import {
  extractEnrichedInternalLinks,
  summarizeInternalLinks,
  type EnrichedInternalLink,
} from './internal-links';

export interface PageChecklistSignals {
  media: ReturnType<typeof extractMediaSignals>;
  definitions: ReturnType<typeof extractDefinitionSignals>;
  citations: ReturnType<typeof extractCitationPhrases>;
  caseStudies: ReturnType<typeof extractCaseStudySignals>;
  questionHeadings: ReturnType<typeof extractQuestionHeadings>;
  internalLinks: ReturnType<typeof summarizeInternalLinks>;
  enrichedInternalLinks: EnrichedInternalLink[];
  listCount: number;
  skippedHeadingLevels: number;
}

export function computeSkippedHeadingLevels(headings: Heading[]): number {
  let skipped = 0;
  for (let i = 1; i < headings.length; i++) {
    if (headings[i].level - headings[i - 1].level > 1) skipped++;
  }
  return skipped;
}

export function extractPageChecklist(
  $: CheerioAPI,
  headings: Heading[],
  bodyText: string,
  pageUrl: string,
): PageChecklistSignals {
  const enrichedInternalLinks = extractEnrichedInternalLinks($, pageUrl);
  const listCount = $('main ul, main ol, article ul, article ol, body ul, body ol').length;

  return {
    media: extractMediaSignals($),
    definitions: extractDefinitionSignals($, headings, bodyText),
    citations: extractCitationPhrases(bodyText),
    caseStudies: extractCaseStudySignals(bodyText),
    questionHeadings: extractQuestionHeadings(headings),
    internalLinks: summarizeInternalLinks(enrichedInternalLinks),
    enrichedInternalLinks,
    listCount,
    skippedHeadingLevels: computeSkippedHeadingLevels(headings),
  };
}
