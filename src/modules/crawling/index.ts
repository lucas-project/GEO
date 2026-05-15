/**
 * Crawling module — public surface.
 *
 * Other modules import ONLY from this file. Internal files are not
 * considered part of the contract (blueprint Section 6: Strong Boundary Rules).
 */

export { crawlingService, crawl } from './service';
export { shutdownBrowser } from './browser/pool';
export { registerCrawlHandlers } from './handlers';
export { discoverInternalLinks, buildCrawlQueue } from './discover-links';
export type {
  CrawlOptions,
  CrawlResult,
  CrawledPage,
  RobotsInfo,
  SitemapEntry,
} from './schemas';
