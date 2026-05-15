/**
 * Extraction module — public surface.
 */

export { extractionService, extractPage } from './service';
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
