import type { PageExtraction } from './schemas';
import { SiteProfileSchema, type SiteProfile } from './site-profile-schema';
import type { EvidenceBundle } from '@modules/geo-audit';

const PROFILE_VERSION = 'site-profile-v1';

function firstNonEmpty(values: Array<string | null | undefined>): string | null {
  return values.find((value) => Boolean(value?.trim()))?.trim() ?? null;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function schemaName(extraction: PageExtraction, types: string[]): string | null {
  for (const schema of extraction.schemas) {
    if (!types.includes(schema.type)) continue;
    const raw = schema.raw as Record<string, unknown>;
    if (typeof raw.name === 'string' && raw.name.trim()) return raw.name.trim();
  }
  return null;
}

function evidenceForPage(bundle: EvidenceBundle | undefined, url: string): string[] {
  return bundle?.evidence.filter((item) => item.finalUrl === url || item.requestedUrl === url).map((item) => item.id) ?? [];
}

/** Build a deterministic, reviewable site identity draft from extracted pages. */
export function buildSiteProfile(input: {
  siteUrl: string;
  pages: Array<{ pageUrl: string; extraction: PageExtraction }>;
  evidenceBundle?: EvidenceBundle;
}): SiteProfile {
  const first = input.pages[0]?.extraction;
  const all = input.pages.map((page) => page.extraction);
  const organization = first ? schemaName(first, ['Organization', 'Corporation', 'LocalBusiness', 'WebSite']) : null;
  const titleName = firstNonEmpty(all.flatMap((page) => [page.metadata.ogSiteName, page.metadata.title?.split(/[|\-–]/)[0]]));
  const domainName = (() => {
    try {
      return new URL(input.siteUrl).hostname.replace(/^www\./, '').split('.')[0];
    } catch {
      return input.siteUrl;
    }
  })();
  const name = organization ?? titleName ?? domainName;
  const evidenceIds = unique(input.pages.flatMap((page) => evidenceForPage(input.evidenceBundle, page.pageUrl)));

  const offerings = unique(
    all.flatMap((page) => [
      ...page.schemas
        .filter((schema) => ['Product', 'Service', 'SoftwareApplication'].includes(schema.type))
        .map((schema) => {
          const raw = schema.raw as Record<string, unknown>;
          return typeof raw.name === 'string' ? raw.name : '';
        }),
      ...page.entities
        .filter((entity) => ['schema', 'page_text'].includes(entity.source ?? ''))
        .filter((entity) => ['product', 'concept'].includes(entity.kind))
        .map((entity) => entity.name),
    ]),
  ).slice(0, 20);

  const languages = unique(all.map((page) => page.metadata.language ?? '')).slice(0, 8);
  const aliases = unique(all.map((page) => page.metadata.ogSiteName ?? ''))
    .filter((alias) => alias.toLowerCase() !== name.toLowerCase())
    .slice(0, 10);

  const hasService = all.some((page) =>
    page.schemas.some((schema) => schema.type === 'LocalBusiness' || schema.type === 'Service'),
  );
  const role: SiteProfile['primaryEntity']['role'] = hasService ? 'service' : offerings.length > 0 ? 'product' : 'unknown';
  const confidence = organization ? 0.9 : titleName ? 0.7 : 0.4;

  return SiteProfileSchema.parse({
    version: PROFILE_VERSION,
    primaryEntity: { name, role, evidenceIds },
    aliases,
    offerings,
    customerSegments: [],
    markets: [],
    languages,
    relatedEntities: [],
    evidenceIds,
    confidence,
    confirmationState: confidence >= 0.8 ? 'draft' : 'needs_review',
  });
}
