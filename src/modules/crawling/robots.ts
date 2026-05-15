/**
 * robots.txt parser — minimal but covers the parts that matter for GEO:
 * Allow/Disallow per user-agent, Sitemap directives, Crawl-delay.
 *
 * Intentionally does NOT pull in a heavyweight parser dependency.
 */

import { config } from '@shared/config';
import { crawlLogger } from '@shared/logger';
import type { RobotsInfo } from './schemas';

interface UserAgentRules {
  allow: string[];
  disallow: string[];
  crawlDelaySec?: number;
}

function parseRobots(text: string): { groups: Map<string, UserAgentRules>; sitemaps: string[] } {
  const groups = new Map<string, UserAgentRules>();
  const sitemaps: string[] = [];
  let currentAgents: string[] = [];
  let pendingNewGroup = true;

  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const directive = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    if (directive === 'sitemap') {
      sitemaps.push(value);
      continue;
    }

    if (directive === 'user-agent') {
      if (pendingNewGroup) {
        currentAgents = [];
        pendingNewGroup = false;
      }
      currentAgents.push(value.toLowerCase());
      if (!groups.has(value.toLowerCase())) {
        groups.set(value.toLowerCase(), { allow: [], disallow: [] });
      }
      continue;
    }

    // Any non-UA directive ends the UA-grouping mode
    pendingNewGroup = true;
    const target = currentAgents.length ? currentAgents : ['*'];
    for (const ua of target) {
      const rules = groups.get(ua) ?? { allow: [], disallow: [] };
      if (directive === 'allow') rules.allow.push(value);
      else if (directive === 'disallow') rules.disallow.push(value);
      else if (directive === 'crawl-delay') rules.crawlDelaySec = parseFloat(value);
      groups.set(ua, rules);
    }
  }

  return { groups, sitemaps };
}

function pathMatches(rule: string, path: string): boolean {
  if (!rule) return false;
  // Convert robots glob into a basic prefix/wildcard match. Supports * and $.
  const pattern = rule
    .split('*')
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  const re = new RegExp('^' + pattern + (rule.endsWith('$') ? '$' : ''));
  return re.test(path);
}

function isAllowed(rules: UserAgentRules, path: string): boolean {
  let bestAllow = -1;
  let bestDisallow = -1;
  for (const r of rules.allow) if (pathMatches(r, path)) bestAllow = Math.max(bestAllow, r.length);
  for (const r of rules.disallow) if (pathMatches(r, path)) bestDisallow = Math.max(bestDisallow, r.length);
  if (bestDisallow === -1) return true;
  return bestAllow >= bestDisallow;
}

export async function fetchRobots(rootUrl: string): Promise<RobotsInfo> {
  const url = new URL('/robots.txt', rootUrl);
  try {
    const res = await fetch(url.toString(), {
      headers: { 'user-agent': config.crawl.userAgent },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return { fetched: false, allowed: true, sitemaps: [], crawlDelayMs: null, rawSize: 0 };
    }
    const text = await res.text();
    const { groups, sitemaps } = parseRobots(text);

    // Determine the matching rule group: GeoAIBot specifically, else *.
    const ua = config.crawl.userAgent.toLowerCase();
    const matching =
      Array.from(groups.entries()).find(([key]) => key !== '*' && ua.includes(key))?.[1] ??
      groups.get('*') ?? { allow: [], disallow: [] };

    const allowed = isAllowed(matching, new URL(rootUrl).pathname);
    return {
      fetched: true,
      allowed,
      sitemaps,
      crawlDelayMs: matching.crawlDelaySec ? matching.crawlDelaySec * 1000 : null,
      rawSize: text.length,
    };
  } catch (err) {
    crawlLogger.warn({ err: (err as Error).message, url: url.toString() }, 'robots fetch failed');
    return { fetched: false, allowed: true, sitemaps: [], crawlDelayMs: null, rawSize: 0 };
  }
}
