/**
 * Accepts a hostname (e.g. example.com) or a full URL and returns a canonical https URL.
 * Users do not need to type https://
 */
export function normalizeWebsiteUrl(input: string): string {
  let url = input.trim();
  if (!url) return url;
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return url;
  }
}

/** Matches domains including multi-part TLDs (e.g. example.com.au). */
const BARE_DOMAIN_RE =
  /^(?:https?:\/\/)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:[a-z]{2,})(?:\.[a-z]{2,})?$/i;

const DOMAIN_IN_TEXT_RE =
  /(?:https?:\/\/[^\s,;)]+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:[a-z]{2,})(?:\.[a-z]{2,})?(?::\d+)?(?:\/[^\s,;)"']*)?)/gi;

/**
 * Pull the longest URL-like token from free text (fixes `www.mdhome.com.au` → full host,
 * not `mdhome.com` from the old `[a-z0-9-]+\\.[a-z]{2,}` pattern).
 */
export function extractWebsiteFromText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  if (BARE_DOMAIN_RE.test(trimmed)) {
    return normalizeWebsiteUrl(trimmed);
  }

  const matches = [...trimmed.matchAll(DOMAIN_IN_TEXT_RE)];
  if (matches.length === 0) return null;
  const raw = matches.sort((a, b) => (b[0]?.length ?? 0) - (a[0]?.length ?? 0))[0]?.[0];
  if (!raw) return null;
  try {
    return normalizeWebsiteUrl(raw);
  } catch {
    return null;
  }
}

/** Reject hostnames like www.mdhome (missing .com.au). */
export function isPlausibleWebsiteUrl(url: string): boolean {
  try {
    const host = new URL(normalizeWebsiteUrl(url)).hostname.toLowerCase();
    const parts = host.split('.').filter(Boolean);
    if (parts.length < 2) return false;
    if (parts[0] === 'www' && parts.length === 2) return false;
    return true;
  } catch {
    return false;
  }
}

/** When the goal is only a domain, that is always the canonical site URL. */
export function canonicalSiteUrlFromGoal(goal: string, stepUrl?: string): string | null {
  const trimmedGoal = goal.trim();
  if (BARE_DOMAIN_RE.test(trimmedGoal)) {
    return normalizeWebsiteUrl(trimmedGoal);
  }
  return resolveWebsiteUrl(stepUrl, goal);
}

/** True when the goal is essentially just a domain/URL (no sentence). */
export function goalLooksLikeWebsite(goal: string): boolean {
  const t = goal.trim();
  if (!t) return false;
  if (BARE_DOMAIN_RE.test(t)) return true;
  if (/\s/.test(t)) return Boolean(extractWebsiteFromText(t));
  return Boolean(extractWebsiteFromText(t));
}

/**
 * Prefer the URL extracted from the goal when the step URL is truncated
 * (e.g. mock planner emitted https://www.mdhome/ instead of mdhome.com.au).
 */
export function resolveWebsiteUrl(stepUrl: string | undefined, goal: string): string | null {
  const fromGoal = extractWebsiteFromText(goal);
  const raw = stepUrl?.trim();
  if (!fromGoal) return raw ? normalizeWebsiteUrl(raw) : null;
  if (!raw) return fromGoal;
  try {
    const goalHost = new URL(fromGoal).hostname.replace(/^www\./i, '').toLowerCase();
    const stepHost = new URL(normalizeWebsiteUrl(raw)).hostname.replace(/^www\./i, '').toLowerCase();
    if (goalHost.length > stepHost.length && goalHost.includes(stepHost)) return fromGoal;
    if (stepHost.split('.').length < 3 && goalHost.split('.').length >= 3) return fromGoal;
  } catch {
    return fromGoal;
  }
  return normalizeWebsiteUrl(raw);
}

/** True when two URLs refer to the same site (hostname, ignoring www). */
export function sameTargetSite(a: string, b: string): boolean {
  try {
    const ua = new URL(normalizeWebsiteUrl(a));
    const ub = new URL(normalizeWebsiteUrl(b));
    const host = (h: string) => h.replace(/^www\./i, '').toLowerCase();
    return host(ua.hostname) === host(ub.hostname);
  } catch {
    return normalizeWebsiteUrl(a) === normalizeWebsiteUrl(b);
  }
}

/**
 * Normalize a page URL to the site's preferred host (www vs apex) and path form.
 * Ensures sitemap links like mdhome.com.au/foo match audits started on www.mdhome.com.au.
 */
export function canonicalPageUrl(url: string, siteRoot: string): string {
  try {
    const root = new URL(normalizeWebsiteUrl(siteRoot));
    const u = new URL(url, root);
    u.protocol = root.protocol;
    u.hostname = root.hostname;
    u.hash = '';
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    return normalizeWebsiteUrl(u.href);
  } catch {
    return url;
  }
}
