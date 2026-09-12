/**
 * Citation tracker — extracts brand/URL citations from AI responses.
 *
 * Regex pass on URLs and brands mentioned in the response text.
 * LLM extraction only when a real AI provider is configured (not mock).
 */

import { z } from 'zod';
import { config } from '@shared/config';
import { ai } from '@shared/ai';
import { logger } from '@shared/logger';
import { CITATION_EXTRACTION_SYSTEM, buildCitationExtractionPrompt } from './prompts/personas';
import type { Citation, BrandMention } from './schemas';

const URL_REGEX = /https?:\/\/[a-z0-9.-]+(?:\/[\w\-./?=&%#]*)?/gi;

/** Brands that must not be counted unless they appear in the response body. */
const BLOCKLIST_BRANDS = new Set(
  ['openai', 'google', 'microsoft', 'amazon', 'anthropic', 'yoast', 'apple'].map((s) => s.toLowerCase()),
);

function extractDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function snippetAround(text: string, idx: number, length: number, window = 60): string {
  const start = Math.max(0, idx - window / 2);
  const end = Math.min(text.length, idx + length + window / 2);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

/** Multi-word brand patterns common in HVAC / B2B answers. */
const KNOWN_BRAND_PATTERNS = [
  'Mitsubishi Electric',
  'Mitsubishi',
  'Daikin',
  'Fujitsu',
  'Panasonic',
  'Midea',
  'Samsung',
  'LG',
  'Carrier',
  'Trane',
  'Hitachi',
  'Haier',
  'HubSpot',
  'Salesforce',
  'Ahrefs',
  'Semrush',
  'Moz',
  'Surfer SEO',
  'Clearscope',
];

function regexCitations(text: string): Citation[] {
  const citations: Citation[] = [];
  let position = 0;

  for (const match of text.matchAll(URL_REGEX)) {
    if (!match[0]) continue;
    position += 1;
    const url = match[0].replace(/[.,;)\]]+$/, '');
    const domain = extractDomain(url);
    citations.push({
      url,
      brand: domain?.split('.')[0] ?? null,
      domain,
      position,
      snippet: snippetAround(text, match.index ?? 0, url.length),
    });
  }

  for (const brand of KNOWN_BRAND_PATTERNS) {
    const re = new RegExp(`\\b${brand.replace(/[.+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (BLOCKLIST_BRANDS.has(brand.toLowerCase())) continue;
      position += 1;
      citations.push({
        url: null,
        brand,
        domain: null,
        position,
        snippet: snippetAround(text, m.index, brand.length),
      });
    }
  }

  return citations;
}

const LlmResponseSchema = z.object({
  citations: z.array(
    z.object({
      brand: z.string().nullable(),
      url: z.string().nullable(),
      domain: z.string().nullable(),
      position: z.number().int().min(1),
      snippet: z.string().nullable(),
    }),
  ),
});

async function llmCitations(text: string): Promise<Citation[]> {
  if (config.ai.provider === 'mock') return [];

  try {
    const { data } = await ai.generateStructuredOutput({
      schema: LlmResponseSchema,
      schemaName: 'CitationExtraction',
      system: CITATION_EXTRACTION_SYSTEM,
      prompt: buildCitationExtractionPrompt(text),
    });
    return data.citations
      .filter((c) => !c.brand || !BLOCKLIST_BRANDS.has(c.brand.toLowerCase()))
      .map((c) => ({
        url: c.url,
        brand: c.brand,
        domain: c.domain ?? extractDomain(c.url),
        position: c.position,
        snippet: c.snippet?.slice(0, 200) ?? null,
      }));
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'LLM citation extraction failed');
    return [];
  }
}

function mergeBrandMentions(...lists: BrandMention[][]): BrandMention[] {
  const counts = new Map<string, number>();
  for (const list of lists) {
    for (const m of list) {
      counts.set(m.brand, (counts.get(m.brand) ?? 0) + m.count);
    }
  }
  return [...counts.entries()]
    .map(([brand, count]) => ({ brand, count }))
    .sort((a, b) => b.count - a.count);
}

export async function extractCitationsForPlatforms(
  platformTexts: Array<{ platform: string; text: string }>,
  mode: 'full' | 'regex' | 'combined-llm',
): Promise<Array<{ citations: Citation[]; brandMentions: BrandMention[] }>> {
  const regexExtracted = await Promise.all(
    platformTexts.map(({ text }) => extractCitations(text, { useLlm: false })),
  );

  if (mode !== 'combined-llm') {
    const useLlm = mode === 'full';
    return Promise.all(
      platformTexts.map(({ text }, i) => {
        if (!useLlm) return regexExtracted[i]!;
        return extractCitations(text, { useLlm: true });
      }),
    );
  }

  const combined = platformTexts.map(({ text }) => text).join('\n\n---\n\n');
  const llmPass = await extractCitations(combined, { useLlm: true });

  return regexExtracted.map(({ citations, brandMentions }, i) => {
    const textLower = platformTexts[i]!.text.toLowerCase();
    const relevantLlmBrands = llmPass.brandMentions.filter((m) =>
      textLower.includes(m.brand.toLowerCase()),
    );
    return {
      citations,
      brandMentions: mergeBrandMentions(brandMentions, relevantLlmBrands),
    };
  });
}

export async function extractCitations(
  text: string,
  options?: { useLlm?: boolean },
): Promise<{
  citations: Citation[];
  brandMentions: BrandMention[];
}> {
  if (!text.trim()) return { citations: [], brandMentions: [] };
  const useLlm = options?.useLlm ?? config.ai.provider !== 'mock';
  const [regexC, llmC] = await Promise.all([
    Promise.resolve(regexCitations(text)),
    useLlm ? llmCitations(text) : Promise.resolve([] as Citation[]),
  ]);

  const merged = new Map<string, Citation>();
  for (const c of [...regexC, ...llmC]) {
    const key = (c.url ?? '') + '|' + (c.brand ?? '');
    if (!merged.has(key) || c.url !== null) merged.set(key, c);
  }
  const citations = [...merged.values()].slice(0, 30);

  const counts = new Map<string, { display: string; count: number }>();
  for (const c of citations) {
    const brand = c.brand ?? null;
    if (!brand || BLOCKLIST_BRANDS.has(brand.toLowerCase())) continue;
    const key = brand.toLowerCase().trim();
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
      if (brand.length < existing.display.length) existing.display = brand;
    } else {
      counts.set(key, { display: brand, count: 1 });
    }
  }
  const brandMentions: BrandMention[] = [...counts.values()]
    .map(({ display, count }) => ({ brand: display, count }))
    .sort((a, b) => b.count - a.count);

  return { citations, brandMentions };
}
