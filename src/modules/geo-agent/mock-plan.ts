/**
 * Deterministic agent plans for mock AI mode.
 */

import {
  canonicalSiteUrlFromGoal,
  extractWebsiteFromText,
  normalizeWebsiteUrl,
} from '@/lib/website-url';
import type { Plan, PlanStep } from './schemas';

function wantsSimulation(goal: string): boolean {
  return /\b(simulat|chatgpt|gemini|claude|perplexity|ai search|cited?|visibility|vrf|hvac)\b/i.test(goal);
}

function wantsComparison(goal: string): boolean {
  return /\b(compare|competitor|vs\.?|versus)\b/i.test(goal);
}

function wantsFix(goal: string): boolean {
  return /\b(fix|optimiz|schema|faq|llms\.txt|artifact|improve)\b/i.test(goal);
}

function wantsMonitor(goal: string): boolean {
  return /\b(monitor|track|watch|alert)\b/i.test(goal);
}

function extractAllSites(goal: string): string[] {
  const matches = [
    ...goal.matchAll(
      /(?:https?:\/\/[^\s,;)]+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:[a-z]{2,})(?::\d+)?(?:\/[^\s,;)"']*)?)/gi,
    ),
  ];
  const urls: string[] = [];
  for (const m of matches) {
    try {
      const u = normalizeWebsiteUrl(m[0]);
      if (!urls.includes(u)) urls.push(u);
    } catch {
      /* skip */
    }
  }
  return urls;
}

export function buildMockAgentPlan(goal: string): Plan {
  const site = extractWebsiteFromText(goal);
  const allSites = extractAllSites(goal);
  const steps: PlanStep[] = [];

  if (wantsComparison(goal) && allSites.length >= 2) {
    return {
      summary: `Compare ${allSites[0]} against competitors for AI search signals.`,
      steps: [
        {
          type: 'competitor-compare',
          targetUrl: allSites[0],
          competitorUrls: allSites.slice(1, 4),
          reason: 'Benchmark entity and schema coverage against named competitors.',
        },
      ],
    };
  }

  if (site) {
    steps.push({
      type: 'audit',
      url: site,
      reason: 'Baseline GEO audit on the target site.',
    });
  }

  if (wantsSimulation(goal) || /\b(best\b|top\b|australia\b)/i.test(goal)) {
    const prompt =
      goal.length > 20 && !/^(https?:\/\/|www\.)/i.test(goal.trim())
        ? goal.trim()
        : `Best HVAC and VRF air conditioning options in Australia`;
    steps.push({
      type: 'simulate',
      prompt,
      targetBrand: site ? brandFromHost(site) : undefined,
      reason: 'Check which brands and domains AI search platforms cite for this query.',
    });
  }

  if (site && wantsFix(goal)) {
    steps.push({
      type: 'generate-fix',
      auditId: null,
      artifactType: 'faq-schema',
      reason: 'Generate FAQ JSON-LD from the audit to improve citation signals.',
    });
  }

  if (site && wantsMonitor(goal)) {
    steps.push({
      type: 'monitor-add',
      url: site,
      reason: 'Add the site to continuous GEO monitoring.',
    });
  }

  if (steps.length === 0) {
    if (site) {
      steps.push({
        type: 'audit',
        url: site,
        reason: 'Baseline GEO audit on the target site.',
      });
    } else {
      return {
        summary:
          'Add a website URL or domain to your goal (e.g. mdhome.com.au) so the agent can audit and optimize it.',
        steps: [],
      };
    }
  }

  return {
    summary: site
      ? `GEO workflow for ${site}: audit the site${steps.some((s) => s.type === 'simulate') ? ', simulate AI search visibility' : ''}.`
      : 'Agent plan from your goal.',
    steps: steps.slice(0, 6),
  };
}

function brandFromHost(url: string): string | undefined {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const stem = host.split('.')[0]?.toLowerCase() ?? '';
    if (stem === 'mdhome') return 'Midea';
    if (stem.length > 2) return stem.charAt(0).toUpperCase() + stem.slice(1);
  } catch {
    /* ignore */
  }
  return undefined;
}

export function normalizePlanUrls(plan: Plan, goal: string): Plan {
  const steps = plan.steps.map((step): PlanStep => {
    switch (step.type) {
      case 'audit': {
        const url = canonicalSiteUrlFromGoal(goal, step.url);
        if (!url) return step;
        return { ...step, url };
      }
      case 'competitor-compare': {
        const target = canonicalSiteUrlFromGoal(goal, step.targetUrl) ?? step.targetUrl;
        const competitors = step.competitorUrls
          .map((u) => (u.trim() ? normalizeWebsiteUrl(u) : null))
          .filter((u): u is string => Boolean(u));
        return {
          ...step,
          targetUrl: target ?? step.targetUrl,
          competitorUrls: competitors,
        };
      }
      case 'monitor-add': {
        const url = canonicalSiteUrlFromGoal(goal, step.url);
        if (!url) return step;
        return { ...step, url };
      }
      default:
        return step;
    }
  });
  return { ...plan, steps };
}
