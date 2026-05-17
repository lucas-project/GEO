/**
 * Central runtime configuration.
 *
 * All env access goes through this file. Never read `process.env` directly
 * inside feature modules — it makes testing and swapping providers painful.
 */

type AIProviderName = 'mock' | 'openai' | 'anthropic' | 'gemini' | 'ollama';
type QueueDriver = 'memory' | 'bullmq';

function bool(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return value === '1' || value.toLowerCase() === 'true';
}

function int(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  env: (process.env.NODE_ENV ?? 'development') as 'development' | 'production' | 'test',
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
  port: int(process.env.PORT, 3000),

  database: {
    url: process.env.DATABASE_URL ?? 'file:./dev.db',
  },

  queue: {
    driver: (process.env.QUEUE_DRIVER as QueueDriver) ?? 'memory',
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },

  /** Optional: require `Authorization: Bearer …` or `x-geo-api-key` for /api/* */
  apiSecret: process.env.GEO_API_SECRET ?? '',

  wordpress: {
    baseUrl: process.env.WORDPRESS_BASE_URL ?? '',
    username: process.env.WORDPRESS_USERNAME ?? '',
    appPassword: process.env.WORDPRESS_APP_PASSWORD ?? '',
  },

  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
    model: process.env.OLLAMA_MODEL ?? 'llama3.2',
    embedModel: process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text',
  },

  embeddings: {
    /** Max semantic chunks to embed per audit (cost / latency guard) */
    maxChunksPerAudit: int(process.env.GEO_EMBEDDING_MAX_CHUNKS, 24),
  },

  monitoring: {
    /** Fallback webhook if Site.webhookUrl is empty */
    defaultWebhookUrl: process.env.MONITORING_WEBHOOK_URL ?? '',
    /** Default re-audit interval when adding a site (hours) */
    defaultIntervalHours: int(process.env.MONITOR_INTERVAL_HOURS, 24),
    /** Cron secret for POST /api/cron/monitor */
    cronSecret: process.env.CRON_SECRET ?? '',
    /** Inline scheduler interval for in-memory queue (ms); 0 = disabled */
    inlineSchedulerMs: int(process.env.MONITOR_SCHEDULER_MS, 0),
    /** BullMQ repeatable cron pattern for monitoring.sweep */
    sweepCronPattern: process.env.MONITOR_SWEEP_CRON ?? '0 6 * * *',
    overallRegressionThreshold: int(process.env.MONITOR_REGRESSION_THRESHOLD, 8),
    improvementThreshold: int(process.env.MONITOR_IMPROVEMENT_THRESHOLD, 8),
    dimensionDeltaThreshold: int(process.env.MONITOR_DIMENSION_DELTA_THRESHOLD, 10),
    /** Treat monitor lock as stale after this many minutes */
    runningLockTimeoutMinutes: int(process.env.MONITOR_LOCK_TIMEOUT_MINUTES, 45),
    /** Hours to wait after failure before next attempt (scaled by failure count) */
    failureBackoffBaseHours: int(process.env.MONITOR_FAILURE_BACKOFF_HOURS, 6),
    maxFailureBackoffHours: int(process.env.MONITOR_MAX_BACKOFF_HOURS, 72),
    /** Min change in citation visibility (0–1) to alert */
    citationDeltaThreshold: parseFloat(process.env.MONITOR_CITATION_DELTA_THRESHOLD ?? '0.15'),
    entityDeltaThreshold: int(process.env.MONITOR_ENTITY_DELTA_THRESHOLD, 3),
    readabilityDeltaThreshold: int(process.env.MONITOR_READABILITY_DELTA_THRESHOLD, 12),
    /** Pages to crawl during health-check recovery runs */
    healthCheckMaxPages: int(process.env.MONITOR_HEALTH_CHECK_MAX_PAGES, 2),
  },

  intelligence: {
    minCohortSamples: int(process.env.INTELLIGENCE_MIN_COHORT_SAMPLES, 20),
    highScoreEmbeddingThreshold: int(process.env.INTELLIGENCE_EMBED_SCORE_THRESHOLD, 80),
    citationEmbedVisibilityThreshold: parseFloat(
      process.env.INTELLIGENCE_CITATION_EMBED_THRESHOLD ?? '0.4',
    ),
    readabilityHighThreshold: int(process.env.INTELLIGENCE_READABILITY_HIGH, 75),
  },

  ai: {
    provider: (process.env.AI_PROVIDER as AIProviderName) ?? 'mock',
    openai: {
      apiKey: process.env.OPENAI_API_KEY ?? '',
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY ?? '',
      model: process.env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-latest',
    },
    gemini: {
      apiKey: process.env.GOOGLE_API_KEY ?? '',
      model: process.env.GEMINI_MODEL ?? 'gemini-1.5-flash',
    },
  },

  /** GEO content ideas — prefer a small but capable model (override per provider). */
  geoContent: {
    openaiModel: process.env.GEO_CONTENT_OPENAI_MODEL ?? 'gpt-4o-mini',
    geminiModel: process.env.GEO_CONTENT_GEMINI_MODEL ?? 'gemini-2.0-flash',
    ollamaModel: process.env.GEO_CONTENT_OLLAMA_MODEL ?? 'llama3.1:8b',
    anthropicModel: process.env.GEO_CONTENT_ANTHROPIC_MODEL ?? 'claude-3-5-haiku-latest',
  },

  crawl: {
    userAgent: process.env.CRAWL_USER_AGENT ?? 'GeoAIBot/0.1',
    timeoutMs: int(process.env.CRAWL_TIMEOUT_MS, 30_000),
    maxPages: int(process.env.CRAWL_MAX_PAGES, 20),
    headless: bool(process.env.CRAWL_HEADLESS, true),
    /** When false, ignores robots.txt Disallow (useful for strict dev sites; prefer true in prod). */
    respectRobots: bool(process.env.CRAWL_RESPECT_ROBOTS, true),
  },

  /** GEO-aware page discovery (audit picker + crawl queue). */
  discovery: {
    /** 0 = no cap on discovered URLs shown in the picker. */
    maxCandidates: int(process.env.DISCOVERY_MAX_CANDIDATES, 0),
    maxSitemapFiles: int(process.env.DISCOVERY_MAX_SITEMAP_FILES, 25),
    maxSitemapUrls: int(process.env.DISCOVERY_MAX_SITEMAP_URLS, 10_000),
    linkGraphDepth: int(process.env.DISCOVERY_LINK_GRAPH_DEPTH, 2),
    linkGraphMaxPages: int(process.env.DISCOVERY_LINK_GRAPH_MAX_PAGES, 8),
    probeCount: int(process.env.DISCOVERY_PROBE_COUNT, 30),
    probeConcurrency: int(process.env.DISCOVERY_PROBE_CONCURRENCY, 3),
    timeoutMs: int(process.env.DISCOVERY_TIMEOUT_MS, 300_000),
  },

  logging: {
    level: process.env.LOG_LEVEL ?? 'info',
    pretty: process.env.NODE_ENV !== 'production',
  },
} as const;

export type AppConfig = typeof config;
