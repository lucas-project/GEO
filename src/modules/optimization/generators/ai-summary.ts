/**
 * AI summary block generator — LLM-driven.
 */

import { z } from 'zod';
import { ai } from '@shared/ai';
import { config } from '@shared/config';
import { AI_SUMMARY_SYSTEM, buildAiSummaryPrompt } from '../prompts';

const ResponseSchema = z.object({
  summary: z.string(),
  rationale: z.string(),
});

export async function generateAiSummary(input: {
  title: string;
  bodyText: string;
}): Promise<{ summary: string; rationale: string; htmlBlock: string }> {
  let data: z.infer<typeof ResponseSchema>;
  try {
    if (config.runtime.mode !== 'paid-assisted' && config.runtime.mode !== 'local-assisted') throw new Error('Use extracted text');
    ({ data } = await ai.generateStructuredOutput({
      schema: ResponseSchema,
      schemaName: 'AiSummary',
      system: AI_SUMMARY_SYSTEM,
      prompt: buildAiSummaryPrompt(input),
    }));
  } catch {
    const lead = input.bodyText.slice(0, 220).trim() || input.title;
    data = {
      summary: lead,
      rationale: 'Fallback summary from page text (AI generation unavailable).',
    };
  }

  const htmlBlock = `<div class="ai-summary" itemscope itemtype="https://schema.org/Article">
  <h2 class="visually-hidden">Summary</h2>
  <p itemprop="abstract">${escapeHtml(data.summary)}</p>
</div>`;

  return {
    summary: data.summary,
    rationale: data.rationale,
    htmlBlock,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
