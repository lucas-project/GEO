import { getSiteDisplayHost, getSiteRootKey } from '@/lib/website-url';

export interface AuditListRow {
  id: string;
  url: string;
  overallScore: number;
  status: string;
  createdAt: string;
  monitored: boolean;
}

export interface SiteAuditGroup {
  siteKey: string;
  displayHost: string;
  latest: AuditListRow;
  auditCount: number;
  monitored: boolean;
}

/** Group audits by root hostname; each group keeps the newest audit as `latest`. */
export function groupAuditsBySite(audits: AuditListRow[]): SiteAuditGroup[] {
  const bySite = new Map<string, AuditListRow[]>();

  for (const audit of audits) {
    const key = getSiteRootKey(audit.url);
    const list = bySite.get(key) ?? [];
    list.push(audit);
    bySite.set(key, list);
  }

  const groups: SiteAuditGroup[] = [];
  for (const [siteKey, siteAudits] of bySite) {
    const sorted = [...siteAudits].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const latest = sorted[0]!;
    groups.push({
      siteKey,
      displayHost: getSiteDisplayHost(latest.url),
      latest,
      auditCount: sorted.length,
      monitored: latest.monitored,
    });
  }

  return groups.sort(
    (a, b) => new Date(b.latest.createdAt).getTime() - new Date(a.latest.createdAt).getTime(),
  );
}
