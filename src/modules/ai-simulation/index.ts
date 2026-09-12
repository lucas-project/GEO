/**
 * AI Simulation module — public surface (Phase 2).
 */

export {
  aiSimulationService,
  runSimulation,
  getSimulation,
  listRecentSimulations,
} from './service';
export { runSimulationBatch } from './batch';
export type { SimulationBatchResult, SimulationBatchResultItem } from './batch';
export { registerSimulationHandlers } from './handlers';
export { PLATFORMS } from './schemas';
export { PLATFORM_DISPLAY_NAMES } from './prompts/personas';
export { extractCitations } from './citation-tracker';
export { buildMockSimulationResponse } from './mock-responses';
export type { MockSimulationContext, MockSimPlatform } from './mock-responses';
export type {
  Platform,
  Citation,
  BrandMention,
  SimulationRun,
  SimulationResult,
} from './schemas';
