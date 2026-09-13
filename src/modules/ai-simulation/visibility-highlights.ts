import type { Citation, Platform, SimulationResult } from './schemas';
import { canonicalBrandName } from './mock-responses';

export interface CitationHighlight {
  platform: Platform;
  snippet: string;
  brand?: string;
  domain?: string;
}

function targetHostFromUrl(targetUrl?: string): string | null {
  if (!targetUrl?.trim()) return null;
  try {
    return new URL(
      targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`,
    ).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function citationMatchesTarget(
  c: Citation,
  targetBrand: string | undefined,
  targetHost: string | null,
): boolean {
  if (targetHost && c.domain?.replace(/^www\./, '') === targetHost) return true;
  if (!targetBrand?.trim() || !c.brand) return false;
  const canonical = canonicalBrandName(targetBrand).toLowerCase();
  const b = c.brand.toLowerCase();
  return b.includes(canonical) || canonical.includes(b);
}

function sentenceAroundTarget(text: string, target: string): string | null {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(target.toLowerCase());
  if (idx < 0) return null;
  const start = Math.max(0, idx - 60);
  const end = Math.min(text.length, idx + target.length + 80);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

/** Pull readable excerpts when the target brand/domain is cited on a simulation run. */
export function buildCitationHighlights(
  sim: SimulationResult,
  targetBrand?: string,
  targetUrl?: string,
): CitationHighlight[] {
  const targetHost = targetHostFromUrl(targetUrl);
  const canonical = targetBrand ? canonicalBrandName(targetBrand) : '';
  const out: CitationHighlight[] = [];

  for (const run of sim.runs) {
    const matching = run.citations.filter((c) =>
      citationMatchesTarget(c, targetBrand, targetHost),
    );

    for (const c of matching.slice(0, 2)) {
      const snippet =
        c.snippet?.trim() ||
        (c.brand ? sentenceAroundTarget(run.responseText, c.brand) : null) ||
        run.responseText.slice(0, 140).replace(/\s+/g, ' ').trim();
      if (!snippet) continue;
      out.push({
        platform: run.platform,
        snippet: snippet.length > 200 ? `${snippet.slice(0, 197)}…` : snippet,
        brand: c.brand ?? undefined,
        domain: c.domain?.replace(/^www\./, '') ?? undefined,
      });
    }

    if (matching.length === 0 && canonical) {
      const fromText = sentenceAroundTarget(run.responseText, canonical);
      if (fromText) {
        out.push({
          platform: run.platform,
          snippet: fromText.length > 200 ? `${fromText.slice(0, 197)}…` : fromText,
          brand: canonical,
        });
      }
    }
  }

  return out.slice(0, 8);
}
