import { canonicalPageUrl } from '@/lib/website-url';

type RootPageCandidate = {
  url: string;
  finalUrl?: string | null;
  renderedHtml?: string | null;
};

function isHomepage(url: string): boolean {
  try {
    return new URL(url).pathname === '/';
  } catch {
    return false;
  }
}

/**
 * Choose the audit root independently of crawl order. The requested URL wins
 * even when it redirects, preserving the user's intended site entry point.
 */
export function selectAuditRootPage<T extends RootPageCandidate>(
  pages: T[],
  requestedRootUrl: string,
): T | null {
  if (pages.length === 0) return null;
  const root = canonicalPageUrl(requestedRootUrl, requestedRootUrl);
  const ordered = [...pages].sort((a, b) => {
    const rank = (page: T): number => {
      if (canonicalPageUrl(page.url, requestedRootUrl) === root) return 0;
      if (canonicalPageUrl(page.finalUrl || page.url, requestedRootUrl) === root) return 1;
      if (isHomepage(page.finalUrl || page.url)) return 2;
      return page.renderedHtml ? 3 : 4;
    };
    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;
    return canonicalPageUrl(a.finalUrl || a.url, requestedRootUrl)
      .localeCompare(canonicalPageUrl(b.finalUrl || b.url, requestedRootUrl));
  });
  return ordered[0] ?? null;
}
