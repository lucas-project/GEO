/** Append optional focus keywords to a simulation prompt before sending to the API. */
export function applySimulationKeywords(prompt: string, keywords: string[]): string {
  const trimmed = prompt.trim();
  const terms = keywords.map((k) => k.trim()).filter(Boolean);
  if (!trimmed || terms.length === 0) return trimmed;

  const suffix = `(Relevant products/topics: ${terms.join(', ')})`;
  const lower = trimmed.toLowerCase();
  if (terms.some((t) => lower.includes(t.toLowerCase()))) return trimmed;
  return `${trimmed}\n\n${suffix}`;
}
