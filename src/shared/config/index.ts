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

  logging: {
    level: process.env.LOG_LEVEL ?? 'info',
    pretty: process.env.NODE_ENV !== 'production',
  },
} as const;

export type AppConfig = typeof config;
