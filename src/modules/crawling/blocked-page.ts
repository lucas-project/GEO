/**
 * Detect CDN/WAF bot-block pages (Akamai, Cloudflare, etc.) so audits fail clearly
 * instead of scoring "Access Denied" HTML.
 */

export interface BlockedPageSignal {
  blocked: boolean;
  reason: string;
}

export interface ParkedDomainSignal {
  parked: boolean;
  reason: string;
}

/** Domain marketplace landing pages (Efty, Sedo, etc.) — not real sites to audit. */
const PARKED_TITLE_PATTERNS = [
  /\bdomain name is for sale\b/i,
  /\bthis domain (is )?for sale\b/i,
  /\b(domain|website) (is )?for sale\b.*\binquire\b/i,
  /\bavailable for purchase\b/i,
  /\bbuy this domain\b/i,
];

const PARKED_BODY_PATTERNS = [
  /\bwww\.efty\.com\b/i,
  /\befty\.com for sale theme\b/i,
  /\bpremium domain name is available for purchase\b/i,
  /\bsedoparking\b/i,
  /\bafternic\.com\b/i,
  /\bdan\.com\b.*\b(domain|make offer)\b/i,
  /\bundeveloped\.com\b/i,
  /\bhugedomains\.com\b/i,
  /\bbrandpa\.com\b/i,
  /\b(is )?parked free\b/i,
  /\bget this domain\b/i,
];

const BODY_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /<title>\s*access denied\s*<\/title>/i,
    reason: 'The server returned an “Access Denied” page (CDN/WAF blocked our crawler).',
  },
  {
    pattern: /cf-browser-verification|challenge-platform|checking your browser/i,
    reason: 'Cloudflare or similar bot challenge — page must be loaded in a real browser first.',
  },
  {
    pattern: /akamai|edgesuite\.net/i,
    reason: 'Akamai CDN blocked automated access to this site.',
  },
  {
    pattern: /request blocked|bot detection|automated access/i,
    reason: 'Bot protection blocked automated access.',
  },
];

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** User-facing copy when the URL is a domain-for-sale landing page, not a live site. */
export function parkedDomainMessage(url: string): string {
  const host = hostLabel(url);
  return (
    `${host} is a parked domain listing (for sale), not an active website. ` +
    'Enter the URL where your site is actually live — for example your product homepage or blog.'
  );
}

/** Playful copy for the audit “Find pages” step when any site blocks our crawler. */
export function walledGardenDiscoverMessage(url: string): string {
  const host = hostLabel(url);
  return (
    `🧱 ${host} said “Access Denied” — Great-Wall energy. ` +
    `Site owner? You don’t need us. Competitor? They’re too fortified; pick a softer target.`
  );
}

export function detectParkedDomain(input: {
  html: string | null;
  title: string | null;
}): ParkedDomainSignal {
  const title = (input.title ?? '').trim();
  const compact = (input.html ?? '').replace(/\s+/g, ' ').trim();

  if (title && PARKED_TITLE_PATTERNS.some((p) => p.test(title))) {
    return {
      parked: true,
      reason: 'The page title indicates this domain is listed for sale, not a live website.',
    };
  }

  if (compact.length > 0 && compact.length < 25_000) {
    const bodyHits = PARKED_BODY_PATTERNS.filter((p) => p.test(compact)).length;
    const titleForSale = /\bfor sale\b/i.test(title);
    if (bodyHits >= 2 || (bodyHits >= 1 && titleForSale)) {
      return {
        parked: true,
        reason: 'The page content looks like a domain marketplace listing, not a live website.',
      };
    }
  }

  return { parked: false, reason: '' };
}

export function isParkedDomainPage(input: {
  html: string | null;
  title: string | null;
}): boolean {
  return detectParkedDomain(input).parked;
}

/** True when the response looks like a CDN/WAF denial (any host). */
export function isAccessDeniedBySite(input: {
  statusCode: number;
  html: string | null;
  title: string | null;
}): boolean {
  return detectBlockedPage(input).blocked;
}

export function detectBlockedPage(input: {
  statusCode: number;
  html: string | null;
  title: string | null;
}): BlockedPageSignal {
  const html = input.html ?? '';
  const title = (input.title ?? '').trim().toLowerCase();
  const compact = html.replace(/\s+/g, ' ').trim();
  const shortBody = compact.length < 4000;

  if (input.statusCode === 401 || input.statusCode === 403 || input.statusCode === 451) {
    if (title === 'access denied' || /access denied/i.test(compact.slice(0, 800))) {
      return {
        blocked: true,
        reason:
          'The site returned HTTP ' +
          input.statusCode +
          ' with an “Access Denied” page (CDN/WAF blocked our crawler).',
      };
    }
    return {
      blocked: true,
      reason: `The site returned HTTP ${input.statusCode} and refused our crawler.`,
    };
  }

  if (title === 'access denied' || title === '403 forbidden') {
    return {
      blocked: true,
      reason: 'The page title is “Access Denied” — the live site blocked our crawler.',
    };
  }

  if (shortBody) {
    for (const { pattern, reason } of BODY_PATTERNS) {
      if (pattern.test(compact)) {
        return { blocked: true, reason };
      }
    }
  }

  return { blocked: false, reason: '' };
}

export function blockedPageErrorMessage(
  url: string,
  detail: string,
  options: { stealthTried?: boolean; systemChromeTried?: boolean } = {},
): string {
  const { stealthTried = true, systemChromeTried = false } = options;
  const notes: string[] = [];
  if (stealthTried) notes.push('stealth mode (playwright-extra)');
  if (systemChromeTried) notes.push('installed Chrome in a visible window');
  const triedNote =
    notes.length > 0
      ? ` We already tried ${notes.join(' and ')}; some CDNs still block datacenter IPs.`
      : '';
  return (
    `Could not audit ${url}: ${detail}${triedNote} ` +
    'Try a staging URL, a subdomain that allows crawlers, or ask the site team to allowlist your audit IP.'
  );
}
