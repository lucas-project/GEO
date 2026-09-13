import { it, expect } from 'vitest';
import { generateFaqSchema } from './faq-schema';
it('does not invent FAQ answers from general marketing text', async () => {
  const result = await generateFaqSchema({ title: 'Store', url: 'https://example.com', bodyText: 'Our products are great.', existingFaqs: [] });
  expect(result.entries).toEqual([]); expect(result.jsonLd).toBe('');
  expect(result.rationale).toContain('Insufficient evidence');
});
