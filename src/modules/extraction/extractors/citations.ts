export interface CitationPhraseSignals {
  explicitCitationCount: number;
  hasAccordingTo: boolean;
  hasSourceLabel: boolean;
  hasYearAndOrg: boolean;
}

const ACCORDING_TO = /\b(according to|as reported by|per the|source:)\b/i;
const YEAR_ORG = /\b(20\d{2}|19\d{2})\b.*\b(report|study|survey|research|institute|association)\b/i;

export function extractCitationPhrases(text: string): CitationPhraseSignals {
  const lower = text.toLowerCase();
  const accordingMatches = text.match(/\baccording to\b/gi) ?? [];
  const sourceMatches = text.match(/\bsource:\s*\S+/gi) ?? [];
  const yearOrgMatches = text.match(YEAR_ORG) ?? [];

  return {
    explicitCitationCount: accordingMatches.length + sourceMatches.length + yearOrgMatches.length,
    hasAccordingTo: ACCORDING_TO.test(text),
    hasSourceLabel: /\bsource:\s*\S+/i.test(text),
    hasYearAndOrg: yearOrgMatches.length > 0,
  };
}
