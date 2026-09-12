import type { PageExtraction, SchemaBlock } from '@modules/extraction';
import {
  PRESENCE_PLATFORMS,
  PresenceSignalsSchema,
  type PresencePlatform,
  type PresenceSignals,
  type PlatformLink,
} from './schemas';
import {
  isComparePath,
  isContactPath,
  isPricingPath,
  matchPlatformUrl,
} from './platforms';
import { extractSameAsUrls } from './same-as';

const CTA_PATTERN =
  /\b(get started|start free|book (a )?demo|request demo|sign up|try free|contact sales|buy now|free trial)\b/i;

const TRUST_PATTERN =
  /\b(trusted by|customers include|our customers|client logos|as seen in|soc 2|iso 27001|security certified)\b/i;

const PHONE_PATTERN = /\+?\d[\d\s().-]{7,}\d/;
const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

function emptyPlatforms(): PresenceSignals['platforms'] {
  const empty = { linked: false, urls: [], foundOnPages: [] as string[] };
  return {
    reddit: { ...empty },
    quora: { ...empty },
    g2: { ...empty },
    capterra: { ...empty },
    trustpilot: { ...empty },
    linkedin: { ...empty },
    x: { ...empty },
    youtube: { ...empty },
    facebook: { ...empty },
    instagram: { ...empty },
    github: { ...empty },
    xiaohongshu: { ...empty },
    zhihu: { ...empty },
    tiktok: { ...empty },
    amazon: { ...empty },
    whirlpool: { ...empty },
    productreview: { ...empty },
    ozbargain: { ...empty },
  };
}

function pathHint(pageUrl: string, rootUrl: string): string {
  try {
    const p = new URL(pageUrl).pathname || '/';
    const root = new URL(rootUrl).pathname || '/';
    if (p === root || p === '/') return 'homepage';
    return p;
  } catch {
    return pageUrl;
  }
}

function registerPlatform(
  platforms: PresenceSignals['platforms'],
  platform: PresencePlatform,
  url: string,
  foundOnPage?: string,
): void {
  const entry = platforms[platform];
  if (!entry.urls.includes(url)) entry.urls.push(url);
  entry.linked = true;
  if (foundOnPage) {
    if (!entry.foundOnPages) entry.foundOnPages = [];
    const hint = foundOnPage;
    if (!entry.foundOnPages.includes(hint)) entry.foundOnPages.push(hint);
  }
}

function schemaHasProductOffers(schemas: SchemaBlock[]): boolean {
  for (const s of schemas) {
    if (s.type !== 'Product' && s.type !== 'SoftwareApplication') continue;
    const raw = s.raw as Record<string, unknown>;
    if (raw.offers) return true;
  }
  return false;
}

export interface AnalyzePresenceInput {
  rootUrl: string;
  pageExtractions: Array<{ url: string; extraction: PageExtraction }>;
  inventoryUrls?: string[];
}

export function analyzePresenceSignals(input: AnalyzePresenceInput): PresenceSignals {
  const platforms = emptyPlatforms();
  const sameAsSet = new Set<string>();
  let hasPricingPage = false;
  let hasComparePage = false;
  let hasPrimaryCta = false;
  let hasTrustSection = false;
  let hasProductOffers = false;
  let hasContactPage = false;
  let phoneFound = false;
  let emailFound = false;

  const rootHost = (() => {
    try {
      return new URL(input.rootUrl).hostname;
    } catch {
      return '';
    }
  })();

  const isHomepage = (url: string) => {
    try {
      const u = new URL(url);
      return u.hostname === rootHost && (u.pathname === '/' || u.pathname === '');
    } catch {
      return false;
    }
  };

  for (const inv of input.inventoryUrls ?? []) {
    try {
      const path = new URL(inv).pathname;
      if (isPricingPath(path)) hasPricingPage = true;
      if (isComparePath(path)) hasComparePage = true;
    } catch {
      /* ignore */
    }
  }

  for (const { url, extraction } of input.pageExtractions) {
    for (const link of extraction.links) {
      if (link.isInternal) {
        try {
          const path = new URL(link.href).pathname;
          if (isPricingPath(path)) hasPricingPage = true;
          if (isComparePath(path)) hasComparePage = true;
          if (isContactPath(path)) hasContactPage = true;
        } catch {
          /* ignore */
        }
        continue;
      }

      const match = matchPlatformUrl(link.href);
      if (match) {
        registerPlatform(
          platforms,
          match.platform,
          match.url,
          pathHint(url, input.rootUrl),
        );
      }
    }

    for (const u of extractSameAsUrls(extraction.schemas)) {
      sameAsSet.add(u);
      const match = matchPlatformUrl(u);
      if (match) {
        registerPlatform(
          platforms,
          match.platform,
          match.url,
          pathHint(url, input.rootUrl),
        );
      }
    }

    if (schemaHasProductOffers(extraction.schemas)) hasProductOffers = true;

    const bodyText = extraction.chunks.map((c) => c.text).join(' ');
    if (isHomepage(url)) {
      if (CTA_PATTERN.test(bodyText)) hasPrimaryCta = true;
      const ctaLink = extraction.links.find(
        (l) => l.isInternal && CTA_PATTERN.test(l.text),
      );
      if (ctaLink) hasPrimaryCta = true;
    }

    if (TRUST_PATTERN.test(bodyText)) hasTrustSection = true;

    if (PHONE_PATTERN.test(bodyText)) phoneFound = true;
    if (EMAIL_PATTERN.test(bodyText)) emailFound = true;
    try {
      if (isContactPath(new URL(url).pathname)) {
        hasContactPage = true;
        if (PHONE_PATTERN.test(bodyText)) phoneFound = true;
        if (EMAIL_PATTERN.test(bodyText)) emailFound = true;
      }
    } catch {
      /* ignore */
    }
  }

  return PresenceSignalsSchema.parse({
    platforms,
    sameAsUrls: [...sameAsSet],
    sameAsCount: sameAsSet.size,
    hasPricingPage,
    hasComparePage,
    hasPrimaryCta,
    hasTrustSection,
    hasProductOffers,
    napSignals: {
      hasContactPage,
      phoneFound,
      emailFound,
    },
  });
}
