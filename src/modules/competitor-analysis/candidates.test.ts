import { describe, expect, it } from 'vitest';
import { validateCompetitorCandidates } from './candidates';

describe('validateCompetitorCandidates', () => {
  it('accepts distinct plausible business sites', () => {
    const result = validateCompetitorCandidates({
      targetUrl: 'https://acme.com',
      candidateUrls: ['example.com', 'https://another.example.au/'],
    });
    expect(result.accepted).toEqual(['https://example.com', 'https://another.example.au']);
    expect(result.rejected).toEqual([]);
  });

  it('rejects same-site, duplicate, directory and invalid candidates', () => {
    const result = validateCompetitorCandidates({
      targetUrl: 'https://acme.com',
      candidateUrls: [
        'https://www.acme.com/pricing',
        'https://example.com',
        'http://example.com/about',
        'https://www.reddit.com/r/acme',
        'not a url',
      ],
    });
    expect(result.accepted).toEqual(['https://example.com']);
    expect(result.rejected.map((item) => item.reason)).toEqual([
      'same_site', 'duplicate', 'directory', 'invalid_url',
    ]);
  });
});
