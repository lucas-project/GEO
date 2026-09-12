/**
 * Central runtime configuration.
 *
 * All env access goes through this file. Never read `process.env` directly
 * inside feature modules — it makes testing and swapping providers painful.
 */

type AIProviderName = 'mock' | 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'minimax';
type InheritedAIProvider = 'inherit' | AIProviderName;
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

/** Strip surrounding quotes some editors add around .env values. */
function envSecret(value: string | undefined): string {
  const t = (value ?? '').trim();
  if (
    (t.startsWith("'") && t.endsWith("'")) ||
    (t.startsWith('"') && t.endsWith('"'))
  ) {
    return t.slice(1, -1).trim();
  }
  return t;
}

const resolvedAiProvider = (process.env.AI_PROVIDER as AIProviderName) ?? 'mock';
/** When a real AI provider is configured, presence LLM search steps default on (override with =0). */
const presenceLlmSearchDefault = resolvedAiProvider !== 'mock';
/** MiniMax has no embeddings API — default to mock unless EMBEDDINGS_AI_PROVIDER is set. */
const resolvedEmbeddingsProvider: InheritedAIProvider =
  (process.env.EMBEDDINGS_AI_PROVIDER as InheritedAIProvider) ??
  (resolvedAiProvider === 'minimax' ? 'mock' : 'inherit');

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
    /** In-memory driver: max jobs executing at once (heavy jobs still capped at one). */
    maxConcurrent: int(process.env.QUEUE_MAX_CONCURRENT, 2),
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
    model: process.env.OLLAMA_MODEL ?? 'llama3.1:8b',
    embedModel: process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text',
  },

  embeddings: {
    /** Max semantic chunks to embed per audit (cost / latency guard) */
    maxChunksPerAudit: int(process.env.GEO_EMBEDDING_MAX_CHUNKS, 24),
    /** Separate from chat when AI_PROVIDER=minimax (defaults to mock). Set ollama for local vectors. */
    aiProvider: resolvedEmbeddingsProvider,
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
    citationProbabilityDeltaThreshold: parseFloat(
      process.env.MONITOR_CITATION_PROB_DELTA_THRESHOLD ?? '0.12',
    ),
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
    minCalibrationSamples: int(process.env.SCORING_MIN_CALIBRATION_SAMPLES, 25),
  },

  /** Hierarchical GEO scoring — layer weights, gating, citation probability. */
  scoring: {
    layerBlend: {
      foundation: 0.14,
      understanding: 0.18,
      presence: 0.13,
      generation: 0.22,
      outcome: 0.33,
    },
    layerDimensionWeights: {
      foundation: {
        crawlerFriendliness: 1.2,
        structuredContent: 1.1,
        semanticClarity: 1.0,
      },
      understanding: {
        entityClarity: 1.2,
        chunkOptimization: 1.0,
        aiReadability: 1.1,
        trustSignals: 0.8,
      },
      presence: {
        offSitePresence: 1.0,
      },
      generation: {
        answerExtraction: 1.3,
        summarizationQuality: 1.0,
      },
      outcome: {
        citationFriendliness: 1.0,
        commercialReadiness: 1.0,
      },
    },
    gates: {
      crawlerBlockedThreshold: 30,
      crawlerBlockedCap: 40,
      crawlerWeakThreshold: 50,
      crawlerWeakCap: 60,
      foundationWeakThreshold: 45,
      propagationFactor: 0.92,
      layerBuffer: 8,
      answerExtractionCeilings: [
        { maxScore: 40, citationCap: 55 },
        { maxScore: 60, citationCap: 75 },
      ],
      offSitePresenceWeakThreshold: 35,
      offSitePresenceOutcomeCap: 65,
    },
    citationSnapshotMargin: parseFloat(process.env.SCORING_CITATION_SNAPSHOT_MARGIN ?? '0.1'),
    calibrationMaxAdjustment: 0.15,
  },

  ai: {
    provider: resolvedAiProvider,
    openai: {
      apiKey: process.env.OPENAI_API_KEY ?? '',
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      /** LiteLLM / LocalAI / LM Studio — OpenAI-compatible gateway base URL (optional). */
      baseUrl: (process.env.OPENAI_BASE_URL ?? '').replace(/\/$/, ''),
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

  /** Perplexity Sonar — used for live Perplexity slot in AI simulation (not AI_PROVIDER). */
  perplexity: {
    apiKey: envSecret(process.env.PERPLEXITY_API_KEY),
    model: process.env.PERPLEXITY_MODEL ?? 'sonar',
  },

  /**
   * AI search simulation — can use a different provider than the rest of the app.
   * Set SIMULATION_AI_PROVIDER=ollama to run four local models without cloud API keys.
   */
  simulation: {
    aiProvider:
      (process.env.SIMULATION_AI_PROVIDER as InheritedAIProvider) === 'inherit' ||
      !process.env.SIMULATION_AI_PROVIDER
        ? resolvedAiProvider
        : ((process.env.SIMULATION_AI_PROVIDER as AIProviderName) ?? resolvedAiProvider),
    /** One Ollama model per platform slot (used when simulation.aiProvider=ollama). */
    ollamaModels: {
      chatgpt: process.env.SIMULATION_OLLAMA_CHATGPT ?? 'llama3.2',
      gemini: process.env.SIMULATION_OLLAMA_GEMINI ?? 'qwen2.5:7b',
      claude: process.env.SIMULATION_OLLAMA_CLAUDE ?? 'mistral',
      perplexity: process.env.SIMULATION_OLLAMA_PERPLEXITY ?? 'gemma2:2b',
    },
    /** Cap generation length per platform response (Ollama num_predict). */
    maxTokens: int(process.env.SIMULATION_MAX_TOKENS, 512),
    /** Batch prompt parallelism; 0 = auto (1 for ollama, 2 for cloud). */
    batchConcurrency: int(process.env.SIMULATION_BATCH_CONCURRENCY, 0),
    /** Extra LLM citation extraction on single runs (batch uses combined-llm: one pass per question). */
    llmCitationExtraction: bool(process.env.SIMULATION_LLM_CITATIONS, true),
    /** Keep Ollama models loaded between batch platform calls (e.g. "15m"). */
    ollamaKeepAlive: process.env.SIMULATION_OLLAMA_KEEP_ALIVE ?? '15m',
    /** Batch: one local model + personas for all slots (much faster than 4 models). Default on when simulation uses Ollama. */
    batchSingleModel: bool(
      process.env.SIMULATION_BATCH_SINGLE_MODEL,
      ((process.env.SIMULATION_AI_PROVIDER as InheritedAIProvider) === 'inherit' ||
      !process.env.SIMULATION_AI_PROVIDER
        ? resolvedAiProvider
        : (process.env.SIMULATION_AI_PROVIDER as AIProviderName)) === 'ollama',
    ),
    /** Shorter answers during batch runs (Ollama num_predict). */
    batchMaxTokens: int(process.env.SIMULATION_BATCH_MAX_TOKENS, 384),
    /** Skip re-warming Ollama within this many minutes (same model set). */
    warmCacheMinutes: int(process.env.SIMULATION_WARM_CACHE_MINUTES, 12),
  },

  minimax: {
    apiKey: envSecret(process.env.MINIMAX_API_KEY),
    baseUrl: (process.env.MINIMAX_BASE_URL ?? 'https://api.minimax.io/v1').replace(/\/$/, ''),
    model: process.env.MINIMAX_MODEL ?? 'MiniMax-M2.5',
  },

  /** On-page keyword refinement for presence search (defaults to AI_PROVIDER). */
  siteKeywords: {
    aiProvider: (process.env.SITE_KEYWORDS_AI_PROVIDER as InheritedAIProvider) ?? 'inherit',
    minimaxModel:
      process.env.SITE_KEYWORDS_MINIMAX_MODEL ?? process.env.MINIMAX_MODEL ?? 'MiniMax-M2.5',
    ollamaModel:
      process.env.SITE_KEYWORDS_OLLAMA_MODEL ??
      process.env.PRESENCE_PROBE_OLLAMA_MODEL ??
      process.env.OLLAMA_MODEL ??
      'llama3.1:8b',
  },

  /** GEO content ideas — prefer a small but capable model (override per provider). */
  geoContent: {
    openaiModel: process.env.GEO_CONTENT_OPENAI_MODEL ?? 'gpt-4o-mini',
    geminiModel: process.env.GEO_CONTENT_GEMINI_MODEL ?? 'gemini-2.0-flash',
    ollamaModel: process.env.GEO_CONTENT_OLLAMA_MODEL ?? 'llama3.1:8b',
    anthropicModel: process.env.GEO_CONTENT_ANTHROPIC_MODEL ?? 'claude-3-5-haiku-latest',
    minimaxModel: process.env.GEO_CONTENT_MINIMAX_MODEL ?? process.env.MINIMAX_MODEL ?? 'MiniMax-M2.5',
  },

  search: {
    serperApiKey: process.env.SERPER_API_KEY ?? '',
    tavilyApiKey: process.env.TAVILY_API_KEY ?? '',
  },

  /** Off-site presence Playwright probe (link.md). */
  presenceProbe: {
    enabled: bool(process.env.PRESENCE_PROBE_ENABLED, true),
    /**
     * Off-site probe browser: cloak (default, stealth Chromium via CloakBrowser),
     * firefox (legacy Reddit), chromium (bundled Playwright).
     */
    browser: (() => {
      const b = process.env.PRESENCE_PROBE_BROWSER?.toLowerCase();
      if (b === 'firefox') return 'firefox' as const;
      if (b === 'chromium') return 'chromium' as const;
      return 'cloak' as const;
    })(),
    /** HTTP/SOCKS5 proxy for CloakBrowser (optional). */
    cloakProxy: process.env.PRESENCE_PROBE_CLOAK_PROXY?.trim() || undefined,
    cloakHumanize: bool(process.env.PRESENCE_PROBE_CLOAK_HUMANIZE, true),
    globalConcurrency: int(process.env.PRESENCE_PROBE_CONCURRENCY, 3),
    platformIntervalMinMs: int(process.env.PRESENCE_PROBE_INTERVAL_MIN_MS, 2000),
    platformIntervalMaxMs: int(process.env.PRESENCE_PROBE_INTERVAL_MAX_MS, 5000),
    timeoutMs: int(process.env.PRESENCE_PROBE_TIMEOUT_MS, 28_000),
    /** Hard cap per platform adapter (Quora/Playwright cannot block the whole probe). */
    platformMaxMs: int(process.env.PRESENCE_PROBE_PLATFORM_MAX_MS, 45_000),
    /** HTTP-only SERP fetches (search supplement) — fail fast vs platform probes. */
    serpTimeoutMs: int(process.env.PRESENCE_PROBE_SERP_TIMEOUT_MS, 12_000),
    retries: int(process.env.PRESENCE_PROBE_RETRIES, 2),
    requestsPerMinute: int(process.env.PRESENCE_PROBE_RPM, 10),
    /** Playwright storage_state JSON path for Reddit session reuse (optional). */
    storageStatePath: process.env.PRESENCE_PROBE_STORAGE_STATE_PATH?.trim() || '',
    searchSupplementEnabled: bool(process.env.PRESENCE_PROBE_SEARCH_SUPPLEMENT, true),
    searchSupplementMaxQueries: int(process.env.PRESENCE_PROBE_SEARCH_SUPPLEMENT_MAX_QUERIES, 18),
    searchCurateEnabled: bool(
      process.env.PRESENCE_PROBE_SEARCH_CURATE,
      presenceLlmSearchDefault,
    ),
    searchOrchestrateEnabled: bool(
      process.env.PRESENCE_PROBE_SEARCH_ORCHESTRATE,
      presenceLlmSearchDefault,
    ),
    searchOrchestrateMaxRounds: int(process.env.PRESENCE_PROBE_SEARCH_ORCHESTRATE_MAX_ROUNDS, 2),
    searchOrchestrateQueriesPerRound: int(
      process.env.PRESENCE_PROBE_SEARCH_ORCHESTRATE_QUERIES_PER_ROUND,
      4,
    ),
    searchPlanEnabled: bool(process.env.PRESENCE_PROBE_SEARCH_PLAN, presenceLlmSearchDefault),
    redditCurateEnabled: bool(
      process.env.PRESENCE_PROBE_REDDIT_CURATE,
      presenceLlmSearchDefault,
    ),
    /** Ollama model for presence LLM steps when AI_PROVIDER=ollama. */
    ollamaModel:
      process.env.PRESENCE_PROBE_OLLAMA_MODEL ??
      process.env.GEO_CONTENT_OLLAMA_MODEL ??
      'llama3.1:8b',
    /** MiniMax model for presence LLM steps when AI_PROVIDER=minimax. */
    minimaxModel:
      process.env.PRESENCE_PROBE_MINIMAX_MODEL ?? process.env.MINIMAX_MODEL ?? 'MiniMax-M2.5',
    /** Optional Agent Reach CLI enrichment (xhs-cli, rdt-cli, Jina). See docs/agent-reach-presence.md */
    agentReachEnabled: bool(process.env.PRESENCE_PROBE_AGENT_REACH, false),
    agentReachXhs: bool(
      process.env.PRESENCE_PROBE_AGENT_REACH_XHS,
      bool(process.env.PRESENCE_PROBE_AGENT_REACH, false),
    ),
    agentReachRdt: bool(process.env.PRESENCE_PROBE_AGENT_REACH_RDT, false),
    agentReachJina: bool(
      process.env.PRESENCE_PROBE_AGENT_REACH_JINA,
      bool(process.env.PRESENCE_PROBE_AGENT_REACH, false),
    ),
    agentReachTimeoutMs: int(process.env.PRESENCE_PROBE_AGENT_REACH_TIMEOUT_MS, 20_000),
    xhsCli: process.env.XHS_CLI?.trim() || 'xhs',
    rdtCli: process.env.RDT_CLI?.trim() || 'rdt',
  },

  scoringDynamics: {
    auditDecayDays: [14, 30, 60, 90] as const,
    auditDecayWeights: [1, 0.9, 0.75, 0.6] as const,
    platformWeightsByVertical: {
      default: { chatgpt: 0.3, perplexity: 0.25, claude: 0.2, gemini: 0.25 },
      b2b_saas: { chatgpt: 0.35, perplexity: 0.3, claude: 0.2, gemini: 0.15 },
      d2c: { chatgpt: 0.2, perplexity: 0.15, claude: 0.15, gemini: 0.25 },
    },
  },

  crawl: {
    /** Declared to robots.txt and simple HTTP fetches. */
    userAgent: process.env.CRAWL_USER_AGENT ?? 'GeoAIBot/0.1',
    /** Playwright browser context — realistic Chrome UA reduces bot blocks on many sites. */
    browserUserAgent:
      process.env.CRAWL_BROWSER_USER_AGENT ??
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    timeoutMs: int(process.env.CRAWL_TIMEOUT_MS, 30_000),
    /** Shorter timeout for non-homepage audit pages (extraction only needs DOM). */
    auditSecondaryTimeoutMs: int(process.env.CRAWL_AUDIT_SECONDARY_TIMEOUT_MS, 18_000),
    maxPages: int(process.env.CRAWL_MAX_PAGES, 20),
    /** Parallel Playwright renders during multi-page audits. */
    auditConcurrency: int(process.env.CRAWL_AUDIT_CONCURRENCY, 3),
    /** Parallel cheerio/entity extraction during audits. */
    extractionConcurrency: int(process.env.CRAWL_EXTRACTION_CONCURRENCY, 3),
    headless: bool(process.env.CRAWL_HEADLESS, true),
    /** When a WAF blocks headless Chromium, retry once with installed Chrome (not bundled Chromium). */
    retryHeadedOnBlock: bool(process.env.CRAWL_RETRY_HEADED_ON_BLOCK, true),
    /** Playwright channel for WAF retry: `chrome`, `msedge`, or `chrome-beta`. */
    wafRetryChromeChannel:
      process.env.CRAWL_WAF_RETRY_CHROME_CHANNEL?.trim() || 'chrome',
    /** playwright-extra + puppeteer-extra-plugin-stealth for audit/hub renders. */
    useStealth: bool(process.env.CRAWL_USE_STEALTH, true),
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
    /** Lower concurrency avoids rate-limiting slow ecommerce hosts during probes. */
    probeConcurrency: int(process.env.DISCOVERY_PROBE_CONCURRENCY, 4),
    /** Playwright timeout for ranking probes (signals only need DOM). */
    probeTimeoutMs: int(process.env.DISCOVERY_PROBE_TIMEOUT_MS, 20_000),
    linkGraphConcurrency: int(process.env.DISCOVERY_LINK_GRAPH_CONCURRENCY, 4),
    timeoutMs: int(process.env.DISCOVERY_TIMEOUT_MS, 300_000),
  },

  logging: {
    level: process.env.LOG_LEVEL ?? 'info',
    pretty: process.env.NODE_ENV !== 'production',
  },
} as const;

export type AppConfig = typeof config;
