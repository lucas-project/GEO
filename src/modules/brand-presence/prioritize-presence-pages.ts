import { canonicalPageUrl, sameTargetSite } from '@/lib/website-url';

const PRESENCE_PATH_RE = /\/(about|contact|company|team|who-we-are)(\/|$)/i;

function isPresencePath(url: string): boolean {
  try {
    return PRESENCE_PATH_RE.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/** Ensure About/Contact-style pages are crawled early for footer/social link detection. */
export function prioritizePresenceUrls(
  orderedUrls: string[],
  candidates: string[],
  rootUrl: string,
  maxAdditional: number,
): string[] {
  const rootNorm = canonicalPageUrl(rootUrl, rootUrl);
  const priority: string[] = [];
  const rest: string[] = [];
  const seen = new Set<string>([rootNorm]);

  for (const raw of candidates) {
    if (!sameTargetSite(raw, rootUrl)) continue;
    const norm = canonicalPageUrl(raw, rootUrl);
    if (seen.has(norm) || !isPresencePath(norm)) continue;
    seen.add(norm);
    priority.push(norm);
  }

  for (const raw of orderedUrls) {
    const norm = canonicalPageUrl(raw, rootUrl);
    if (seen.has(norm)) continue;
    seen.add(norm);
    if (isPresencePath(norm)) priority.push(norm);
    else rest.push(norm);
  }

  return [...priority, ...rest].slice(0, maxAdditional);
}
