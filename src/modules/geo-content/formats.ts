import type { GeoContentFormat } from './schemas';

export const GEO_CONTENT_FORMATS: GeoContentFormat[] = [
  'qa',
  'step_by_step',
  'comparison',
  'definition',
  'concise_answer',
  'professional_explanation',
];

export const MAX_KEYWORDS_FOR_IDEAS = 4;

export const FORMAT_LABELS: Record<GeoContentFormat, string> = {
  qa: 'Q&A',
  step_by_step: 'Step-by-step',
  comparison: 'Comparison',
  definition: 'Definition',
  concise_answer: 'Concise answer',
  professional_explanation: 'Professional explanation',
};

/** What each section should contain — shown in UI and sent to the model. */
export const FORMAT_PROMPT_GUIDE: Record<GeoContentFormat, string> = {
  qa: 'Real questions a customer would ask this business. Questions only — no answers.',
  step_by_step:
    'How-to or process questions / step titles someone would search for (e.g. "How do I choose the right size?"). No full steps or answers.',
  comparison:
    'Specific comparison angles using only site-evidenced terms (e.g. "Option A vs Option B"). Pairings only — no verdict write-up.',
  definition:
    'Definition-style questions for terms evidenced by this site. Questions only — not full definitions.',
  concise_answer:
    'Short, direct questions that deserve a 1–3 sentence answer (voice/search snippets). Questions only.',
  professional_explanation:
    'Expert-level questions a professional or serious buyer would ask about the topic. Questions only — no long explanations.',
};
