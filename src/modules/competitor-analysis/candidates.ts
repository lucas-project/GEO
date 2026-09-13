import { normalizeWebsiteUrl, isPlausibleWebsiteUrl } from '@/lib/website-url';

const DIRECTORY_HOSTS = new Set([
  'reddit.com', 'quora.com', 'g2.com', 'capterra.com', 'trustpilot.com',
  'productreview.com.au', 'whirlpool.net.au', 'ozbargain.com.au',
]);

export interface CandidateRejection {
  input: string;
  reason: 'invalid_url' | 'same_site' | 'duplicate' | 'directory';
}

export interface CandidateValidation {
  accepted: string[];
  rejected: CandidateRejection[];
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

function isDirectoryHost(host: string): boolean {
  return [...DIRECTORY_HOSTS].some((directory) => host === directory || host.endsWith(`.${directory}`));
}

/** Deterministic hard filters applied before any competitor crawl or LLM ranking. */
export function validateCompetitorCandidates(input: {
  targetUrl: string;
  candidateUrls: string[];
}): CandidateValidation {
  const targetHost = hostOf(normalizeWebsiteUrl(input.targetUrl));
  const accepted: string[] = [];
  const rejected: CandidateRejection[] = [];
  const seen = new Set<string>();

  for (const raw of input.candidateUrls) {
    const value = raw.trim();
    const normalized = normalizeWebsiteUrl(value);
    const host = hostOf(normalized);
    if (!value || !isPlausibleWebsiteUrl(normalized) || !host) {
      rejected.push({ input: raw, reason: 'invalid_url' });
      continue;
    }
    if (host === targetHost || host?.endsWith(`.${targetHost}`) || targetHost?.endsWith(`.${host}`)) {
      rejected.push({ input: raw, reason: 'same_site' });
      continue;
    }
    if (isDirectoryHost(host)) {
      rejected.push({ input: raw, reason: 'directory' });
      continue;
    }
    if (seen.has(host)) {
      rejected.push({ input: raw, reason: 'duplicate' });
      continue;
    }
    seen.add(host);
    accepted.push(normalized);
  }

  return { accepted, rejected };
}
