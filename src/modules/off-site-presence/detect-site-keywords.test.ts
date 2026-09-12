import { describe, expect, it } from 'vitest';
import { detectSiteKeywordsFromPages } from './detect-site-keywords';

describe('detectSiteKeywordsFromPages', () => {
  it('extracts keywords from page HTML', () => {
    const html = `<!DOCTYPE html><html><head>
      <title>Acme Open Source Platform</title>
      <meta name="description" content="Enterprise developer tools and API SDK for teams">
      </head><body>
      <h1>Developer platform</h1>
      <h2>Open source libraries</h2>
      <p>Build faster with our npm package and cloud API integration for modern teams.</p>
      </body></html>`;

    const keywords = detectSiteKeywordsFromPages([{ url: 'https://acme.com', html, schemas: [] }]);
    expect(keywords.length).toBeGreaterThan(0);
    expect(keywords.length).toBeLessThanOrEqual(10);
  });
});
