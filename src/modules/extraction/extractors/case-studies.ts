const CASE_STUDY_BLOCK =
  /\b(case study|customer story|success story|client story)\b/i;

const QUANTIFIED_OUTCOME =
  /\b(\d{1,3}%\s*(increase|decrease|growth|reduction|improvement)|increased by \d|reduced by \d|saved \$\d)/i;

export interface CaseStudySignals {
  caseStudyMentions: number;
  quantifiedOutcomes: number;
  hasCaseStudySection: boolean;
}

export function extractCaseStudySignals(text: string): CaseStudySignals {
  const caseStudyMentions = (text.match(CASE_STUDY_BLOCK) ?? []).length;
  const quantifiedOutcomes = (text.match(QUANTIFIED_OUTCOME) ?? []).length;
  return {
    caseStudyMentions,
    quantifiedOutcomes,
    hasCaseStudySection: caseStudyMentions > 0 && quantifiedOutcomes > 0,
  };
}
