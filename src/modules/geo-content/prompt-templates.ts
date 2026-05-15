import type { GeoContentFormat } from './schemas';

export function toProductPhrase(keyword: string): string {
  const k = keyword.trim().toLowerCase();
  if (k.includes('condition')) return 'air conditioning';
  if (k === 'hvac') return 'HVAC';
  if (k.includes('split')) return 'split system';
  if (k.includes('duct')) return 'ducted system';
  if (k.includes('inverter')) return 'inverter unit';
  if (k.includes('heat pump')) return 'heat pump';
  if (k.includes('climate')) return 'climate control';
  return keyword;
}

/** Varied prompts across all keywords for one content-type section. */
export function buildMergedPromptList(keywords: string[], format: GeoContentFormat): string[] {
  const terms = keywords.slice(0, 8);
  const primary = terms[0] ?? 'HVAC';
  const secondary = terms[1] ?? primary;
  const p1 = toProductPhrase(primary);
  const p2 = toProductPhrase(secondary);

  const byFormat: Record<GeoContentFormat, string[]> = {
    qa: [
      'Where can I buy and get installation?',
      `What ${p1} models do you stock?`,
      `Do you service ${p2} as well as ${p1}?`,
      'What warranty and after-sales support do you offer?',
      'What energy-efficient or smart features do your units include?',
      'How quiet are your units for bedrooms?',
      'Can I get a quote for a multi-room setup?',
    ],
    definition: [
      'What is a split system?',
      'What is climate control?',
      'What is an inverter compressor?',
      `What is ${p1}?`,
      'What is ducted air conditioning?',
      'What is zoned cooling?',
      'What is SEER / energy rating?',
    ],
    comparison: [
      `${p1} vs ${p2} — which suits my home?`,
      'Inverter vs non-inverter units',
      'Ducted system vs split system',
      'Large outdoor unit vs compact wall-mounted unit',
      'Premium vs entry-level range',
      'Single-zone vs multi-zone setup',
    ],
    step_by_step: [
      `How do I choose the right ${p1} size for my room?`,
      `How do I compare ${p1} and ${p2} options?`,
      'How do I prepare my home before installation?',
      'How do I compare installation quotes?',
      'How do I maintain the system after installation?',
      'How do I know when to replace an old unit?',
    ],
    concise_answer: [
      'How much does running cost per month?',
      'How long does installation take?',
      'Is it suitable for apartments?',
      'Do I need council approval?',
      `Is ${p1} better for cooling or heating?`,
    ],
    professional_explanation: [
      'How does inverter technology work?',
      `How is load calculation done for ${p1}?`,
      'What refrigerant standards apply today?',
      'What are common failure modes in aging systems?',
      'How do building codes affect outdoor unit placement?',
    ],
  };

  return byFormat[format];
}
