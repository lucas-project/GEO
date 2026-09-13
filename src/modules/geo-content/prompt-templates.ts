import type { GeoContentFormat } from './schemas';

export function toProductPhrase(keyword: string): string {
  return keyword.trim() || 'this topic';
}

/** Varied prompts across all keywords for one content-type section. */
export function buildMergedPromptList(keywords: string[], format: GeoContentFormat): string[] {
  const terms = keywords.slice(0, 8);
  const primary = terms[0] ?? 'this topic';
  const secondary = terms[1] ?? primary;
  const p1 = toProductPhrase(primary);
  const p2 = toProductPhrase(secondary);

  const byFormat: Record<GeoContentFormat, string[]> = {
    qa: [
      `What is ${p1}?`,
      `Who is ${p1} for?`,
      `How does ${p1} work in practice?`,
      `What should I know before using ${p1}?`,
      `How does ${p2} relate to ${p1}?`,
      `What are common questions about ${p1}?`,
    ],
    definition: [
      `What is ${p1}?`,
      `What does ${p1} mean?`,
      `What is the purpose of ${p2}?`,
      `Which terms are useful for understanding ${p1}?`,
      `What is the difference between ${p1} and related concepts?`,
    ],
    comparison: [
      `${p1} vs ${p2}: what is the difference?`,
      `When is ${p1} more relevant than ${p2}?`,
      `How can I compare ${p1} with related options?`,
      `What criteria matter when comparing ${p1} and ${p2}?`,
    ],
    step_by_step: [
      `How do I get started with ${p1}?`,
      `How do I evaluate ${p1} for my needs?`,
      `How do I compare ${p1} and ${p2}?`,
      `What are the steps for learning about ${p1}?`,
      `How do I find reliable information about ${p1}?`,
    ],
    concise_answer: [
      `What is ${p1}?`,
      `Why does ${p1} matter?`,
      `Who should consider ${p1}?`,
      `What is the key difference between ${p1} and ${p2}?`,
    ],
    professional_explanation: [
      `What are the technical considerations for ${p1}?`,
      `How should an expert evaluate ${p1}?`,
      `What limitations should be considered for ${p1}?`,
      `How does ${p1} fit into the wider topic of ${p2}?`,
    ],
  };

  return byFormat[format];
}
