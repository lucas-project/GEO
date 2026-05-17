import { DIMENSION_LABELS, type Dimension } from './schemas';

const POSITIVE_HINT =
  /\b(present|detected|healthy|adequate|parsable|discrete chunks|distinct schema|allowed|found \d|reinforces|improve)\b/i;

const NEGATIVE_HINT =
  /\b(missing|no |not |too |disallow|few|weak|limited|without|absent|confuse|suffers|skip|thin|short|longer than|only \d+ words)\b/i;

/** True when a scoring reason describes a problem (not a passing check). */
export function isNegativeReason(reason: string): boolean {
  const t = reason.trim();
  if (!t) return false;
  if (POSITIVE_HINT.test(t) && !NEGATIVE_HINT.test(t)) return false;
  return NEGATIVE_HINT.test(t);
}

export function plainDimensionLabel(dim: Dimension): string {
  const labels: Record<Dimension, string> = {
    aiReadability: 'Easy for AI to read',
    citationFriendliness: 'Worth quoting in AI answers',
    semanticClarity: 'Clear page structure',
    entityClarity: 'Clear who and what the page is about',
    answerExtraction: 'Direct answers up front',
    chunkOptimization: 'Well-sized content sections',
    summarizationQuality: 'Easy to summarize',
    trustSignals: 'Trust and credibility',
    structuredContent: 'Structured data for machines',
    crawlerFriendliness: 'AI crawlers can reach your site',
  };
  return labels[dim] ?? DIMENSION_LABELS[dim];
}

export function plainImpact(dim: Dimension, score: number): string {
  const area = plainDimensionLabel(dim).toLowerCase();
  if (score < 35) {
    return `This area scored ${score} out of 100, which is weak. Fixing it helps AI tools understand and recommend your site when people ask questions in ChatGPT, Perplexity, and similar tools.`;
  }
  if (score < 55) {
    return `This area scored ${score} out of 100 — below what we usually see on sites that get cited often. Improving ${area} makes it more likely your pages are quoted accurately.`;
  }
  return `This area scored ${score} out of 100. A few improvements to ${area} can strengthen how AI systems describe and link to your content.`;
}

export function expandReason(reason: string): string {
  const r = reason.trim();
  const rules: Array<{ test: RegExp; text: string }> = [
    {
      test: /no faq|faq blocks/i,
      text: 'The page does not include question-and-answer style content. AI assistants often pull quotes from FAQ-style sections when answering user questions.',
    },
    {
      test: /no author|byline|attribution/i,
      text: 'Readers and AI systems cannot see who wrote or stands behind this content. Named authors and bylines increase trust when your site is cited.',
    },
    {
      test: /missing h1|no h2|multiple h1/i,
      text: 'Headings are not organized the way readers and AI tools expect. A single main title and clear section headings help machines follow your topic.',
    },
    {
      test: /meta description/i,
      text: 'The short description shown in search and AI snippets is missing or too brief, so tools cannot summarize your page reliably.',
    },
    {
      test: /json-ld|structured data|schema/i,
      text: 'The page lacks machine-readable labels (structured data) that tell AI systems what your business, products, or articles are.',
    },
    {
      test: /answer-first|direct answer/i,
      text: 'Sections do not start with a plain answer. AI tools weight the first sentence heavily when they quote or summarize a page.',
    },
    {
      test: /chunk|words/i,
      text: 'Some sections are much shorter or longer than ideal. Breaking content into focused blocks (roughly one idea each) helps AI retrieve the right part of your page.',
    },
    {
      test: /robots|disallow|crawler/i,
      text: 'Site rules or technical setup may block or discourage AI crawlers from reading your pages.',
    },
    {
      test: /hydration|javascript|js/i,
      text: 'Important text may only appear after JavaScript runs. Many AI crawlers read the initial HTML and miss content that loads later.',
    },
    {
      test: /lang attribute/i,
      text: 'The page does not declare its language, which can confuse translation and summarization tools.',
    },
  ];

  for (const { test, text } of rules) {
    if (test.test(r)) return text;
  }

  if (r.length < 80) {
    return `${r} Addressing this makes your page easier for AI search tools to use when recommending or quoting your site.`;
  }
  return r;
}

