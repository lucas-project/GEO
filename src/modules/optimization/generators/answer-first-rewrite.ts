/**
 * Shared rule-based answer-first rewrites (mock mode + suggested examples).
 * Always produces wording different from the source while keeping facts.
 */

import { isDomainLike, resolveRewriteHeading } from './rewrite-heading';

function firstSentence(text: string): string {
  const t = text.trim();
  const dash = t.match(/^(.+?)\s+—\s+/);
  if (dash) return dash[1].trim();
  const m = t.match(/^(.+?[.!?])(?:\s|$)/);
  return (m?.[1] ?? t.split(/\s+/).slice(0, 25).join(' ')).trim();
}

function quoteSnippet(s: string, max = 200): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function extractTemperatureRange(text: string): string | null {
  const m = text.match(/-?\d+\s*°?\s*[CFcf]\s*(?:to|–|-)\s*-?\d+\s*°?\s*[CFcf]/);
  return m?.[0] ?? null;
}

export function normalizeApostrophes(s: string): string {
  return s.replace(/[\u2018\u2019`´]/g, "'").replace(/\s+/g, ' ').trim();
}

/** Undo chained "A — B — A — B" outputs from earlier buggy rewrites. */
export function sanitizeRewriteInput(text: string): string {
  const t = normalizeApostrophes(text);
  if (!t.includes(' — ')) return t;

  const segments = t.split(/\s+—\s+/).map((s) => s.trim()).filter(Boolean);
  const forLead = segments.find((s) => /^For /i.test(s));
  if (forLead) return forLead.replace(/\.$/, '');

  const ausOriginal = segments.find((s) =>
    /\b(are|is)\s+Australia['']s\s+top\s+choice\b/i.test(s),
  );
  if (ausOriginal) return ausOriginal.replace(/\.$/, '');

  return segments[0].replace(/\.$/, '');
}

function isStableAnswerFirstRewrite(s: string): boolean {
  return /^For .+,\s+.+\s+are the (most popular|preferred) option\.?$/i.test(s.trim());
}

function normalizeHomePhrase(s: string): string {
  return s
    .replace(/\s+in your home\.?$/i, '')
    .replace(/\s+in the home\.?$/i, '')
    .replace(/\.$/, '')
    .trim();
}

function ausTopVariants(subject: string, purpose: string): string[] {
  const subjLower = subject.toLowerCase();
  return [
    `For ${purpose} in Australian homes, ${subjLower} are the most popular option.`,
    `In Australia, ${subjLower} are a top choice for ${purpose}.`,
    `${subject} are widely used for ${purpose} in Australian homes.`,
    `For ${purpose}, ${subjLower} are the preferred solution in Australia.`,
  ];
}

function topChoiceVariants(subject: string, purpose: string): string[] {
  const subjLower = subject.toLowerCase();
  return [
    `For ${purpose}, ${subjLower} are the preferred option.`,
    `${subject} are a leading option for ${purpose}.`,
    `When you need ${purpose}, ${subjLower} are a strong choice.`,
  ];
}

function pickVariant(variants: string[], variantIndex: number): string {
  return variants[variantIndex % variants.length];
}

/** Restructure declarative first sentences into a clearer answer-first lead. */
function transformDeclarativeFirst(first: string, variantIndex = 0): string {
  const s = first.trim().replace(/\.$/, '');

  const ausTop = s.match(/^(.+?)\s+are\s+Australia['']s\s+top\s+choice\s+for\s+(.+)$/i);
  if (ausTop) {
    const subject = ausTop[1].trim();
    const purpose = normalizeHomePhrase(ausTop[2]);
    return pickVariant(ausTopVariants(subject, purpose), variantIndex);
  }

  const topChoice = s.match(
    /^(.+?)\s+are\s+(?:the\s+)?(?:top|best|leading|preferred)\s+choice\s+for\s+(.+)$/i,
  );
  if (topChoice) {
    const subject = topChoice[1].trim();
    const purpose = normalizeHomePhrase(topChoice[2]);
    return pickVariant(topChoiceVariants(subject, purpose), variantIndex);
  }

  const idealFor = s.match(/^(.+?)\s+(?:is|are)\s+ideal\s+for\s+(.+)$/i);
  if (idealFor) {
    const subject = idealFor[1].trim();
    const purpose = normalizeHomePhrase(idealFor[2]);
    return `For ${purpose}, ${subject.toLowerCase()} ${subject.includes(' and ') ? 'are' : 'is'} an ideal fit.`;
  }

  const designedFor = s.match(/^(.+?)\s+(?:is|are)\s+designed\s+for\s+(.+)$/i);
  if (designedFor && !/^designed\b/i.test(s)) {
    const subject = designedFor[1].trim();
    const purpose = normalizeHomePhrase(designedFor[2]);
    return `For ${purpose}, ${subject.toLowerCase()} ${/\bare\b/i.test(subject) ? 'are' : 'is'} purpose-built.`;
  }

  const sv = s.match(/^(.+?)\s+(are|is)\s+(.+)$/i);
  if (sv && s.length > 40 && !isDomainLike(sv[1].trim())) {
    const subject = sv[1].trim();
    const verb = sv[2].toLowerCase();
    const pred = sv[3].trim();
    return `In short, ${subject.toLowerCase()} ${verb} ${pred.charAt(0).toLowerCase() + pred.slice(1)}.`;
  }

  return first;
}

function rewriteDesignedBuilt(
  heading: string | undefined,
  first: string,
  rest: string,
): string {
  const topic = heading?.trim() || 'this product line';
  const temp = extractTemperatureRange(first + ' ' + rest);
  const range = temp ? `, operating ${temp}` : '';

  if (/reliable|quality|durability|robust/i.test(topic)) {
    return `Our products deliver reliable performance in demanding conditions${range}. ${quoteSnippet(rest || first, 200)}`;
  }

  const topicLower = topic.toLowerCase();
  const topicLead = topicLower.endsWith('s')
    ? `${topic} deliver the performance described below`
    : `${topic} delivers the performance described below`;
  return `${topicLead}${range}. ${quoteSnippet(rest || first, 200)}`;
}

export function buildAnswerFirstRewrite(input: {
  heading?: string | null;
  highlightLabel?: string;
  text: string;
  variantIndex?: number;
}): string {
  const sanitized = sanitizeRewriteInput(input.text);
  if (!sanitized) return '';

  const variantIndex = input.variantIndex ?? 0;

  if (variantIndex === 0 && isStableAnswerFirstRewrite(sanitized)) {
    return sanitized.endsWith('.') ? sanitized : `${sanitized}.`;
  }

  const heading = resolveRewriteHeading({
    heading: input.heading,
    highlightLabel: input.highlightLabel,
  });

  const first = firstSentence(sanitized);
  const rest = sanitized.slice(first.length).trim();
  const firstTrim = first.trim();

  if (/^(designed|built|engineered|crafted|developed)\b/i.test(firstTrim)) {
    return rewriteDesignedBuilt(heading, firstTrim, rest);
  }

  const transformed = transformDeclarativeFirst(
    normalizeApostrophes(firstTrim),
    variantIndex,
  );
  if (transformed !== normalizeApostrophes(firstTrim)) {
    return rest ? `${transformed} ${quoteSnippet(rest, 220)}`.trim() : transformed;
  }

  const topic = heading || 'this topic';
  const temp = extractTemperatureRange(sanitized);

  if (/reliable|quality|durability|robust/i.test(topic)) {
    const range = temp ? `, operating ${temp}` : '';
    return `Our products deliver reliable performance in demanding conditions${range}. ${quoteSnippet(rest || firstTrim, 200)}`;
  }

  if (temp) {
    return `This product line is built for extreme environments, operating ${temp}. ${quoteSnippet(rest || firstTrim, 180)}`;
  }

  if (heading) {
    const topicLower = topic.toLowerCase();
    const claim = topicLower.endsWith('s')
      ? `${topic} are defined by the benefits described below.`
      : `${topic} means delivering the outcomes described in this section.`;
    return `${claim} ${quoteSnippet(rest || firstTrim, 200)}`;
  }

  const sv = firstTrim.match(/^(.+?)\s+(are|is)\s+(.+)$/i);
  if (sv && !isDomainLike(sv[1].trim())) {
    const subject = sv[1].trim();
    const verb = sv[2].toLowerCase();
    const pred = sv[3].trim();
    return `In short, ${subject.toLowerCase()} ${verb} ${pred.charAt(0).toLowerCase() + pred.slice(1)}.`;
  }

  return sanitized;
}
