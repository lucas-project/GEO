import { describe, expect, it } from 'vitest';
import { emptyPageChecklist } from '@modules/extraction';
import { analyzePresenceSignals } from './analyze';

describe('analyzePresenceSignals foundOnPages', () => {
  it('records the page where a footer platform link was found', () => {
    const signals = analyzePresenceSignals({
      rootUrl: 'https://example.com',
      pageExtractions: [
        {
          url: 'https://example.com/',
          extraction: {
            url: 'https://example.com/',
            links: [
              {
                href: 'https://www.linkedin.com/company/example',
                text: 'LinkedIn',
                isInternal: false,
                rel: null,
              },
            ],
            schemas: [],
            chunks: [],
            entities: [],
            headings: [],
            faqs: [],
            tables: [],
            authors: [],
            checklist: emptyPageChecklist(),
            metadata: {
              title: 'Example',
              description: null,
              canonical: null,
              ogTitle: null,
              ogSiteName: null,
              ogDescription: null,
              ogType: null,
              twitterCard: null,
              language: null,
              charset: null,
              robots: null,
            },
          },
        },
      ],
    });

    expect(signals.platforms.linkedin.linked).toBe(true);
    expect(signals.platforms.linkedin.foundOnPages).toContain('homepage');
    expect(signals.platforms.linkedin.urls[0]).toContain('linkedin.com');
  });
});
