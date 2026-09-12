import { describe, expect, it } from 'vitest';
import {
  canRunAlongsideRunning,
  compareJobsByPriority,
  jobPriority,
} from './job-priority';

describe('jobPriority', () => {
  it('ranks audits above background jobs', () => {
    expect(jobPriority('geo-audit.run')).toBeLessThan(jobPriority('competitor.compare'));
    expect(jobPriority('competitor.compare')).toBeLessThan(jobPriority('intelligence.ingest'));
    expect(jobPriority('intelligence.ingest')).toBeLessThan(jobPriority('monitoring.sweep'));
  });
});

describe('compareJobsByPriority', () => {
  it('sorts by priority then createdAt', () => {
    const jobs = [
      { type: 'intelligence.ingest', createdAt: new Date('2026-01-01') },
      { type: 'geo-audit.run', createdAt: new Date('2026-01-02') },
      { type: 'geo-audit.run', createdAt: new Date('2026-01-01') },
    ];
    const sorted = [...jobs].sort(compareJobsByPriority);
    expect(sorted[0]?.type).toBe('geo-audit.run');
    expect(sorted[0]?.createdAt).toEqual(new Date('2026-01-01'));
    expect(sorted[2]?.type).toBe('intelligence.ingest');
  });
});

describe('canRunAlongsideRunning', () => {
  it('blocks two heavy jobs', () => {
    expect(canRunAlongsideRunning(new Set(['geo-audit.run']), 'competitor.compare')).toBe(false);
  });

  it('allows background alongside heavy', () => {
    expect(canRunAlongsideRunning(new Set(['geo-audit.run']), 'intelligence.ingest')).toBe(true);
  });
});
