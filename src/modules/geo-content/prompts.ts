import type { GeoContentKeyword } from './keywords';
import { FORMAT_LABELS, FORMAT_PROMPT_GUIDE, GEO_CONTENT_FORMATS, MAX_KEYWORDS_FOR_IDEAS } from './formats';
import { buildMergedPromptList } from './prompt-templates';
import type { GeoContentPack, GeoContentSection } from './schemas';

export const GEO_CONTENT_SYSTEM = `You are a GEO content strategist.

You receive a list of SHORT keywords (1–3 words) from a website. Produce ONE prompt list per content type (6 sections total) covering ALL keywords together.

Rules:
- Exactly 6 sections: qa, step_by_step, comparison, definition, concise_answer, professional_explanation.
- Each section has 6–10 varied prompts. Prompts ONLY — no answers.
- Spread coverage across the keyword list — do NOT duplicate the same questions for every keyword.
- Q&A: real buyer questions to this business (natural wording, not the full page title).
- Definition: "What is …?" for concepts evidenced by the site.
- Comparison: specific pairings only when both topics are evidenced by the site.
- Do not repeat the same prompt in multiple sections.`;

export function keywordsForIdeas(keywords: GeoContentKeyword[]): GeoContentKeyword[] {
  return keywords.slice(0, MAX_KEYWORDS_FOR_IDEAS);
}

export function buildGeoContentPrompt(input: {
  url: string;
  title: string;
  description: string;
  headings: string[];
  keywords: GeoContentKeyword[];
}): string {
  const terms = keywordsForIdeas(input.keywords).map((k) => k.term);
  const headingBlock = input.headings.length ? input.headings.map((h) => `- ${h}`).join('\n') : '(none)';

  const formatRules = GEO_CONTENT_FORMATS.map(
    (f) => `  ${f} (${FORMAT_LABELS[f]}): ${FORMAT_PROMPT_GUIDE[f]}`,
  ).join('\n');

  return `Target website: ${input.url}
Page title (context only): ${input.title || '(unknown)'}
Meta description: ${input.description || '(none)'}

Headings:
${headingBlock}

BEGIN_SITE_KEYWORDS
${terms.map((t) => `- ${t}`).join('\n')}
END_SITE_KEYWORDS

Create exactly ${GEO_CONTENT_FORMATS.length} sections — ONE per format for the whole site (not per keyword):

${formatRules}

Return JSON: inferredTopic, audience, positioning, sections[] with { format, prompts[] } only.`;
}

export function packFromFallback(input: {
  url: string;
  title: string;
  keywords: GeoContentKeyword[];
}): GeoContentPack {
  const topic =
    input.title?.trim().split(/[｜|–—:]/)[0]?.trim() ||
    (() => {
      try {
        return new URL(input.url.includes('://') ? input.url : `https://${input.url}`).hostname;
      } catch {
        return input.url;
      }
    })();

  const ideaKeywords = keywordsForIdeas(input.keywords);
  const terms = ideaKeywords.map((k) => k.term);
  const promptTerms = terms.length > 0 ? terms : ['this website'];

  const sections: GeoContentSection[] = GEO_CONTENT_FORMATS.map((format) => ({
    format,
    prompts: buildMergedPromptList(promptTerms, format),
  }));

  return {
    inferredTopic: terms.length > 0 ? trimTopic(topic) : 'Insufficient topic evidence',
    audience:
      terms.length > 0
        ? 'People seeking clear, evidence-backed information about this topic'
        : 'Unknown — page lacks clear theme signals',
    positioning:
      terms.length > 0
        ? 'Publish direct answers grounded in the site so readers and answer engines can understand the topic.'
        : 'No reliable theme keywords were extracted; regenerate after auditing a content-rich page.',
    sections,
  };
}

function trimTopic(title: string): string {
  const first = title.split(/[｜|–—:]/)[0]?.trim() ?? title;
  const words = first.split(/\s+/).slice(0, 5);
  const t = words.join(' ');
  return t.length <= 48 ? t : t.slice(0, 45) + '…';
}
