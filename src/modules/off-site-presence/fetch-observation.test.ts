import { describe, expect, it } from 'vitest';
import { classifyHttpObservation } from './fetch-observation';

describe('classifyHttpObservation', () => {
  it.each([
    [200, '<html>ok</html>', 'observed'],
    [403, '<html>Access Denied</html>', 'blocked'],
    [200, '<html>Please verify you are human</html>', 'blocked'],
    [429, '<html>slow down</html>', 'rate_limited'],
    [503, '<html>unavailable</html>', 'unreachable'],
  ] as const)('maps %s responses to %s without converting blocks to zero hits', (status, html, expected) => {
    expect(classifyHttpObservation(status, html).status).toBe(expected);
  });
});
