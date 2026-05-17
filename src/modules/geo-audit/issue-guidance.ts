/**
 * Per-highlight guidance: specific diagnosis, fix steps, and template sample rewrites.
 */

import type { PageExtraction, SemanticChunk } from '@modules/extraction';
import { buildAnswerFirstRewrite } from '@modules/optimization/generators/answer-first-rewrite';
import { buildReadabilityRewrite } from '@modules/optimization/generators/readability-rewrite';
import type { Dimension } from './schemas';

export interface HighlightGuidance {
  problem: string;
  fixHint: string;
  suggestedExample?: string;
}

function firstSentence(text: string): string {
  const m = text.trim().match(/^(.+?[.!?])(?:\s|$)/);
  return (m?.[1] ?? text.trim().split(/\s+/).slice(0, 25).join(' ')).trim();
}

function quoteSnippet(s: string, max = 120): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

type OpenerKind =
  | 'designed_built'
  | 'feature_list'
  | 'question'
  | 'passive'
  | 'too_short'
  | 'too_long'
  | 'allowed'
  | 'other';

function classifyOpener(sentence: string): OpenerKind {
  const s = sentence.trim();
  if (s.length < 20) return 'too_short';
  if (s.length > 320) return 'too_long';
  if (s.endsWith('?')) return 'question';
  if (/^(designed|built|engineered|crafted|developed)\b/i.test(s)) return 'designed_built';
  if (/^(featuring|including|with|offering|providing)\b/i.test(s)) return 'feature_list';
  if (/^(is|are|was|were|has been|have been)\b/i.test(s)) return 'passive';
  if (/^(the|a|an|in|there|yes|no|to|this|you|it|our|we)\b/i.test(s)) return 'allowed';
  return 'other';
}

function openerExplanation(kind: OpenerKind, heading?: string): string {
  const topic = heading ? `the section topic (“${heading}”)` : 'what this section is about';
  switch (kind) {
    case 'designed_built':
      return `it starts with how something was built or designed, not a plain statement of ${topic}`;
    case 'feature_list':
      return `it opens with a feature list instead of stating ${topic} in a direct sentence`;
    case 'question':
      return `it opens with a question instead of giving the answer first`;
    case 'passive':
      return `it uses a passive opening (“is/are…”) instead of a clear subject–verb claim about ${topic}`;
    case 'too_short':
      return 'the first sentence is too short to work as a standalone answer for AI tools';
    case 'too_long':
      return 'the first sentence is too long—models struggle to quote or summarize it cleanly';
    case 'allowed':
      return `it may look acceptable, but it still does not clearly answer ${topic} in the first sentence`;
    default:
      return `it does not open with a direct, declarative answer to ${topic}`;
  }
}

function extractTemperatureRange(text: string): string | null {
  const m = text.match(/-?\d+\s*°?\s*[CFcf]\s*(?:to|–|-)\s*-?\d+\s*°?\s*[CFcf]/);
  return m?.[0] ?? null;
}

function buildAnswerFirstExample(
  heading: string | undefined,
  first: string,
  rest: string,
): string {
  return buildAnswerFirstRewrite({
    heading: heading ?? null,
    text: rest ? `${first.trim()} ${rest}` : first.trim(),
  });
}

export function guidanceForAnswerFirstChunk(chunk: SemanticChunk): HighlightGuidance {
  const heading = chunk.heading?.trim();
  const text = chunk.text.trim();
  const first = firstSentence(text);
  const rest = text.slice(first.length).trim();
  const kind = classifyOpener(first);
  const sectionRef = heading ? `Under “${heading}”, ` : '';

  const problem =
    `${sectionRef}the opening sentence “${quoteSnippet(first)}” ${openerExplanation(kind, heading)}. ` +
    'AI search tools often quote only the first sentence—readers may not see your main point.';

  const fixHint = heading
    ? `1. Rewrite sentence 1 to state what “${heading}” means for your product in plain language.\n2. Move specs, temperature ranges, and supporting details to sentence 2 and below.\n3. Keep the original facts—only change the order and opening wording.`
    : '1. Start with a direct statement of what this section is about.\n2. Move specifications and background detail to the following sentences.';

  return {
    problem,
    fixHint,
    suggestedExample: buildAnswerFirstExample(heading, first, rest),
  };
}

