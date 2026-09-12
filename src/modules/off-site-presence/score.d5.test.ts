import { describe, expect, it } from 'vitest';
import { scoreD5 } from './score';

describe('scoreD5', () => {
  it('credits Wikipedia notability without Serper', () => {
    expect(
      scoreD5({
        serperMediaMentions: 0,
        primarySourceDomains: [],
        wikipediaPresent: true,
      }),
    ).toBe(8);
  });

  it('credits discovery domains from supplement', () => {
    expect(
      scoreD5({
        supplement: {
          discoveryDomains: ['forbes.com', 'reuters.com'],
          mediaDomains: [],
        },
      }),
    ).toBeGreaterThanOrEqual(8);
  });
});
