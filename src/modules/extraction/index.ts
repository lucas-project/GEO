/**
 * Extraction module — public surface.
 */

export { extractionService, extractPage } from './service';
export { extractDiscoveryProbeSignals } from './probe-signals';
export type { DiscoveryProbeSignals } from './probe-signals';
export { emptyPageChecklist, emptyPageExtraction } from './empty-checklist';
export type { PageChecklistSignals } from './schemas';
export type {
  PageExtraction,
  PageMetadata,
  Heading,
  SchemaBlock,
  FaqEntry,
  Entity,
  EntitySource,
  SemanticChunk,
  LinkInfo,
  ComparisonTable,
  AuthorSignal,
} from './schemas';
export { SiteProfileSchema } from './site-profile-schema';
export type { SiteProfile } from './site-profile-schema';
export { buildSiteProfile } from './site-profile';
export { extractSchemas } from './extractors/schema';
export { extractMetadata } from './extractors/metadata';
