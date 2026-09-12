import type { CheerioAPI } from 'cheerio';
import type { Heading } from '../schemas';

const DEFINITION_OPENER =
  /\b(is|are|means|refers to|defined as)\b/i;

const TERM_DEF_PATTERN =
  /\b([A-Z][A-Za-z0-9-]{2,30})\s+(?:is|are|means|refers to)\s+/;

export interface DefinitionSignals {
  leadHasDefinition: boolean;
  leadWordCount: number;
  sectionsInDefinitionBand: number;
  sectionCount: number;
  termDefinitionHits: number;
}

export function extractDefinitionSignals(
  $: CheerioAPI,
  headings: Heading[],
  bodyText: string,
): DefinitionSignals {
  const firstP = $('main p, article p, body p').first().text().replace(/\s+/g, ' ').trim();
  const lead = firstP || bodyText.slice(0, 400);
  const leadWords = lead.split(/\s+/).filter(Boolean);
  const leadSlice = leadWords.slice(0, 60).join(' ');
  const leadHasDefinition =
    leadWords.length >= 12 && DEFINITION_OPENER.test(leadSlice);

  const paragraphs = bodyText.split(/\n\n+|\.\s+(?=[A-Z])/);
  let sectionsInDefinitionBand = 0;
  for (const p of paragraphs) {
    const wc = p.split(/\s+/).filter(Boolean).length;
    if (wc >= 40 && wc <= 75 && DEFINITION_OPENER.test(p)) sectionsInDefinitionBand++;
  }
  const h2h3 = headings.filter((h) => h.level === 2 || h.level === 3);

  const termDefinitionHits = (bodyText.match(TERM_DEF_PATTERN) ?? []).length;

  return {
    leadHasDefinition,
    leadWordCount: leadWords.length,
    sectionsInDefinitionBand,
    sectionCount: h2h3.length || 1,
    termDefinitionHits,
  };
}
