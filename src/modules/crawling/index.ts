/**
 * Crawling module — public surface.
 *
 * Other modules import ONLY from this file. Internal files are not
 * considered part of the contract (blueprint Section 6: Strong Boundary Rules).
 */

export {
  detectBlockedPage,
  detectParkedDomain,
  isAccessDeniedBySite,
  isParkedDomainPage,
  blockedPageErrorMessage,
  parkedDomainMessage,
  walledGardenDiscoverMessage,
} from './blocked-page';
export { fetchRobots, fetchRobotsPolicy, isAllowedByRobotsText } from './robots';
export type { RobotsPolicy } from './robots';
export {
  fetchSitemap,
  fetchSitemapRecursive,
  discoverSitemaps,
  parseSitemapXmlDetailed,
} from './sitemap';
export { discoverInternalLinks, buildCrawlQueue } from './discover-links';
export { isAuditablePageUrl } from './url-filters';
export {
  classifyNavigationError,
  buildAcquisitionDetail,
  resolveAcquisitionCopy,
  copyForReasonCode,
  copyForFetchStatus,
  assertSafeUserFacingCopy,
  detailForBlocked,
  detailForObserved,
  FETCH_STATUSES,
  ACQUISITION_REASON_CODES,
} from './acquisition';
export type {
  AcquisitionDetail,
  AcquisitionReasonCode,
  AcquisitionStage,
  AcquisitionCopy,
  FetchStatus,
  FetchChannel,
} from './acquisition';
export type {
  CrawlOptions,
  CrawlResult,
  CrawledPage,
  RobotsInfo,
  SitemapEntry,
} from './schemas';
