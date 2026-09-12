import 'server-only';

import { normalizeWebsiteUrl } from '@/lib/website-url';
import { config } from '@shared/config';
import { crawlSinglePage } from '@modules/crawling/server';
import * as cheerio from 'cheerio';
import { extractSchemas } from '@modules/extraction/extractors/schema';
import { detectSiteKeywordsFromPages } from './detect-site-keywords';
import { pageContextFromPages } from './page-context';
import type { EntityPageInput } from './resolve-entity';
import { refineSiteKeywordsWithModel } from './refine-site-keywords';

async function crawlPagesForKeywords(siteUrl: string): Promise<EntityPageInput[]> {
  const normalized = normalizeWebsiteUrl(siteUrl);
  const pages: EntityPageInput[] = [];
  const urls = [normalized, `${normalized.replace(/\/$/, '')}/about`];

  for (const url of urls) {
    try {
      const page = await crawlSinglePage(url, {
        timeoutMs: Math.min(config.crawl.timeoutMs, 25_000),
        screenshot: false,
        auditId: 'site-keywords',
        profile: 'hub',
      });
      const html = page.renderedHtml ?? page.html ?? '';
      if (!html) continue;
      const schemas = extractSchemas(cheerio.load(html));
      pages.push({ url: page.finalUrl || url, html, schemas });
    } catch {
      /* skip */
    }
  }

  return pages;
}

/** Crawl homepage (+ about) and return 5–10 on-page keywords for presence search. */
export async function fetchSiteKeywords(siteUrl: string): Promise<string[]> {
  const pages = await crawlPagesForKeywords(siteUrl);
  const detected = detectSiteKeywordsFromPages(pages);
  if (!detected.length) return detected;
  const context = pageContextFromPages(pages);
  return refineSiteKeywordsWithModel({
    candidates: detected,
    ...context,
  });
}
