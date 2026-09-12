import {
  DIMENSION_DESCRIPTIONS,
  DIMENSION_LABELS,
  DIMENSION_LAYERS,
  type Dimension,
  type GateApplied,
  type ScoreLayer,
} from './schemas';

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

/** Plain-language summary of what each pipeline layer measures. */
export const LAYER_SCORING_INTRO: Record<ScoreLayer, string> = {
  foundation:
    'This layer checks the basics: can AI crawlers reach your site, and is the page structure (headings, schema, robots rules) machine-readable?',
  understanding:
    'This layer checks whether AI can tell who you are, read your content in sensible chunks, and see trust signals like authors and credentials.',
  presence:
    'This layer checks whether your brand shows up beyond your website — linked social profiles, review sites, and optional web-search verification.',
  generation:
    'This layer checks whether AI can pull direct answers and summaries from your copy (answer-first sections, section length, question headings).',
  outcome:
    'This layer checks citation-ready markup (FAQ, product schema) and commercial signals (pricing, CTAs, trust) that make AI more likely to recommend you.',
};

export function dimensionsForLayer(layer: ScoreLayer): Dimension[] {
  return (Object.keys(DIMENSION_LAYERS) as Dimension[]).filter(
    (d) => DIMENSION_LAYERS[d] === layer,
  );
}

export function plainWhatWeCheck(dim: Dimension): string {
  const plain: Partial<Record<Dimension, string>> = {
    crawlerFriendliness:
      'robots.txt rules, sitemap access, and whether critical text is available without heavy JavaScript',
    structuredContent: 'JSON-LD schema types (Organization, Product, FAQ, Article, etc.)',
    semanticClarity: 'one clear H1, logical H2/H3 sections, and a descriptive page title',
    entityClarity: 'named companies, products, and services in the page text and schema',
    chunkOptimization: 'section sizes that are easy to quote (not tiny fragments or huge walls of text)',
    aiReadability: 'sentence length, word count, and whether body text is in the initial HTML',
    trustSignals: 'author names, bylines, credentials, and third-party references',
    offSitePresence:
      'outbound links to Reddit, Quora, LinkedIn, G2/Capterra/Trustpilot, and Organization sameAs URLs',
    answerExtraction: 'whether sections start with a direct answer before background detail',
    summarizationQuality: 'meta description, opening summary, and how quotable the lead paragraph is',
    citationFriendliness: 'FAQ content, statistics, freshness dates, and E-E-A-T signals AI can cite',
    commercialReadiness: 'pricing pages, primary CTAs, trust sections, and comparison content',
  };
  return plain[dim] ?? DIMENSION_DESCRIPTIONS[dim];
}

/** Which pipeline layers show each gate note (site-wide gates only on Foundation). */
export const GATE_LAYERS: Record<GateApplied['type'], ScoreLayer[]> = {
  crawler_blocked: ['foundation'],
  crawler_weak: ['foundation'],
  foundation_weak: ['foundation', 'understanding', 'presence', 'generation', 'outcome'],
  propagation: ['understanding', 'presence', 'generation', 'outcome'],
  answer_extraction_ceiling: ['generation', 'outcome'],
  off_site_presence_weak: ['presence', 'outcome'],
  citation_snapshot: ['outcome'],
};

export function plainGateExplanation(gate: GateApplied): string {
  switch (gate.type) {
    case 'crawler_blocked':
      return gate.cap != null
        ? `AI crawlers are blocked on your site. Your overall score cannot go above ${gate.cap}/100 until access rules improve.`
        : 'AI crawlers are blocked on your site, which limits how high your overall score can go.';
    case 'crawler_weak':
      return gate.cap != null
        ? `AI crawler access is limited (robots.txt, JavaScript-only content, etc.). Your overall score cannot go above ${gate.cap}/100 until this improves.`
        : 'AI crawler access is limited, which holds back your overall score.';
    case 'foundation_weak':
      return 'Crawl and page-structure basics are weak, so higher layers cannot score much better until Foundation improves.';
    case 'propagation':
      return 'This layer did better on its own checks, but a weaker earlier pipeline step lowers the score you see here.';
    case 'answer_extraction_ceiling':
      return gate.cap != null
        ? `Pages rarely lead with a direct answer, so citation-related scores stay around ${gate.cap}/100 or below.`
        : 'Pages rarely lead with a direct answer, which limits citation-related scores.';
    case 'off_site_presence_weak':
      return gate.cap != null
        ? `Your brand is hard to find outside your website, so outcome scores stay around ${gate.cap}/100 or below.`
        : 'Your brand is hard to find outside your website, which limits outcome scores.';
    case 'citation_snapshot':
      return gate.cap != null
        ? `Past AI citation checks for this site were weak, with a ceiling around ${gate.cap}/100.`
        : 'Past AI citation checks for this site were weak.';
    default:
      return gate.cap != null
        ? `${gate.description} (limited to about ${gate.cap}/100).`
        : gate.description;
  }
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
    offSitePresence: 'Visible beyond your website',
    commercialReadiness: 'Ready to convert visitors',
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
    {
      test: /reddit|quora|community/i,
      text: 'Your site does not link to community profiles where people discuss your category. AI tools often cite Reddit and Q&A sites when recommending products.',
    },
    {
      test: /g2|capterra|trustpilot|review platform/i,
      text: 'Review and comparison sites help AI verify your reputation. Link to your official profiles from your website.',
    },
    {
      test: /sameAs|pricing|cta|call-to-action/i,
      text: 'Missing signals make it harder for AI to connect your brand to trusted profiles or guide users toward a next step.',
    },
    {
      test: /statistic|freshness|last-updated|quantified/i,
      text: 'AI systems favor content with specific numbers and recent dates because they are easier to verify and quote.',
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
    offSitePresence:
      'Link to your Reddit, Quora, LinkedIn, and review profiles (G2, Capterra, Trustpilot) from your site footer or About page. Add sameAs URLs in Organization JSON-LD.',
    commercialReadiness:
      'Add a clear pricing page, visible signup or demo buttons on the homepage, customer logos or certifications, and honest comparison content where relevant.',
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
  'missing-reddit-quora':
    'Add footer or About links to your Reddit subreddit or Quora space, or a company thread where your team participates.',
  'missing-review-profiles':
    'Claim your G2, Capterra, or Trustpilot listing and link to it from your site navigation or footer.',
  'weak-off-site-presence':
    'Build a consistent off-site footprint: social profiles, review listings, and sameAs URLs in Organization schema.',
  'weak-commercial-readiness':
    'Publish transparent pricing, a primary CTA on the homepage, and trust proof (logos, certifications, or customer quotes).',
};

/** Issue-level “What to do” when grouped by canonical category. */
export function plainIssueRecommendation(canonicalId: string | undefined, dim: Dimension): string {
  if (canonicalId && CANONICAL_RECOMMENDATIONS[canonicalId]) {
    return CANONICAL_RECOMMENDATIONS[canonicalId];
  }
  return plainDimensionRecommendation(dim);
}
