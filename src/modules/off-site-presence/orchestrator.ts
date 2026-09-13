import { config } from '@shared/config';
import { mapPool } from '@/lib/map-pool';
import type { BrandEntityResult, PlatformId, PlatformProbeResult } from './schemas';
import { PLATFORM_IDS } from './schemas';
import { PLATFORM_ADAPTERS } from './platforms';
import type { SearchSupplementResult } from './search-supplement';
import type { PresenceSearchPlan } from './search-plan-types';
import type { FetchPageFn, ProbeContext } from './platforms/types';
import { PLATFORM_LABELS } from '@modules/brand-presence';
import { withProbeTimeout } from './probe-timeout';

function jitterMs(): number {
  const { platformIntervalMinMs, platformIntervalMaxMs } = config.presenceProbe;
  return (
    platformIntervalMinMs +
    Math.floor(Math.random() * (platformIntervalMaxMs - platformIntervalMinMs + 1))
  );
}

class RateLimiter {
  private timestamps: number[] = [];

  constructor(private readonly maxPerMinute: number) {}

  async wait(): Promise<void> {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < 60_000);
    if (this.timestamps.length >= this.maxPerMinute) {
      const oldest = this.timestamps[0]!;
      const wait = 60_000 - (now - oldest) + 50;
      await new Promise((r) => setTimeout(r, wait));
    }
    this.timestamps.push(Date.now());
  }
}

function skippedProbeResult(
  platformId: PlatformId,
  plan: PresenceSearchPlan,
): PlatformProbeResult {
  const skip = plan.skipPlatforms.find((s) => s.id === platformId);
  return {
    platform: platformId,
    status: 'skipped',
    message: skip?.reason ?? `Not relevant for ${plan.category} brands`,
    signals: {},
    raw: { searchPlanCategory: plan.category },
  };
}

async function probeWithRetries(
  adapter: (typeof PLATFORM_ADAPTERS)[number],
  ctx: ProbeContext,
  limiter: RateLimiter,
): Promise<PlatformProbeResult> {
  const retries = config.presenceProbe.retries;
  const maxMs = config.presenceProbe.platformMaxMs;
  const label = probeProgressLabel(adapter.id);
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await limiter.wait();
      if (attempt > 0) await new Promise((r) => setTimeout(r, jitterMs()));
      return await withProbeTimeout(
        (signal) =>
          adapter.probe({
            ...ctx,
            fetchPage: (url, options) => ctx.fetchPage(url, { ...options, signal }),
          }),
        maxMs,
        label,
      );
    } catch (err) {
      lastError = err;
    }
  }

  return {
    platform: adapter.id,
    status: 'unreachable',
    signals: {},
    message: lastError instanceof Error ? lastError.message : 'Probe failed',
  };
}

export interface OrchestratorInput {
  brand: BrandEntityResult;
  domain: string;
  siteUrl: string;
  fetchPage: FetchPageFn;
  playwrightEnabled: boolean;
  searchPlan: PresenceSearchPlan;
  searchSupplement?: SearchSupplementResult | null;
  adapters?: typeof PLATFORM_ADAPTERS;
  onProgress?: (progress: number, message: string) => void | Promise<void>;
}

function probeProgressLabel(platformId: PlatformId): string {
  if (platformId === 'site_search') return 'Web search footprint';
  return PLATFORM_LABELS[platformId as keyof typeof PLATFORM_LABELS] ?? platformId;
}

const AU_PROBE_ORDER: PlatformId[] = ['whirlpool', 'productreview', 'ozbargain'];

function sortProbesForDomain(
  adapters: typeof PLATFORM_ADAPTERS,
  domain: string,
): typeof PLATFORM_ADAPTERS {
  if (!domain.replace(/^www\./, '').endsWith('.au')) return adapters;

  const au = adapters.filter((a) => AU_PROBE_ORDER.includes(a.id));
  const reddit = adapters.filter((a) => a.id === 'reddit');
  const rest = adapters.filter((a) => !AU_PROBE_ORDER.includes(a.id) && a.id !== 'reddit');
  const auSorted = AU_PROBE_ORDER.flatMap((id) => au.filter((a) => a.id === id));
  return [...auSorted, ...rest, ...reddit];
}

export async function runPlatformProbes(
  input: OrchestratorInput,
): Promise<Record<PlatformId, PlatformProbeResult>> {
  const limiter = new RateLimiter(config.presenceProbe.requestsPerMinute);
  const ctx: ProbeContext = {
    brand: input.brand,
    domain: input.domain,
    siteUrl: input.siteUrl,
    fetchPage: input.fetchPage,
    sameAsUrls: input.brand.sameAsUrls,
    searchSupplement: input.searchSupplement,
    searchPlan: input.searchPlan,
  };

  const adapters = input.adapters ?? PLATFORM_ADAPTERS;
  const plan = input.searchPlan;

  const out = {} as Record<PlatformId, PlatformProbeResult>;
  for (const id of PLATFORM_IDS) {
    if (!plan.probePlatforms.includes(id)) {
      out[id] = skippedProbeResult(id, plan);
    }
  }

  const toRun = sortProbesForDomain(
    input.playwrightEnabled
      ? adapters.filter((a) => plan.probePlatforms.includes(a.id))
      : adapters.filter((a) => a.id === 'site_search'),
    input.domain,
  );

  const probeProgressStart = 48;
  const probeProgressEnd = 82;
  const total = toRun.length;
  let completed = 0;

  const results = await mapPool(
    toRun,
    config.presenceProbe.globalConcurrency,
    async (adapter) => {
      const label = probeProgressLabel(adapter.id);
      await input.onProgress?.(
        probeProgressStart +
          Math.floor((completed / Math.max(1, total)) * (probeProgressEnd - probeProgressStart)),
        `Checking ${label}…`,
      );
      const result = await probeWithRetries(adapter, ctx, limiter);
      completed += 1;
      const pct =
        probeProgressStart +
        Math.floor((completed / Math.max(1, total)) * (probeProgressEnd - probeProgressStart));
      await input.onProgress?.(
        pct,
        completed < total ? `Checked ${label}` : `Checked ${label}`,
      );
      return result;
    },
  );

  for (const r of results) {
    out[r.platform] = r;
  }
  return out;
}
