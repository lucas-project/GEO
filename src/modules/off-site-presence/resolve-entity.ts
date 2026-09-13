import * as cheerio from 'cheerio';
import type { SchemaBlock } from '@modules/extraction';
import { extractSameAsUrls } from '@modules/brand-presence';
import { extractMetadata } from '@modules/extraction';
import { buildBrandAliases, normalizeDomain, slugifyBrand } from './aliases';
import type { BrandEntityResult } from './schemas';
import { BrandEntityResultSchema } from './schemas';

const ORG_TYPES = new Set([
  'Organization',
  'LocalBusiness',
  'Corporation',
  'OnlineBusiness',
  'WebSite',
]);

const COPYRIGHT_RE = /©\s*(?:\d{4}[-–]\d{4}|\d{4})\s+([^|<\n]+)/i;
const TECH_KEYWORDS =
  /\b(technology|software|product|iphone|android|saas|platform|app|digital|cloud|ai)\b/i;

export interface EntityPageInput {
  url: string;
  html: string;
  schemas?: SchemaBlock[];
}

export interface ResolveEntityInput {
  siteUrl: string;
  pages: EntityPageInput[];
  brandOverride?: string;
}

interface NameCandidate {
  name: string;
  source: string;
  weight: number;
}

function extractOrgNames(schemas: SchemaBlock[]): NameCandidate[] {
  const out: NameCandidate[] = [];
  for (const block of schemas) {
    if (!ORG_TYPES.has(block.type)) continue;
    const raw = block.raw as Record<string, unknown>;
    if (typeof raw.name === 'string' && raw.name.trim()) {
      out.push({ name: raw.name.trim(), source: `schema:${block.type}`, weight: 0.9 });
    }
  }
  return out;
}

function extractBrandNodes(schemas: SchemaBlock[]): string[] {
  const brands = new Set<string>();
  for (const block of schemas) {
    if (block.type !== 'Brand' && block.type !== 'Product') continue;
    const raw = block.raw as Record<string, unknown>;
    if (typeof raw.name === 'string' && raw.name.trim().length >= 2) {
      brands.add(raw.name.trim());
    }
    const brand = raw.brand as Record<string, unknown> | undefined;
    if (brand && typeof brand.name === 'string' && brand.name.trim().length >= 2) {
      brands.add(brand.name.trim());
    }
  }
  return [...brands];
}

function extractFooterCopyright($: cheerio.CheerioAPI): string | null {
  const footer = $('footer').text();
  const match = COPYRIGHT_RE.exec(footer);
  if (match?.[1]) return match[1].trim().replace(/\s+/g, ' ').slice(0, 80);
  const bodyMatch = COPYRIGHT_RE.exec($('body').text().slice(-4000));
  return bodyMatch?.[1]?.trim().replace(/\s+/g, ' ').slice(0, 80) ?? null;
}

function extractNavBrandHints($: cheerio.CheerioAPI): string[] {
  const hints = new Set<string>();
  $('nav a, [role="navigation"] a').each((_, el) => {
    const text = $(el).text().trim();
    if (text.length >= 2 && text.length <= 40 && /^[A-Z]/.test(text)) {
      hints.add(text);
    }
  });
  return [...hints];
}

function pickPrimaryBrand(candidates: NameCandidate[], domain: string): {
  primary: string;
  confidence: number;
  sources: string[];
} {
  if (candidates.length === 0) {
    const stem = domain.split('.')[0] ?? domain;
    const name = stem.charAt(0).toUpperCase() + stem.slice(1);
    return { primary: name, confidence: 0.35, sources: ['domain-stem'] };
  }

  const scores = new Map<string, { score: number; sources: Set<string> }>();
  for (const c of candidates) {
    const key = c.name.toLowerCase();
    const entry = scores.get(key) ?? { score: 0, sources: new Set<string>() };
    entry.score += c.weight;
    entry.sources.add(c.source);
    scores.set(key, entry);
  }

  let best = '';
  let bestScore = 0;
  let bestSources: string[] = [];
  for (const [key, { score, sources }] of scores) {
    if (score > bestScore) {
      bestScore = score;
      best = candidates.find((c) => c.name.toLowerCase() === key)?.name ?? key;
      bestSources = [...sources];
    }
  }

  const confidence =
    bestScore >= 2 ? Math.min(1, 0.9 + (bestScore - 2) * 0.05) : bestScore >= 1 ? 0.85 : Math.min(0.75, bestScore / 1.5);
  return { primary: best, confidence, sources: bestSources };
}

export function resolveBrandEntity(input: ResolveEntityInput): BrandEntityResult {
  if (input.brandOverride?.trim()) {
    const primary = input.brandOverride.trim();
    return BrandEntityResultSchema.parse({
      primaryBrand: primary,
      aliases: buildBrandAliases(primary),
      confidence: 1,
      needsReview: false,
      sources: ['override'],
      flags: { marketplaceMode: false, ambiguousGeneric: false, subBrands: [] },
      sameAsUrls: [],
    });
  }

  const domain = normalizeDomain(input.siteUrl);
  const candidates: NameCandidate[] = [];
  const allSchemas: SchemaBlock[] = [];
  const sameAsSet = new Set<string>();
  let titleText = '';
  let h1Text = '';

  for (const page of input.pages) {
    const $ = cheerio.load(page.html);
    const meta = extractMetadata($);
    if (meta.ogSiteName) {
      candidates.push({ name: meta.ogSiteName, source: 'og:site_name', weight: 1.0 });
    }
    if (meta.ogTitle) {
      const short = meta.ogTitle.split(/[|\-–]/)[0]?.trim();
      if (short) candidates.push({ name: short, source: 'og:title', weight: 0.7 });
    }
    if (meta.title) {
      titleText = meta.title;
      const short = meta.title.split(/[|\-–]/)[0]?.trim();
      if (short) candidates.push({ name: short, source: 'title', weight: 0.6 });
    }
    h1Text = $('h1').first().text().trim() || h1Text;

    const copyright = extractFooterCopyright($);
    if (copyright) {
      candidates.push({ name: copyright, source: 'footer-copyright', weight: 0.75 });
    }

    if (page.schemas?.length) {
      allSchemas.push(...page.schemas);
      candidates.push(...extractOrgNames(page.schemas));
      for (const u of extractSameAsUrls(page.schemas)) sameAsSet.add(u);
    }
  }

  const brandNodes = extractBrandNodes(allSchemas);
  const navHints = input.pages.flatMap((p) => extractNavBrandHints(cheerio.load(p.html)));
  const marketplaceMode = brandNodes.length >= 3 || navHints.length >= 8;

  const { primary, confidence, sources } = pickPrimaryBrand(candidates, domain);
  const primaryBrand = primary;

  const ambiguousGeneric =
    primaryBrand.length <= 5 &&
    !TECH_KEYWORDS.test(`${titleText} ${h1Text}`) &&
    slugifyBrand(primaryBrand).length <= 5;

  const subBrands = brandNodes.filter(
    (b) => b.toLowerCase() !== primaryBrand.toLowerCase(),
  ).slice(0, 5);

  const finalConfidence = marketplaceMode ? Math.min(confidence, 0.75) : confidence;

  return BrandEntityResultSchema.parse({
    primaryBrand,
    aliases: buildBrandAliases(primaryBrand),
    confidence: finalConfidence,
    needsReview: finalConfidence < 0.8,
    sources,
    flags: {
      marketplaceMode,
      ambiguousGeneric,
      subBrands,
    },
    sameAsUrls: [...sameAsSet],
  });
}
