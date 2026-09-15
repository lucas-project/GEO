import { describe, expect, it } from 'vitest';
import {
  extractRelevantKeywords,
  isValidKeywordTerm,
  splitTextSegments,
} from './keywords';

describe('isValidKeywordTerm', () => {
  it.each([
    'Flow You’d Expect',
    "Started Whether you're",
    'How does this work?',
    'documentation examples without',
    'examples without needing',
    'body{background',
    'vh auto;font-family',
  ])('rejects navigation, function-edge, or code fragments: %s', (term) => {
    expect(isValidKeywordTerm(term)).toBe(false);
  });

  it('keeps compact, topic-specific phrases', () => {
    expect(isValidKeywordTerm('Python programming')).toBe(true);
    expect(isValidKeywordTerm('Compound data types')).toBe(true);
    expect(isValidKeywordTerm('ducted reverse cycle')).toBe(true);
  });
});

describe('splitTextSegments', () => {
  it('does not merge across sentence boundaries', () => {
    const segs = splitTextSegments(
      'Python is a programming language. Download installers from the site.',
    );
    expect(segs.length).toBeGreaterThanOrEqual(2);
    expect(segs.some((s) => s.includes('programming language'))).toBe(true);
    expect(segs.every((s) => !s.includes('language Download'))).toBe(true);
  });
});

describe('extractRelevantKeywords', () => {
  it('returns insufficient_topic_evidence for Example Domain placeholder copy', () => {
    const result = extractRelevantKeywords({
      title: 'Example Domain',
      description: '',
      headings: ['Example Domain'],
      faqQuestions: [],
      chunkTexts: [
        'This domain is for use in illustrative examples in documents. You may use this domain in literature without prior coordination or asking for permission.',
        'More information about the purpose of example domains is available from IANA.',
      ],
      tableTexts: [],
      limit: 10,
    });

    expect(result.status).toBe('insufficient_topic_evidence');
    expect(result.keywords).toEqual([]);
    const joined = result.keywords.map((k) => k.term).join(' | ');
    expect(joined).not.toMatch(/documentation examples without/i);
    expect(joined).not.toMatch(/examples without needing/i);
  });

  it('rejects CSS fragments even when present in body text', () => {
    const result = extractRelevantKeywords({
      title: 'Docs',
      description: 'Developer documentation',
      headings: ['Getting started'],
      faqQuestions: [],
      chunkTexts: ['body{background:#fff;font-family:system-ui} vh auto;font-family'],
      tableTexts: [],
    });
    const terms = result.keywords.map((k) => k.term).join(' ');
    expect(terms).not.toMatch(/background/i);
    expect(terms).not.toMatch(/font-family/i);
    expect(terms).not.toMatch(/vh auto/i);
  });

  it('extracts thematic keywords from a documentation-style Python page', () => {
    const result = extractRelevantKeywords({
      title: 'Welcome to Python.org',
      description: 'The official home of the Python Programming Language',
      headings: ['Python Programming Language', 'Get Started', 'Docs', 'Community'],
      faqQuestions: [],
      chunkTexts: [
        'Python is a programming language that lets you work quickly and integrate systems more effectively.',
        'The Python Package Index hosts thousands of third-party modules.',
        'Python programming tutorials cover data types, control flow, and compound data types.',
        'Python programming tutorials cover data types across many guides.',
      ],
      tableTexts: [],
      limit: 12,
    });

    expect(result.status).toBe('ok');
    expect(result.keywords.length).toBeGreaterThanOrEqual(3);
    const terms = result.keywords.map((k) => k.term.toLowerCase());
    expect(terms.some((t) => t.includes('python'))).toBe(true);
    expect(terms.join(' ')).not.toMatch(/hvac|refrigerant|ducted|split system|outdoor unit/i);
    for (const k of result.keywords) {
      expect(k.evidence?.length ?? 0).toBeGreaterThan(0);
      expect(k.confidence ?? 0).toBeGreaterThanOrEqual(0.45);
    }
  });

  it('prefers JSON-LD product terms when provided', () => {
    const result = extractRelevantKeywords({
      title: 'Acme Heat Pump',
      description: 'Efficient heating for homes',
      headings: ['Product overview'],
      faqQuestions: [],
      chunkTexts: [
        'Our heat pump systems deliver year-round comfort for residential customers.',
        'Heat pump systems are available across Australia.',
      ],
      tableTexts: [],
      jsonLdTerms: ['heat pump', 'reverse cycle air conditioning'],
      limit: 10,
    });

    expect(result.status).toBe('ok');
    const sources = result.keywords.map((k) => k.source);
    expect(sources.includes('json_ld') || result.keywords.some((k) => /heat pump/i.test(k.term))).toBe(
      true,
    );
  });

  it('ignores nav and download boilerplate on documentation pages', () => {
    const result = extractRelevantKeywords({
      title: 'Install Python',
      description: 'Download Python installers',
      headings: ['Downloads', 'Documentation', 'Python releases'],
      faqQuestions: [],
      chunkTexts: [
        'Accept all cookies to continue. Privacy policy and terms of service apply.',
        'Download now: python-3.12.exe Windows installer. Install now for macOS pkg.',
        'Python releases include source tarballs and documentation archives.',
        'Python releases are published on the downloads page each quarter.',
      ],
      tableTexts: [],
      limit: 10,
    });

    const joined = result.keywords.map((k) => k.term).join(' ').toLowerCase();
    expect(joined).not.toMatch(/accept all cookies/);
    expect(joined).not.toMatch(/privacy policy/);
    expect(joined).not.toMatch(/download now/);
    if (result.status === 'ok') {
      expect(result.keywords.some((k) => /python/i.test(k.term))).toBe(true);
    }
  });
});
