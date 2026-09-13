import { describe, expect, it } from 'vitest';
import { isValidKeywordTerm } from './keywords';

describe('isValidKeywordTerm', () => {
  it.each(['Flow You’d Expect', "Started Whether you're", 'How does this work?'])(
    'rejects navigation or sentence fragments: %s',
    (term) => {
      expect(isValidKeywordTerm(term)).toBe(false);
    },
  );

  it('keeps compact, topic-specific phrases', () => {
    expect(isValidKeywordTerm('Python programming')).toBe(true);
    expect(isValidKeywordTerm('Compound data types')).toBe(true);
  });
});
