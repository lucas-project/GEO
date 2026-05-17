import { canonicalPageUrl } from '@/lib/website-url';
import type { AuditPageEntry } from '@modules/geo-audit';

export function pageSelectionKey(url: string, siteRoot: string): string {
  return canonicalPageUrl(url, siteRoot);
}

export function countSelectedPages(
  pages: AuditPageEntry[],
  selected: Set<string>,
  siteRoot: string,
): number {
  let n = 0;
  for (const p of pages) {
    if (selected.has(pageSelectionKey(p.url, siteRoot))) n++;
  }
  return n;
}

export function selectedPageUrls(
  pages: AuditPageEntry[],
  selected: Set<string>,
  siteRoot: string,
): string[] {
  return pages
    .filter((p) => selected.has(pageSelectionKey(p.url, siteRoot)))
    .map((p) => pageSelectionKey(p.url, siteRoot));
}