export function plainIssueSummary(dim: Dimension, reason: string, score: number): string {
  const area = plainDimensionLabel(dim);
  const expanded = expandReason(reason);
  return `We flagged this under “${area}” (score ${score}/100). ${expanded}`;
}

export function plainDimensionRecommendation(dim: Dimension): string {
  const recs: Record<Dimension, string> = {
    aiReadability:
      'Use shorter sentences, put important text in the main page HTML (not only after scripts run), and set the page language in your site template.',
    citationFriendliness:
      'Add real FAQ sections with clear questions and answers, show who wrote the content, and include specific facts and numbers where relevant.',
    semanticClarity:
      'Use one main page title (H1), break the page into sections with clear subheadings (H2/H3), and write a descriptive browser title.',
    entityClarity:
      'Name your company, products, and services clearly in the text, and add simple structured data that describes your organization.',
    answerExtraction:
      'Start each section with a direct answer in the first sentence, then add supporting detail below.',
    chunkOptimization:
      'Split very long sections into smaller parts with headings. Aim for focused blocks of text—not tiny fragments and not huge walls of text.',
    summarizationQuality:
      'Write a useful meta description (about 70+ characters), add social preview tags if you use them, and open with 2–3 sentences that summarize the page.',
    trustSignals:
      'Show author names or company attribution, link to credible sources where appropriate, and add basic organization information.',
    structuredContent:
      'Add structured data (JSON-LD) for your organization, products, FAQs, or articles—whichever fits the page.',
    crawlerFriendliness:
      'Allow reputable AI crawlers in robots.txt, keep a sitemap, reduce reliance on JavaScript-only content, and consider a simple /llms.txt file that describes your site.',
  };
  return recs[dim] ?? '';
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

export function issueIdForReason(dim: Dimension, reason: string): string {
  return `issue-${dim}-${slugify(reason)}`;
}

const CANONICAL_RECOMMENDATIONS: Record<string, string> = {
  'missing-faq':
    'Add a dedicated FAQ section with real questions customers ask. Use clear Q&A pairs in the page HTML, and add matching FAQPage JSON-LD if you use structured data.',
  'missing-faq-schema':
    'Add FAQPage JSON-LD in the page head that lists the same questions and answers visible on the page.',
  'missing-author':
    'Show who wrote or stands behind the content: author name, role, and company. Add Author or Organization schema when appropriate.',
  'missing-h1':
    'Add exactly one H1 that states the main topic of the page. Use H2 for each major section below it.',
  'weak-h2-structure':
    'Break the page into at least two H2 sections so each major topic has its own heading.',
  'thin-meta-description':
    'Write a meta description of 70–160 characters: what the page offers, who it is for, and one concrete benefit.',
  'missing-json-ld':
    'Add JSON-LD in the <head> for Organization, Product, or Article—whichever best describes this page.',
  'missing-org-product-schema':
    'Add Organization or Product JSON-LD that names your brand and offerings clearly.',
  'answer-first-writing':
    'For each section, rewrite the first sentence to state the section topic in plain language, then move specs and background to the following sentences. Use the per-section examples under impacted pages as a starting point.',
  'chunk-size':
    'Split oversized sections with subheadings (~100–200 words each), or merge very short fragments into complete explanations.',
  'js-heavy-content':
    'Move critical text into the initial HTML response so AI crawlers that do not run JavaScript can still read it.',
  'robots-blocked':
    'Update robots.txt to allow reputable AI crawlers, and confirm your sitemap is listed.',
  'missing-lang':
    'Set <html lang="en"> (or the correct language code) on every page template.',
  'thin-lead':
    'Expand the opening paragraph to 2–3 sentences: topic, audience, and main takeaway. Match your meta description.',
};

/** Issue-level “What to do” when grouped by canonical category. */
export function plainIssueRecommendation(canonicalId: string | undefined, dim: Dimension): string {
  if (canonicalId && CANONICAL_RECOMMENDATIONS[canonicalId]) {
    return CANONICAL_RECOMMENDATIONS[canonicalId];
  }
  return plainDimensionRecommendation(dim);
}
