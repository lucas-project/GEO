/**
 * Extract a JSON object/array from model text (handles markdown fences).
 */

export function extractJsonBlock(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const startObj = trimmed.indexOf('{');
  const startArr = trimmed.indexOf('[');
  let start = -1;
  if (startObj >= 0 && (startArr < 0 || startObj < startArr)) start = startObj;
  else if (startArr >= 0) start = startArr;
  if (start > 0) return trimmed.slice(start);
  return trimmed;
}
