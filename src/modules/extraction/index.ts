/**
 * Extraction module — public surface.
 */

export { extractionService, extractPage } from './service';
export { extractDiscoveryProbeSignals } from './probe-signals';
export type { DiscoveryProbeSignals } from './probe-signals';
export type {
  PageExtraction,
  PageMetadata,
  Heading,
  SchemaBlock,
  FaqEntry,
  Entity,
  SemanticChunk,
  LinkInfo,
  ComparisonTable,
  AuthorSignal,
} from './schemas';
