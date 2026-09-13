/**
 * Extraction service — entry point.
 *
 * Takes rendered HTML for one or more pages and returns AI-readable
 * structured representations. Per blueprint Section 4.2:
 *   "Transform webpages into AI-readable structured representations."
 */

import * as cheerio from 'cheerio';
import { logger } from '@shared/logger';
import { telemetry } from '@shared/telemetry';
import { extractMetadata } from './extractors/metadata';
import { extractHeadings } from './extractors/headings';
import { extractSchemas } from './extractors/schema';
import { extractFaqs } from './extractors/faq';
import { extractChunks } from './extractors/chunks';
import { extractLinks } from './extractors/links';
import { extractTables } from './extractors/tables';
import { extractAuthors } from './extractors/authors';
import { extractEntities } from './extractors/entities';
import { extractPageChecklist } from './extractors/checklist';
// Focused helper import avoids introducing unrelated barrel dependencies.
// eslint-disable-next-line no-restricted-imports
import { augmentLinksWithMarkup } from '@modules/brand-presence/collect-markup-links';
import type { PageExtraction } from './schemas';

const extractionLogger = logger.child({ module: 'extraction' });

export interface ExtractInput {
  url: string;
  html: string;
  /** When provided, use this as the body text for entity extraction. */
  textContent?: string;
}

export async function extractPage(input: ExtractInput): Promise<PageExtraction> {
  return telemetry.timed('extraction.run', async () => {
    const $full = cheerio.load(input.html);
    const links = augmentLinksWithMarkup(extractLinks($full, input.url), $full, input.url);

    const $ = cheerio.load(input.html);
    $('script, style, noscript, nav, footer, aside').remove();

    const metadata = extractMetadata(cheerio.load(input.html));
    const headings = extractHeadings($);
    const schemas = extractSchemas(cheerio.load(input.html));
    const faqs = extractFaqs($, schemas);
    const chunks = extractChunks($);
    const tables = extractTables($);
    const authors = extractAuthors($, schemas);

    const bodyText =
      input.textContent ?? $('body').text().replace(/\s+/g, ' ').trim().slice(0, 12_000);
    const title = metadata.title ?? '';

    const entities = await extractEntities({ url: input.url, title, bodyText, schemas });
    const checklist = extractPageChecklist($, headings, bodyText, input.url);

    extractionLogger.info(
      {
        url: input.url,
        chunks: chunks.length,
        faqs: faqs.length,
        schemas: schemas.length,
        entities: entities.length,
      },
      'page extracted',
    );

    return {
      url: input.url,
      metadata,
      headings,
      schemas,
      faqs,
      entities,
      chunks,
      links,
      tables,
      authors,
      checklist,
    };
  });
}

export const extractionService = {
  extractPage,
};