export function guidanceForChunkSize(chunk: SemanticChunk): HighlightGuidance {
  const heading = chunk.heading?.trim() || 'this section';
  const tooLong = chunk.wordCount > 250;
  const first = firstSentence(chunk.text);

  if (tooLong) {
    return {
      problem: `“${heading}” is ${chunk.wordCount} words (recommended ~60–250). It starts with: “${quoteSnippet(first)}”. Long blocks are harder for AI tools to retrieve as a single answer.`,
      fixHint: `1. Add an H2/H3 subheading after the first key point (after “${quoteSnippet(first, 60)}…”).\n2. Split into 2–3 sections of ~100–200 words each, one idea per section.`,
      suggestedExample: `## ${heading}\n\n${first}\n\n[Add a subheading here for the next major point, then continue with supporting detail.]`,
    };
  }

  return {
    problem: `“${heading}” is only ${chunk.wordCount} words—too short to stand alone. Current text: “${quoteSnippet(chunk.text, 100)}”.`,
    fixHint: `1. Merge this block with the previous or next section under one heading, or\n2. Expand into a full explanation (aim for at least ~60 words) that answers one clear question.`,
    suggestedExample: `${heading}: [One sentence that states the point]. [1–2 sentences with supporting detail or an example].`,
  };
}

export function guidanceForThinLead(
  chunk: SemanticChunk,
  extraction: PageExtraction,
): HighlightGuidance {
  const title = extraction.metadata.title?.trim() || 'this page';
  const first = quoteSnippet(chunk.text.trim(), 100);
  return {
    problem: `The opening paragraph is only ${chunk.wordCount} words: “${first}”. Search and AI snippets rely on this text (and your meta description) to summarize “${title}”.`,
    fixHint:
      '1. Add 2–3 sentences at the top: who it is for, what they get, and the main takeaway.\n2. Write a meta description of at least 70 characters that matches the opening.',
    suggestedExample: `${title} helps [audience] achieve [main outcome]. This page covers [topic 1] and [topic 2]. ${chunk.text.trim()}`,
  };
}

export function guidanceForShortMeta(extraction: PageExtraction): HighlightGuidance {
  const desc = extraction.metadata.description?.trim() ?? '';
  const title = extraction.metadata.title?.trim() || 'your page';
  return {
    problem: desc
      ? `The meta description is only ${desc.length} characters: “${quoteSnippet(desc, 80)}”. AI and search snippets need at least ~70 characters.`
      : 'No meta description was found in the page HTML.',
    fixHint:
      `1. Add or expand <meta name="description"> to 70–160 characters.\n2. Include the page topic, audience, and one concrete benefit for “${title}”.`,
    suggestedExample: `${title}: [What you offer] for [audience]. [One specific benefit or fact]. Learn more about [topic].`,
  };
}

export function guidanceForMissingFaq(extraction: PageExtraction): HighlightGuidance {
  const title = extraction.metadata.title?.trim() || 'this page';
  const lead = extraction.chunks[0]?.text.trim().slice(0, 200) ?? '';
  const topic = title.replace(/\s*[-|].*$/, '').trim() || 'your product';
  return {
    problem:
      'No FAQ or Q&A blocks were found in the page HTML. AI assistants often pull direct quotes from question-and-answer pairs.',
    fixHint:
      '1. Add a visible FAQ section with real customer questions.\n2. Optionally add FAQPage JSON-LD matching the same Q&A text.',
    suggestedExample:
      `Q: What is ${topic}?\nA: ${lead ? quoteSnippet(lead, 120) : `${topic} provides [main value] for [audience].`}\n\n` +
      `Q: Who is ${topic} for?\nA: [Describe your ideal customer in one or two sentences.]`,
  };
}

