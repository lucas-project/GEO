import { describe, expect, it } from 'vitest';
import { buildAnswerFirstRewrite, sanitizeRewriteInput } from './answer-first-rewrite';
import { isDomainLike, resolveRewriteHeading } from './rewrite-heading';

const SPLIT_ORIGINAL =
  "Split systems are Australia's top choice for heating and cooling individual rooms or specific areas in your home";

describe('buildAnswerFirstRewrite', () => {
  it('restructures Australia top-choice sentences', () => {
    const out = buildAnswerFirstRewrite({
      heading: 'Split systems',
      text: SPLIT_ORIGINAL,
    });
    expect(out).toMatch(/^For heating and cooling/i);
    expect(out.toLowerCase()).toContain('split systems');
    expect(out).not.toBe(SPLIT_ORIGINAL);
  });

  it('does not use domain names as headings', () => {
    const out = buildAnswerFirstRewrite({
      heading: 'mdhome.com.au',
      text: SPLIT_ORIGINAL,
    });
    expect(out).not.toContain('mdhome.com.au');
    expect(out).toMatch(/^For heating and cooling/i);
  });

  it('returns different variants when variantIndex increases', () => {
    const v0 = buildAnswerFirstRewrite({ text: SPLIT_ORIGINAL, variantIndex: 0 });
    const v1 = buildAnswerFirstRewrite({ text: SPLIT_ORIGINAL, variantIndex: 1 });
    const v2 = buildAnswerFirstRewrite({ text: SPLIT_ORIGINAL, variantIndex: 2 });
    expect(v0).not.toBe(v1);
    expect(v1).not.toBe(v2);
    expect(v0).not.toContain(' — ');
    expect(v1).not.toContain(' — ');
  });

  it('recovers from chained em-dash bug output', () => {
    const broken = `mdhome.com.au are australia's top choice for heating and cooling individual rooms or specific areas in your home — ${SPLIT_ORIGINAL} — mdhome.com.au are australia's top choice for heating and cooling individual rooms or specific areas in your home`;
    const out = buildAnswerFirstRewrite({ heading: 'mdhome.com.au', text: broken });
    expect(out).not.toContain(' — ');
    expect(out).toMatch(/^For heating and cooling/i);
  });
});

describe('sanitizeRewriteInput', () => {
  it('extracts the For-lead segment from chains', () => {
    const s = sanitizeRewriteInput(
      'For heating and cooling zones in Australian homes, split systems are the most popular option — Split systems are Australia\'s top choice for heating',
    );
    expect(s).toMatch(/^For heating/i);
    expect(s).not.toContain(' — ');
  });
});

describe('rewrite-heading', () => {
  it('detects domains', () => {
    expect(isDomainLike('mdhome.com.au')).toBe(true);
    expect(isDomainLike('Split systems')).toBe(false);
  });

  it('resolves section from highlight label', () => {
    expect(
      resolveRewriteHeading({
        highlightLabel: 'Section: Split systems',
        heading: 'mdhome.com.au',
      }),
    ).toBe('Split systems');
  });
});
