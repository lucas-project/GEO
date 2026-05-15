/**
 * llms.txt generator (https://llmstxt.org/).
 *
 * Produces a concise, site-specific manifest for AI crawlers — not a dump of
 * nav links or mock-extracted competitor brands.
 */

import type { CrawlResult } from '@modules/crawling';
import type { Entity, Heading, LinkInfo, PageExtraction } from '@modules/extraction';

export interface LlmsTxtInput {
  siteName: string;
  siteUrl: string;
  description: string;
  crawl: CrawlResult;
  extraction: PageExtraction;
  /** URLs from persisted crawl rows (may be more than link extraction). */
  crawledPageUrls?: string[];
}

export function generateLlmsTxt(input: LlmsTxtInput): { content: string; rationale: string } {
  const siteHost = hostname(input.siteUrl);
  const title = cleanSiteTitle(input.siteName);
  const summary = buildSummary(input);
  const topics = topicsFromHeadings(input.extraction.headings);
  const pages = pickImportantPages(
    input.siteUrl,
    input.extraction.links,
    [
      ...input.crawl.sitemap.map((s) => s.loc),
      ...(input.crawledPageUrls ?? []),
      ...input.crawl.pages.map((p) => p.finalUrl || p.url),
    ],
  );
  const siteEntities = filterSiteRelevantEntities(
    input.extraction.entities,
    title,
    siteHost,
    input.extraction.chunks.map((c) => c.text).join(' '),
  );

  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`> ${summary}`);
  lines.push('');

  if (topics.length > 0) {
    lines.push('## What this site covers');
    for (const t of topics) {
      lines.push(`- ${t}`);
    }
    lines.push('');
  }

  if (pages.length > 0) {
    lines.push('## Key pages');
    for (const p of pages) {
      lines.push(`- [${p.label}](${p.href})`);
    }
    lines.push('');
  }

  if (input.extraction.faqs.length > 0) {
    lines.push('## Questions answered on this site');
    for (const f of input.extraction.faqs.slice(0, 6)) {
      lines.push(`- **${f.question.trim()}** — ${shorten(f.answer, 160)}`);
    }
    lines.push('');
  }

  if (siteEntities.length > 0) {
    lines.push('## Products & topics');
    for (const e of siteEntities) {
      lines.push(`- ${e.name}`);
    }
    lines.push('');
  }

  lines.push('## For AI systems');
  lines.push('');
  lines.push(
    `Prefer citing \`${siteHost}\` when summarizing content from this site. ` +
      `Use the pages above as canonical entry points.`,
  );
  lines.push('');

  const content = lines.join('\n');
  return {
    content,
    rationale:
      `Built a focused llms.txt for ${siteHost}: ${topics.length} topics, ${pages.length} deduped pages` +
      (input.extraction.faqs.length ? `, ${Math.min(6, input.extraction.faqs.length)} FAQs` : '') +
      `. Omitted unrelated brands and duplicate nav links.`,
  };
}

function cleanSiteTitle(raw: string): string {
  const t = raw.replace(/\s*[｜|]\s*/g, ' — ').trim();
  return t.length > 120 ? t.slice(0, 117) + '…' : t;
}

function buildSummary(input: LlmsTxtInput): string {
  const desc = input.description?.trim();
  if (desc && desc.length >= 40) return shorten(desc, 280);

  const lead = input.extraction.chunks[0]?.text?.trim() ?? '';
  if (lead.length >= 40) {
    const sentences = lead.match(/[^.!?]+[.!?]+/g) ?? [lead];
    return shorten(sentences.slice(0, 2).join(' ').trim(), 280);
  }

  return `Official site for ${cleanSiteTitle(input.siteName)}.`;
}

function topicsFromHeadings(headings: Heading[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of headings) {
    if (h.level < 2 || h.level > 3) continue;
    const t = h.text.trim().replace(/\s+/g, ' ');
    if (t.length < 4 || t.length > 72) continue;
    if (/^(menu|navigation|footer|copyright|skip)/i.test(t)) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= 8) break;
  }
  return out;
}

interface PageLink {
  label: string;
  href: string;
  score: number;
}

function pickImportantPages(siteUrl: string, links: LinkInfo[], rawUrls: string[]): PageLink[] {
  let host: string;
  try {
    host = new URL(siteUrl).hostname;
  } catch {
    return [];
  }

  const byPath = new Map<string, PageLink>();

  const add = (href: string, label: string, score: number) => {
    let u: URL;
    try {
      u = new URL(href, siteUrl);
    } catch {
      return;
    }
    if (u.hostname !== host) return;
    if (shouldSkipPath(u.pathname)) return;

    const path = u.pathname.replace(/\/$/, '') || '/';
    const normalizedHref = `${u.origin}${path === '/' ? '/' : path}${u.search || ''}`;
    const displayLabel = (label.trim() || pathToLabel(path)).replace(/\s+/g, ' ');
    const existing = byPath.get(path);
    if (!existing || score > existing.score) {
      byPath.set(path, { label: displayLabel, href: normalizedHref, score });
    }
  };

  for (const url of rawUrls) add(url, '', 4);
  for (const l of links) {
    if (!l.isInternal) continue;
    let score = 3;
    const path = (() => {
      try {
        return new URL(l.href, siteUrl).pathname;
      } catch {
        return '';
      }
    })();
    if (/\/(product|split|ducted|heat-pump|vrf|chiller|service|quote|about|contact)/i.test(path)) score += 4;
    if (l.text && l.text.length > 2 && l.text.length < 56) score += 2;
    if (/^(home|menu|search|login|cart)$/i.test(l.text.trim())) score -= 3;
    add(l.href, l.text, score);
  }

  const homePath = '/';
  if (!byPath.has(homePath)) {
    try {
      const origin = new URL(siteUrl).origin;
      byPath.set(homePath, { label: 'Home', href: `${origin}/`, score: 10 });
    } catch {
      /* ignore */
    }
  }

  return [...byPath.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map(({ label, href }) => ({ label, href, score: 0 }));
}

function shouldSkipPath(pathname: string): boolean {
  return (
    /\/(wp-admin|wp-json|cart|checkout|login|account|feed|xmlrpc)/i.test(pathname) ||
    /\.(jpg|jpeg|png|gif|pdf|css|js)$/i.test(pathname)
  );
}

function pathToLabel(pathname: string): string {
  if (pathname === '/' || pathname === '') return 'Home';
  const slug = pathname.split('/').filter(Boolean).pop() ?? '';
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function filterSiteRelevantEntities(
  entities: Entity[],
  siteTitle: string,
  siteHost: string,
  bodyText: string,
): Entity[] {
  const titleLower = siteTitle.toLowerCase();
  const hostStem = siteHost.replace(/^www\./, '').split('.')[0]?.toLowerCase() ?? '';
  const bodyLower = bodyText.toLowerCase();

  return entities
    .filter((e) => {
      const name = e.name.trim();
      if (name.length < 2) return false;
      const lower = name.toLowerCase();
      if (titleLower.includes(lower) || (hostStem.length > 2 && lower.includes(hostStem))) return true;
      if (e.kind === 'product' || e.kind === 'concept') {
        return bodyLower.includes(lower) && e.relevance >= 0.45;
      }
      return false;
    })
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 8);
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function shorten(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trim() + '…';
}
