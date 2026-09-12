import { describe, expect, it } from 'vitest';
import { inferAdditionalSources, mergeAdditionalSources } from './keyword-source-registry';

describe('keyword-source-registry', () => {
  it('infers GitHub sources for open source keywords', () => {
    const sources = inferAdditionalSources({
      pageHints: 'We are an open source project on GitHub',
      brandKeywords: ['open source'],
    });
    expect(sources.some((s) => s.host === 'github.com')).toBe(true);
    expect(sources.some((s) => s.host === 'gitlab.com')).toBe(true);
  });

  it('dedupes merged sources by host', () => {
    const merged = mergeAdditionalSources(
      [{ id: 'github', host: 'github.com', label: 'GitHub', reason: 'a' }],
      [{ id: 'github2', host: 'github.com', label: 'GitHub', reason: 'b' }],
    );
    expect(merged).toHaveLength(1);
  });
});
