import { describe, expect, it } from 'vitest';
import { groupAuditsBySite } from './group-by-site';

describe('groupAuditsBySite', () => {
  it('groups by hostname and picks latest audit', () => {
    const groups = groupAuditsBySite([
      {
        id: 'a1',
        url: 'https://www.example.com/page-a',
        overallScore: 70,
        status: 'completed',
        createdAt: '2026-01-02T00:00:00.000Z',
        monitored: false,
      },
      {
        id: 'a2',
        url: 'https://example.com/page-b',
        overallScore: 80,
        status: 'completed',
        createdAt: '2026-01-03T00:00:00.000Z',
        monitored: true,
      },
      {
        id: 'b1',
        url: 'https://other.org',
        overallScore: 50,
        status: 'completed',
        createdAt: '2026-01-01T00:00:00.000Z',
        monitored: false,
      },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]!.siteKey).toBe('example.com');
    expect(groups[0]!.latest.id).toBe('a2');
    expect(groups[0]!.auditCount).toBe(2);
    expect(groups[0]!.monitored).toBe(true);
    expect(groups[1]!.siteKey).toBe('other.org');
  });
});