export function guidanceForHeadings(extraction: PageExtraction): HighlightGuidance {
  const h1 = extraction.headings.filter((h) => h.level === 1);
  const h2 = extraction.headings.filter((h) => h.level === 2);
  const h1Text = h1.map((h) => h.text).join(', ') || '(none)';
  const h2Text = h2.slice(0, 5).map((h) => h.text).join(', ') || '(none)';

  let problem: string;
  if (h1.length === 0) {
    problem = 'No H1 heading was found. Without one main title, AI tools cannot tell what the page is primarily about.';
  } else if (h1.length > 1) {
    problem = `Found ${h1.length} H1 headings (${h1Text}). Multiple top-level titles confuse topic hierarchy.`;
  } else if (h2.length < 2) {
    problem = `Only ${h2.length} H2 section heading(s) found (${h2Text}). Pages need clear section breaks for AI chunking.`;
  } else {
    problem = `Heading structure needs improvement. H1: ${h1Text}. H2 samples: ${h2Text}.`;
  }

  return {
    problem,
    fixHint:
      '1. Use exactly one H1 for the page topic.\n2. Add H2 headings for each major section (aim for at least 2).\n3. Use H3 for subsections—do not skip from H1 to H4.',
    suggestedExample: `<h1>${extraction.metadata.title?.trim() || 'Page topic'}</h1>\n<h2>First major section</h2>\n<p>[Direct answer opening sentence]</p>\n<h2>Second major section</h2>`,
  };
}

export function guidanceForHtmlSnippet(
  dim: Dimension,
  extraction: PageExtraction,
  label: string,
): HighlightGuidance | null {
  switch (dim) {
    case 'citationFriendliness':
      if (extraction.faqs.length === 0) return guidanceForMissingFaq(extraction);
      return null;
    case 'semanticClarity':
      return guidanceForHeadings(extraction);
    case 'summarizationQuality': {
      const shortMeta =
        !extraction.metadata.description || extraction.metadata.description.length < 70;
      if (shortMeta) return guidanceForShortMeta(extraction);
      if (extraction.chunks[0] && extraction.chunks[0].wordCount < 30) {
        return guidanceForThinLead(extraction.chunks[0], extraction);
      }
      return null;
    }
    case 'structuredContent':
      return {
        problem:
          extraction.schemas.length === 0
            ? 'No JSON-LD <script type="application/ld+json"> blocks were found in the page head.'
            : `Found schema types (${extraction.schemas.map((s) => s.type).join(', ')}) but missing types that help AI citation (e.g. FAQPage, Organization).`,
        fixHint:
          '1. Add JSON-LD in the <head> describing your organization or product.\n2. If you have FAQs, add FAQPage schema that matches visible Q&A on the page.',
        suggestedExample: `{\n  "@context": "https://schema.org",\n  "@type": "Organization",\n  "name": "${extraction.metadata.title?.trim() || 'Your Company'}",\n  "url": "https://example.com"\n}`,
      };
    case 'trustSignals':
      return {
        problem: 'No author name, byline, or author markup was detected in the HTML.',
        fixHint:
          '1. Add a visible author name or company attribution on the page.\n2. Use rel="author" or Author schema if a person wrote the content.',
        suggestedExample: `<p class="byline">By [Author Name], [Role] at [Company]</p>`,
      };
    default:
      return null;
  }
}

export function buildChunkHighlightGuidance(
  dim: Dimension,
  chunk: SemanticChunk,
  extraction: PageExtraction,
  pageReasons: string[] = [],
): HighlightGuidance {
  switch (dim) {
    case 'answerExtraction':
      return guidanceForAnswerFirstChunk(chunk);
    case 'chunkOptimization':
      return guidanceForChunkSize(chunk);
    case 'summarizationQuality':
      if (chunk === extraction.chunks[0] && chunk.wordCount < 30) {
        return guidanceForThinLead(chunk, extraction);
      }
      return {
        problem: pageReasons.join(' ') || `Opening content needs improvement for summarization.`,
        fixHint:
          'Add 2–3 sentences at the top that state the page topic, audience, and main takeaway.',
        suggestedExample: guidanceForThinLead(chunk, extraction).suggestedExample,
      };
    case 'aiReadability':
      return {
        problem:
          pageReasons.join(' ') ||
          `Readability issue in “${chunk.heading?.trim() || 'opening content'}”: “${quoteSnippet(firstSentence(chunk.text))}”.`,
        fixHint:
          'Use shorter sentences, ensure critical copy is in the initial HTML, and set the page language attribute.',
        suggestedExample: buildReadabilityRewrite({ text: chunk.text }),
      };
    default:
      return {
        problem: pageReasons.join(' ') || 'This content block contributes to a low score for this dimension.',
        fixHint: 'Review the issue recommendation and update this section accordingly.',
      };
  }
}
