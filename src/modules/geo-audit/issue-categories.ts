import type { Dimension } from './schemas';
import { isNegativeReason } from './plain-language';

/** Strip per-page prefixes from aggregated dimension reasons. */
export function normalizeReasonText(reason: string): string {
  let r = reason.trim();
  if (/^aggregated across \d+ audited pages/i.test(r)) return '';
  // Multi-page audits prefix reasons with path hints, e.g. "/blog: …" or "homepage: …"
  r = r.replace(/^(?:homepage|\/[^\s:]+):\s*/i, '');
  r = r.replace(/^[a-z0-9][\w/_-]*:\s*/i, '');
  return r.trim();
}

export interface CanonicalIssueCategory {
  id: string;
  /** User-facing title in the All issues list */
  title: string;
  primaryDimension: Dimension;
  test: (normalizedReason: string) => boolean;
}

export const CANONICAL_ISSUE_CATEGORIES: CanonicalIssueCategory[] = [
  {
    id: 'missing-faq',
    title: 'Missing Q&A / FAQ section',
    primaryDimension: 'citationFriendliness',
    test: (r) =>
      /\b(faq|q\/a|q&a|question-and-answer)\b/i.test(r) &&
      /\b(no |missing|without|not )\b/i.test(r),
  },
  {
    id: 'missing-faq-schema',
    title: 'Missing FAQ structured data (FAQPage)',
    primaryDimension: 'structuredContent',
    test: (r) => /faqpage/i.test(r) && /\b(no |missing|without)\b/i.test(r),
  },
  {
    id: 'missing-author',
    title: 'Missing author or byline',
    primaryDimension: 'trustSignals',
    test: (r) => /\b(author|byline|attribution|e-e-a-t)\b/i.test(r) && /\b(no |missing|without)\b/i.test(r),
  },
  {
    id: 'missing-h1',
    title: 'Missing or unclear main heading (H1)',
    primaryDimension: 'semanticClarity',
    test: (r) => /\bh1\b/i.test(r) && /\b(missing|multiple|no |ambiguous|confuse)\b/i.test(r),
  },
  {
    id: 'weak-h2-structure',
    title: 'Weak section headings (H2)',
    primaryDimension: 'semanticClarity',
    test: (r) => /\bh2\b/i.test(r) && /\b(no |missing|lack)\b/i.test(r),
  },
  {
    id: 'thin-meta-description',
    title: 'Meta description missing or too short',
    primaryDimension: 'summarizationQuality',
    test: (r) => /meta description/i.test(r) && /\b(missing|too short|short)\b/i.test(r),
  },
  {
    id: 'missing-json-ld',
    title: 'Missing structured data (JSON-LD)',
    primaryDimension: 'structuredContent',
    test: (r) =>
      /json-ld|schema markup|structured data/i.test(r) &&
      /\b(no |missing|not found)\b/i.test(r),
  },
  {
    id: 'missing-org-product-schema',
    title: 'Missing organization or product schema',
    primaryDimension: 'entityClarity',
    test: (r) => /organization|product/i.test(r) && /json-ld|schema/i.test(r) && /\bno \b/i.test(r),
  },
  {
    id: 'answer-first-writing',
    title: 'Sections do not lead with direct answers',
    primaryDimension: 'answerExtraction',
    test: (r) => /answer-first|direct answer|lead with/i.test(r) && /\b(few|not |missing|weak)\b/i.test(r),
  },
  {
    id: 'chunk-size',
    title: 'Content sections are too short or too long',
    primaryDimension: 'chunkOptimization',
    test: (r) => /\bchunk/i.test(r) && /\b(too |short|long)\b/i.test(r),
  },
  {
    id: 'js-heavy-content',
    title: 'Important content loads only after JavaScript',
    primaryDimension: 'aiReadability',
    test: (r) => /hydration|javascript|\bjs\b/i.test(r) && /\b(only after|skip|miss|heavy|significant)\b/i.test(r),
  },
  {
    id: 'robots-blocked',
    title: 'AI crawlers may be blocked',
    primaryDimension: 'crawlerFriendliness',
    test: (r) => /robots\.txt/i.test(r) && /\b(disallow|block)\b/i.test(r),
  },
  {
    id: 'missing-lang',
    title: 'Page language not declared',
    primaryDimension: 'aiReadability',
    test: (r) => /lang/i.test(r) && /\b(missing|no )\b/i.test(r),
  },
  {
    id: 'thin-lead',
    title: 'Opening paragraph is too thin to summarize',
    primaryDimension: 'summarizationQuality',
    test: (r) => /lead paragraph/i.test(r) && /\b(thin|weak|short)\b/i.test(r),
  },
  {
    id: 'missing-reddit-quora',
    title: 'No Reddit or Quora profile linked',
    primaryDimension: 'offSitePresence',
    test: (r) => /reddit|quora/i.test(r) && /\b(no |not |missing|does not link)\b/i.test(r),
  },
  {
    id: 'missing-review-profiles',
    title: 'No review platform profiles linked',
    primaryDimension: 'offSitePresence',
    test: (r) => /g2|capterra|trustpilot|review platform/i.test(r) && /\b(no |not |missing)\b/i.test(r),
  },
  {
    id: 'weak-off-site-presence',
    title: 'Weak off-site brand footprint',
    primaryDimension: 'offSitePresence',
    test: (r) =>
      /off-site|community and review|sameAs|does not link to any detected/i.test(r) &&
      /\b(no |not |missing|weak|few)\b/i.test(r),
  },
  {
    id: 'weak-commercial-readiness',
    title: 'Weak conversion and pricing signals',
    primaryDimension: 'commercialReadiness',
    test: (r) =>
      /pricing|cta|call-to-action|trust badge|customer proof/i.test(r) &&
      /\b(no |not |missing|limited|obvious)\b/i.test(r),
  },
  {
    id: 'weak-alt-text',
    title: 'Images missing descriptive alt text',
    primaryDimension: 'semanticClarity',
    test: (r) => /alt text|images lack/i.test(r) && /\b(few|missing|weak|lack)\b/i.test(r),
  },
  {
    id: 'few-question-headings',
    title: 'Few question-style section headings',
    primaryDimension: 'semanticClarity',
    test: (r) => /question-style/i.test(r) && /\b(few|not |missing|weak)\b/i.test(r),
  },
  {
    id: 'missing-definitional-lead',
    title: 'Opening lacks a direct definition',
    primaryDimension: 'answerExtraction',
    test: (r) => /definitional opener|definition opener/i.test(r) && /\b(no |not |missing|lack)\b/i.test(r),
  },
  {
    id: 'missing-case-study',
    title: 'No quantified case study',
    primaryDimension: 'trustSignals',
    test: (r) => /case study/i.test(r) && /\b(no |not |missing|without)\b/i.test(r),
  },
  {
    id: 'weak-internal-links',
    title: 'Weak internal linking',
    primaryDimension: 'crawlerFriendliness',
    test: (r) => /internal link/i.test(r) && /\b(few|not |missing|weak)\b/i.test(r),
  },
  {
    id: 'missing-citation-phrases',
    title: 'Few explicit source citations',
    primaryDimension: 'trustSignals',
    test: (r) => /citation phrase|according to|source:/i.test(r) && /\b(few|not |missing|no )\b/i.test(r),
  },
];

export function canonicalCategoryForReason(reason: string): CanonicalIssueCategory | null {
  const normalized = normalizeReasonText(reason);
  if (!normalized || !isNegativeReason(normalized)) return null;
  return CANONICAL_ISSUE_CATEGORIES.find((c) => c.test(normalized)) ?? null;
}

export function canonicalIssueId(reason: string, fallbackDim: Dimension): string {
  const category = canonicalCategoryForReason(reason);
  if (category) return category.id;
  const slug = normalizeReasonText(reason)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return `${fallbackDim}-${slug || 'issue'}`;
}
