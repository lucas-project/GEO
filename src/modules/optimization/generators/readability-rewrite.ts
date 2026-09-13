/**
 * Shorter-sentence rewrites for aiReadability (and when fix guidance asks to shorten).
 */

import { normalizeApostrophes, sanitizeRewriteInput } from './answer-first-rewrite';
import { isDomainLike } from './rewrite-heading';

function firstSentence(text: string): string {
  const t = text.trim();
  const dash = t.match(/^(.+?)\s+—\s+/);
  if (dash) return dash[1].trim();
  const m = t.match(/^(.+?[.!?])(?:\s|$)/);
  return (m?.[1] ?? t.split(/\s+/).slice(0, 25).join(' ')).trim();
}

function normalizeHomePhrase(s: string): string {
  return s
    .replace(/\s+in your home\.?$/i, '')
    .replace(/\s+in the home\.?$/i, '')
    .replace(/\.$/, '')
    .trim();
}

/** Compress long "heating and cooling …" purpose phrases. */
function compressPurpose(purpose: string): string {
  const p = normalizeHomePhrase(purpose);
  if (/heating and cooling/i.test(p)) {
    if (/individual rooms|specific areas|zones|single room/i.test(p)) {
      return 'room-by-room heating and cooling';
    }
    return 'heating and cooling';
  }
  const words = p.split(/\s+/);
  if (words.length > 8) return words.slice(0, 8).join(' ');
  return p;
}

function pickVariant(variants: string[], variantIndex: number): string {
  if (variants.length === 0) return '';
  return variants[variantIndex % variants.length];
}

function ausTopShortVariants(subject: string, purpose: string): string[] {
  const subjLower = subject.toLowerCase();
  return [
    `${subject} are Australia's top pick for ${purpose}.`,
    `In Australia, ${subjLower} lead the market for ${purpose}.`,
    `${subject} are ideal for ${purpose}.`,
    `${subject} are the go-to option for ${purpose} in Australia.`,
    `For ${purpose}, ${subjLower} are Australia's most popular choice.`,
  ];
}

function uniqueVariants(variants: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of variants) {
    const key = normalizeApostrophes(v).replace(/\.$/, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v.endsWith('.') ? v : `${v}.`);
  }
  return out;
}

function tightenGeneric(first: string, variantIndex: number): string {
  const s = normalizeApostrophes(first).replace(/\.$/, '');
  const candidates = [
    s.replace(/\bindividual rooms or specific areas\b/i, 'single rooms or zones'),
    s.replace(/\bAustralia's top choice\b/i, "Australia's top pick"),
    s.replace(/\bAustralia's top pick\b/i, "Australia's leading option"),
    s.replace(/\bmost popular\b/i, 'the top'),
    `${s.split(/\s+/).slice(0, 14).join(' ')}.`,
  ].map((line) => (line.endsWith('.') ? line : `${line}.`));

  const variants = uniqueVariants(candidates);
  if (variants.length === 0) return `${s}.`;
  return pickVariant(variants, variantIndex);
}

export function wantsShorterSentence(fixHint?: string, problem?: string): boolean {
  const t = `${fixHint ?? ''} ${problem ?? ''}`.toLowerCase();
  return /shorter sentence|sentence[s]? (are |is )?too long|too long|shorten|more concise|keep it brief/i.test(
    t,
  );
}

export function buildReadabilityRewrite(input: {
  text: string;
  variantIndex?: number;
}): string {
  const sanitized = normalizeApostrophes(sanitizeRewriteInput(input.text));
  if (!sanitized) return '';

  const variantIndex = input.variantIndex ?? 0;
  const first = normalizeApostrophes(firstSentence(sanitized)).replace(/\.$/, '');
  const ausTop = first.match(/^(.+?)\s+are\s+Australia's\s+top\s+choice\s+for\s+(.+)$/i);
  if (ausTop) {
    const subject = ausTop[1].trim();
    const purpose = compressPurpose(ausTop[2]);
    const variants = uniqueVariants(ausTopShortVariants(subject, purpose));
    if (variants.length > 0) {
      return pickVariant(variants, variantIndex);
    }
  }

  const topChoice = first.match(
    /^(.+?)\s+are\s+(?:the\s+)?(?:top|best|leading|preferred)\s+choice\s+for\s+(.+)$/i,
  );
  if (topChoice) {
    const subject = topChoice[1].trim();
    const purpose = compressPurpose(topChoice[2]);
    const variants = uniqueVariants([
      `${subject} are the top pick for ${purpose}.`,
      `${subject} work best for ${purpose}.`,
      `For ${purpose}, ${subject.toLowerCase()} are a leading option.`,
      `In Australia, ${subject.toLowerCase()} are popular for ${purpose}.`,
    ]);
    if (variants.length > 0) return pickVariant(variants, variantIndex);
  }

  const sv = first.match(/^(.+?)\s+(are|is)\s+(.+)$/i);
  if (sv && !isDomainLike(sv[1].trim())) {
    const subject = sv[1].trim();
    const verb = sv[2].toLowerCase();
    const rawPred = sv[3].trim();
    const embeddedTop = rawPred.match(/Australia's\s+top\s+choice\s+for\s+(.+)/i);
    if (embeddedTop) {
      const variants = uniqueVariants(
        ausTopShortVariants(subject, compressPurpose(embeddedTop[1])),
      );
      if (variants.length > 0) return pickVariant(variants, variantIndex);
    }
    const pred = compressPurpose(rawPred);
    const short = `${subject} ${verb} ${pred}.`;
    const variants = uniqueVariants([
      short,
      `In Australia, ${subject.toLowerCase()} ${verb} ${pred}.`,
      `${subject} ${verb} ${pred} in Australian homes.`,
    ]);
    if (variants.length > 0) return pickVariant(variants, variantIndex);
  }

  return tightenGeneric(first, variantIndex);
}

export function rewriteReadabilityLocal(input: {
  firstChunk: string;
  variantIndex?: number;
}): { rewritten: string; rationale: string } {
  const rewritten = buildReadabilityRewrite({
    text: input.firstChunk,
    variantIndex: input.variantIndex,
  }).trim();

  return {
    rewritten: rewritten || input.firstChunk.trim(),
    rationale:
      'Shortened rewrite from your highlighted text (mock/offline mode). For AI rewrites, set AI_PROVIDER=openai and an API key in .env.',
  };
}
