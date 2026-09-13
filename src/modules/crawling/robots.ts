/**
 * robots.txt parser — minimal but covers the parts that matter for GEO:
 * Allow/Disallow per user-agent, Sitemap directives, Crawl-delay.
 *
 * Intentionally does NOT pull in a heavyweight parser dependency.
 */

import { config } from '@shared/config';
import { crawlLogger } from '@shared/logger';
import { safeFetch } from '@shared/network/safe-fetch';
import type { RobotsInfo } from './schemas';

interface UserAgentRules {
  allow: string[];
  disallow: string[];
  crawlDelaySec?: number;
}

export interface RobotsPolicy {
  info: Omit<RobotsInfo, 'allowed'>;
  allows: (targetUrl: string) => boolean;
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
  const anchored = rule.endsWith('$');
  const body = anchored ? rule.slice(0, -1) : rule;
  const pattern = body
    .split('*')
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  const re = new RegExp('^' + pattern + (anchored ? '$' : ''));
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

function rulesForUserAgent(groups: Map<string, UserAgentRules>, userAgent: string): UserAgentRules {
  const normalizedUserAgent = userAgent.toLowerCase();
  const matches = Array.from(groups.entries())
    .filter(([agent]) => agent !== '*' && agent.length > 0 && normalizedUserAgent.includes(agent))
    .sort(([a], [b]) => b.length - a.length);
  return matches[0]?.[1] ?? groups.get('*') ?? { allow: [], disallow: [] };
}

export function isAllowedByRobotsText(text: string, userAgent: string, targetUrl: string): boolean {
  const { groups } = parseRobots(text);
  const target = new URL(targetUrl);
  return isAllowed(rulesForUserAgent(groups, userAgent), `${target.pathname}${target.search}`);
}

export async function fetchRobotsPolicy(rootUrl: string): Promise<RobotsPolicy> {
  const url = new URL('/robots.txt', rootUrl);
  try {
    const res = await safeFetch(url.toString(), {
      headers: { 'user-agent': config.crawl.userAgent },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return {
        info: { fetched: false, sitemaps: [], crawlDelayMs: null, rawSize: 0 },
        allows: () => true,
      };
    }
    const text = await res.text();
    const { groups, sitemaps } = parseRobots(text);
    const matching = rulesForUserAgent(groups, config.crawl.userAgent);
    return {
      info: {
        fetched: true,
        sitemaps,
        crawlDelayMs: matching.crawlDelaySec ? matching.crawlDelaySec * 1000 : null,
        rawSize: text.length,
      },
      allows: (targetUrl) => isAllowedByRobotsText(text, config.crawl.userAgent, targetUrl),
    };
  } catch (err) {
    crawlLogger.warn({ err: (err as Error).message, url: url.toString() }, 'robots fetch failed');
    return {
      info: { fetched: false, sitemaps: [], crawlDelayMs: null, rawSize: 0 },
      allows: () => true,
    };
  }
}

export async function fetchRobots(rootUrl: string, targetUrl = rootUrl): Promise<RobotsInfo> {
  const policy = await fetchRobotsPolicy(rootUrl);
  return { ...policy.info, allowed: policy.allows(targetUrl) };
}
