import { describe, expect, it } from 'vitest';
import { isAllowedByRobotsText } from './robots';

describe('robots path evaluation', () => {
  it('honours a terminal anchor without treating the anchor as a literal dollar sign', () => {
    const robots = `User-agent: *\nDisallow: /private$\n`;

    expect(isAllowedByRobotsText(robots, 'GeoAIBot/1.0', 'https://example.test/private')).toBe(false);
    expect(isAllowedByRobotsText(robots, 'GeoAIBot/1.0', 'https://example.test/private/report')).toBe(true);
  });

  it('uses the most specific matching user-agent group before the wildcard group', () => {
    const robots = `User-agent: *\nDisallow: /\n\nUser-agent: geoaibot\nAllow: /\nDisallow: /members/\n`;

    expect(isAllowedByRobotsText(robots, 'GeoAIBot/1.0', 'https://example.test/public')).toBe(true);
    expect(isAllowedByRobotsText(robots, 'GeoAIBot/1.0', 'https://example.test/members/plan')).toBe(false);
    expect(isAllowedByRobotsText(robots, 'OtherBot/1.0', 'https://example.test/public')).toBe(false);
  });

  it('evaluates each target path and lets an equally specific allow rule win', () => {
    const robots = `User-agent: *\nDisallow: /docs/*\nAllow: /docs/public\n`;

    expect(isAllowedByRobotsText(robots, 'GeoAIBot/1.0', 'https://example.test/docs/private')).toBe(false);
    expect(isAllowedByRobotsText(robots, 'GeoAIBot/1.0', 'https://example.test/docs/public')).toBe(true);
  });
});
