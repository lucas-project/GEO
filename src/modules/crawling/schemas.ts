/**
 * Crawling module — types and schemas.
 *
 * All public types are exported from `./index.ts` (the module's contract).
 * Other modules MUST NOT reach into deeper files; they consume this surface.
 */

import { z } from 'zod';
import { normalizeWebsiteUrl } from '@/lib/website-url';

export const CrawlOptionsSchema = z.object({
  url: z.string().min(1).transform((s) => normalizeWebsiteUrl(s)).pipe(z.string().url()),
  maxPages: z.number().int().min(1).max(100).default(10),
  renderJs: z.boolean().default(true),
  screenshot: z.boolean().default(false),
  timeoutMs: z.number().int().min(5000).max(120_000).default(30_000),
  respectRobots: z.boolean().default(true),
});
export type CrawlOptions = z.infer<typeof CrawlOptionsSchema>;

export const RobotsInfoSchema = z.object({
  fetched: z.boolean(),
  allowed: z.boolean(),
  sitemaps: z.array(z.string()),
  crawlDelayMs: z.number().nullable(),
  rawSize: z.number(),
});
export type RobotsInfo = z.infer<typeof RobotsInfoSchema>;

export const SitemapEntrySchema = z.object({
  loc: z.string(),
  lastmod: z.string().nullable().optional(),
});
export type SitemapEntry = z.infer<typeof SitemapEntrySchema>;

export const CrawledPageSchema = z.object({
  url: z.string(),
  finalUrl: z.string(),
  statusCode: z.number(),
  contentType: z.string().nullable(),
  html: z.string().nullable(),
  renderedHtml: z.string().nullable(),
  title: z.string().nullable(),
  fetchedAt: z.string(),
  durationMs: z.number(),
  screenshotPath: z.string().nullable(),
  error: z.string().nullable(),
  /** Counts of dynamic content added after JS hydration, if measured. */
  hydrationDelta: z
    .object({
      addedTextChars: z.number(),
      addedNodes: z.number(),
    })
    .nullable(),
  performance: z
    .object({
      lcpMs: z.number().nullable(),
      mobileBodyTextLength: z.number().nullable(),
    })
    .nullable()
    .optional(),
  /** Present when a headed WAF retry or HTTP fallback was used. */
  fetchChannel: z.enum(['stealth', 'headed', 'http']).optional(),
  fetchStatus: z
    .enum([
      'observed',
      'blocked',
      'timeout',
      'rate_limited',
      'parse_error',
      'unreachable',
      'not_run',
      'legacy_unknown',
    ])
    .optional(),
  blockReason: z.string().optional(),
  contentHash: z.string().optional(),
  htmlTruncated: z.boolean().optional(),
  rawHtmlAvailable: z.boolean().optional(),
  renderedHtmlAvailable: z.boolean().optional(),
  fetchProfile: z.string().optional(),
  acquisitionDetail: z
    .object({
      stage: z.enum(['robots', 'sitemap', 'navigation', 'render', 'parse', 'http_probe']),
      reasonCode: z.enum([
        'nav_timeout',
        'app_dependency',
        'environment_network',
        'waf_block',
        'rate_limited',
        'dns_or_tls',
        'connection_reset',
        'nav_aborted',
        'parse_failed',
        'err_failed_unclassified',
        'legacy_missing',
        'not_audited',
        'http_partial_observed',
        'observed_ok',
      ]),
      userMessage: z.string(),
      nextAction: z.string(),
      technicalMessage: z.string().optional(),
      elapsedMs: z.number().optional(),
      httpStatus: z.number().int().optional(),
      finalUrl: z.string().optional(),
      fetchChannel: z.enum(['stealth', 'headed', 'http']).optional(),
      retryCount: z.number().int().optional(),
      attemptedAt: z.string().optional(),
      waitCondition: z.string().optional(),
      browserRenderComplete: z.boolean().optional(),
      attempts: z
        .array(
          z.object({
            channel: z.enum(['stealth', 'headed', 'http']),
            outcome: z.enum(['success', 'failed', 'skipped']),
            elapsedMs: z.number(),
            reasonCode: z.string().optional(),
            technicalMessage: z.string().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});
export type CrawledPage = z.infer<typeof CrawledPageSchema>;

export const CrawlResultSchema = z.object({
  rootUrl: z.string(),
  pages: z.array(CrawledPageSchema),
  robots: RobotsInfoSchema,
  sitemap: z.array(SitemapEntrySchema),
  startedAt: z.string(),
  finishedAt: z.string(),
});
export type CrawlResult = z.infer<typeof CrawlResultSchema>;
